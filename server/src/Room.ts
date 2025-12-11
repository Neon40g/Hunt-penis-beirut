// ============================================
// ROOM - MANAGES A SINGLE GAME INSTANCE
// ============================================

import type { WebSocket } from 'uWebSockets.js';
import { GAME_CONSTANTS, type InputData, type HitEvent } from '@shooter/shared';
import { encodeSnapshot } from './protocol.js';
import { Player } from './Player.js';
import { GameMode } from './GameMode.js';
import { FreeForAllMode } from './FreeForAllMode.js';
import { generateObstacles, raycast, type Obstacle } from './physics.js';
import { CONFIG } from './config.js';

// WebSocket user data
export interface SocketData {
  playerId: number;
  roomId: string;
}

export class Room {
  readonly id: string;
  readonly maxPlayers: number;

  private players: Map<number, Player> = new Map();
  private gameMode: GameMode;
  private obstacles: Obstacle[];

  // Game loop state
  private tick: number = 0;
  private lastTickTime: number = 0;
  private tickInterval: NodeJS.Timeout | null = null;

  // Pre-allocated for zero-GC
  private snapshotHits: HitEvent[] = [];
  private readonly tickRate: number;
  private readonly tickDuration: number;

  // ID generation
  private nextPlayerId: number = 1;

  constructor(id: string, maxPlayers: number = CONFIG.MAX_PLAYERS_PER_ROOM) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.tickRate = CONFIG.TICK_RATE;
    this.tickDuration = 1000 / this.tickRate;

    // Generate map
    this.obstacles = generateObstacles(CONFIG.MAP_SEED);

    // Initialize game mode
    this.gameMode = new FreeForAllMode();

    console.log(`[Room ${id}] Created with ${this.obstacles.length} obstacles`);
  }

  // Start the game loop
  start(): void {
    if (this.tickInterval) return;

    this.lastTickTime = performance.now();
    this.tickInterval = setInterval(() => this.gameTick(), this.tickDuration);
    console.log(`[Room ${this.id}] Game loop started at ${this.tickRate}Hz`);
  }

  // Stop the game loop
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      console.log(`[Room ${this.id}] Game loop stopped`);
    }
  }

  // Add a player to the room
  addPlayer(name: string, ws: WebSocket<SocketData>): Player | null {
    if (this.players.size >= this.maxPlayers) {
      return null;
    }

    const id = this.nextPlayerId++;
    const player = new Player(id, name, ws);

    // Set socket data
    ws.getUserData().playerId = id;
    ws.getUserData().roomId = this.id;

    this.players.set(id, player);
    this.gameMode.onPlayerJoin(player, this.obstacles);

    // Start game loop if first player
    if (this.players.size === 1) {
      this.start();
    }

    return player;
  }

  // Remove a player from the room
  removePlayer(playerId: number): void {
    const player = this.players.get(playerId);
    if (player) {
      this.gameMode.onPlayerLeave(player);
      this.players.delete(playerId);

      // Stop game loop if empty
      if (this.players.size === 0) {
        this.stop();
      }
    }
  }

  // Process player input
  processInput(playerId: number, input: InputData): void {
    const player = this.players.get(playerId);
    if (!player) return;

    // Queue input for processing in next tick
    player.pendingInputs.push(input);
  }

  // Main game tick
  private gameTick(): void {
    this.lastTickTime = performance.now();
    this.tick++;

    // Use fixed deltaTime for consistent physics (1 / configured tick rate)
    // This ensures server and client physics match regardless of actual tick timing
    const fixedDeltaTime = 1 / this.tickRate;

    // Clear hit events
    this.snapshotHits.length = 0;

    // Process all pending inputs
    for (const player of this.players.values()) {
      // Process queued inputs - each input gets fixed deltaTime
      for (const input of player.pendingInputs) {
        player.processInput(input, fixedDeltaTime, this.obstacles);

        // SUB-TICK SHOOTING
        if (input.shoot) {
          // Validate timestamp (clamp to reasonable window to prevent speedhacks/lagswitch)
          const now = Date.now();
          const maxLag = CONFIG.MAX_LAG_COMPENSATION;
          let shootTime = input.timestamp;

          if (shootTime < now - maxLag) shootTime = now - maxLag;
          if (shootTime > now) shootTime = now;

          this.handleShoot(player, shootTime);
        }
      }
      player.pendingInputs.length = 0;

      // Save history for lag compensation (End of tick state)
      player.saveHistory(Date.now());
    }

    // Handle respawns
    this.processRespawns();

    // Game mode specific logic
    this.gameMode.tick(this.players, fixedDeltaTime);

    // Check for game end
    if (this.gameMode.shouldEndGame(this.players)) {
      this.handleGameEnd();
    }

    // Broadcast world state
    this.broadcastSnapshot();
  }

  // Process shooting for a single player with lag compensation
  private handleShoot(shooter: Player, shootTime: number): void {
    // Check fire rate (using server time to prevent hacks)
    // We allow a small buffer for network jitter
    if (!shooter.canShoot(Date.now())) return;

    // Rewind to the time the player undoubtedly saw the target
    // We trust the client's timestamp (clamped in gameTick)
    const rewindTime = shootTime;

    const weapon = GAME_CONSTANTS.WEAPONS[shooter.weapon];

    // Handle Multi-Shot (Shotgun)
    const bulletCount = weapon.bulletCount || 1;

    for (let i = 0; i < bulletCount; i++) {
      const origin = shooter.getEyePosition();
      let direction = shooter.getLookDirection();

      // Apply Spread
      if (weapon.spread > 0) {
        direction.x += (Math.random() - 0.5) * weapon.spread;
        direction.y += (Math.random() - 0.5) * weapon.spread;
        direction.z += (Math.random() - 0.5) * weapon.spread;

        // Renormalize
        const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
        direction.x /= len;
        direction.y /= len;
        direction.z /= len;
      }

      // Check hits against other players with LAG COMPENSATION
      let hitPlayer: Player | null = null;
      let hitDistance: number = weapon.range;
      let isHeadshot = false;

      for (const target of this.players.values()) {
        if (target.id === shooter.id || target.isDead) continue;

        // REWIND: Get target position at the time the shooter likely saw them
        const pastPos = target.getPositionAt(rewindTime);
        if (!pastPos) continue; // Too new or error

        // Create temp target with past position for collision check
        const ghostTarget = Object.create(target);
        ghostTarget.x = pastPos.x;
        ghostTarget.y = pastPos.y;
        ghostTarget.z = pastPos.z;
        // Also rewind rotation if needed for head hitbox, but mainly position

        // Simple sphere-ray intersection for player hitbox
        const result = this.checkPlayerHit(origin, direction, ghostTarget, weapon.range);
        if (result.hit && result.distance < hitDistance) {
          hitPlayer = target; // The actual target
          hitDistance = result.distance;
          isHeadshot = result.headshot;
        }
      }

      // Check if ray hits obstacle before player
      const obstacleHit = raycast(origin, direction, hitDistance, this.obstacles);
      if (obstacleHit.hit && obstacleHit.distance < hitDistance) {
        hitPlayer = null; // Blocked by obstacle
      }

      // Apply damage
      if (hitPlayer) {
        const damage = isHeadshot ? weapon.damage * 2 : weapon.damage;
        const killed = hitPlayer.takeDamage(damage, shooter.id);

        this.snapshotHits.push({
          shooterId: shooter.id,
          targetId: hitPlayer.id,
          damage,
          headshot: isHeadshot
        });

        if (killed) {
          this.gameMode.onPlayerKill(shooter, hitPlayer, isHeadshot);
          this.gameMode.onPlayerDeath(hitPlayer, shooter.id);
        }
      }
    }
  }

  // Check if ray hits a player
  private checkPlayerHit(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    target: Player,
    maxDistance: number
  ): { hit: boolean; distance: number; headshot: boolean } {
    // Body hitbox (cylinder approximation as sphere)
    const bodyRadius = GAME_CONSTANTS.PLAYER_RADIUS;
    const bodyCenter = {
      x: target.x,
      y: target.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      z: target.z
    };

    // Head hitbox
    const headRadius = GAME_CONSTANTS.HEAD_HEIGHT;
    const headCenter = {
      x: target.x,
      y: target.y + GAME_CONSTANTS.PLAYER_HEIGHT - headRadius,
      z: target.z
    };

    // Check head first (headshots)
    const headHit = this.raySphereIntersect(origin, direction, headCenter, headRadius, maxDistance);
    if (headHit.hit) {
      return { hit: true, distance: headHit.distance, headshot: true };
    }

    // Check body
    const bodyHit = this.raySphereIntersect(origin, direction, bodyCenter, bodyRadius * 1.5, maxDistance);
    if (bodyHit.hit) {
      return { hit: true, distance: bodyHit.distance, headshot: false };
    }

    return { hit: false, distance: Infinity, headshot: false };
  }

  // Ray-sphere intersection
  private raySphereIntersect(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    center: { x: number; y: number; z: number },
    radius: number,
    maxDistance: number
  ): { hit: boolean; distance: number } {
    const dx = origin.x - center.x;
    const dy = origin.y - center.y;
    const dz = origin.z - center.z;

    const a = direction.x * direction.x + direction.y * direction.y + direction.z * direction.z;
    const b = 2 * (dx * direction.x + dy * direction.y + dz * direction.z);
    const c = dx * dx + dy * dy + dz * dz - radius * radius;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      return { hit: false, distance: Infinity };
    }

    const t = (-b - Math.sqrt(discriminant)) / (2 * a);

    if (t > 0 && t < maxDistance) {
      return { hit: true, distance: t };
    }

    return { hit: false, distance: Infinity };
  }

  // Handle respawns
  private processRespawns(): void {
    const now = Date.now();

    for (const player of this.players.values()) {
      if (player.isDead && player.respawnTime > 0 && now >= player.respawnTime) {
        const pos = this.gameMode.getSpawnPosition(player, this.obstacles);
        player.x = pos.x;
        player.y = pos.y;
        player.z = pos.z;
        player.health = GAME_CONSTANTS.MAX_HEALTH;
        player.isDead = false;
        player.respawnTime = 0;
        console.log(`[Room ${this.id}] ${player.name} respawned`);
      }
    }
  }

  // Broadcast world snapshot to all players
  private broadcastSnapshot(): void {
    for (const player of this.players.values()) {
      if (!player.ws) continue;

      const playerStates = Array.from(this.players.values()).map(p => p.getState());

      try {
        const buffer = encodeSnapshot(
          this.tick,
          Date.now(),
          playerStates,
          this.snapshotHits,
          player.lastProcessedInput
        );
        player.ws.send(buffer, true);
      } catch (e) {
        // Socket closed
      }
    }
  }

  // Handle game end
  private handleGameEnd(): void {
    const winners = this.gameMode.getWinners(this.players);
    console.log(`[Room ${this.id}] Game ended. Winners: ${winners.map(p => p.name).join(', ')}`);

    // Reset game
    this.tick = 0;
    for (const player of this.players.values()) {
      player.score = 0;
      player.kills = 0;
      player.deaths = 0;
      player.spawn(this.obstacles);
    }
  }

  // Get player count
  get playerCount(): number {
    return this.players.size;
  }

  // Check if room is full
  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  // Get all players
  getPlayers(): Player[] {
    return Array.from(this.players.values());
  }
}

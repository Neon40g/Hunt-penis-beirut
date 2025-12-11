// ============================================
// PLAYER CLASS
// ============================================

import type { WebSocket } from 'uWebSockets.js';
import { GAME_CONSTANTS, type InputData, type PlayerState, type Vec3 } from '@shooter/shared';
import { applyPhysics, type Obstacle } from './physics.js';
import type { SocketData } from './Room.js';

export class Player {
  id: number;
  name: string;
  ws: WebSocket<SocketData> | null;

  // Position
  x: number = 0;
  y: number = 0;
  z: number = 0;

  // Velocity
  vx: number = 0;
  vy: number = 0;
  vz: number = 0;

  // Rotation
  yaw: number = 0;
  pitch: number = 0;

  // State
  health: number = GAME_CONSTANTS.MAX_HEALTH;
  isDead: boolean = false;
  respawnTime: number = 0;

  // Game stats
  score: number = 0;
  kills: number = 0;
  deaths: number = 0;

  // Weapon
  weapon: number = 0;
  isShooting: boolean = false;
  lastShootTime: number = 0;

  // Input processing
  pendingInputs: InputData[] = [];
  lastProcessedInput: number = 0;

  // State flags for physics
  grounded: boolean = false;

  // Circular Buffer for Lag Compensation
  private static readonly HISTORY_CAPACITY = 300; // 5 seconds at 60 TPS
  private historyX = new Float32Array(Player.HISTORY_CAPACITY);
  private historyY = new Float32Array(Player.HISTORY_CAPACITY);
  private historyZ = new Float32Array(Player.HISTORY_CAPACITY);
  private historyTime = new Float64Array(Player.HISTORY_CAPACITY);
  private historyHead = 0;
  private historySize = 0;

  constructor(id: number, name: string, ws: WebSocket<SocketData>) {
    this.id = id;
    this.name = name;
    this.ws = ws;
  }

  spawn(obstacles: Obstacle[]): void {
    this.health = GAME_CONSTANTS.MAX_HEALTH;
    this.isDead = false;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.isShooting = false;
    this.respawnTime = 0;

    // Clear history on spawn
    this.historySize = 0;
    this.historyHead = 0;

    // Random safe position (simple implementation)
    const mapSize = GAME_CONSTANTS.MAP_SIZE;
    const halfMap = mapSize / 2 - 2;

    this.x = (Math.random() - 0.5) * halfMap * 2;
    this.z = (Math.random() - 0.5) * halfMap * 2;
    this.y = 5; // Start in air to avoid getting stuck
  }

  processInput(input: InputData, deltaTime: number, obstacles: Obstacle[]): void {
    if (this.isDead) return;

    // Update rotation
    this.yaw = input.yaw;
    this.pitch = input.pitch;

    // Update weapon state
    this.weapon = input.weapon;
    this.isShooting = input.shoot;

    // Calculate movement
    // -----------------
    const speed = input.sprint ? GAME_CONSTANTS.MOVE_SPEED * GAME_CONSTANTS.SPRINT_MULTIPLIER :
      input.sneak ? GAME_CONSTANTS.MOVE_SPEED * GAME_CONSTANTS.SNEAK_MULTIPLIER :
        GAME_CONSTANTS.MOVE_SPEED;

    // Input direction (local)
    let dx = 0;
    let dz = 0;

    if (input.forward) dz += 1;
    if (input.backward) dz -= 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    // Normalize if moving diagonally
    if (dx !== 0 || dz !== 0) {
      const len = Math.sqrt(dx * dx + dz * dz);
      dx /= len;
      dz /= len;
    }

    // Rotate to world space (using yaw)
    // Matches client-side logic exactly to prevent reconciliation snaps
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    // Forward vector: (sin, 0, cos)
    // Right vector: (cos, 0, -sin)
    const moveX = (dx * cos + dz * sin) * speed;
    const moveZ = (-dx * sin + dz * cos) * speed;

    // Apply horizontal velocity (instant response)
    this.vx = moveX;
    this.vz = moveZ;

    // Jump
    if (input.jump && this.grounded) {
      this.vy = GAME_CONSTANTS.JUMP_FORCE;
      this.grounded = false;
    }

    // Apply physics (gravity, collision)
    const currentPos = { x: this.x, y: this.y, z: this.z };
    const currentVel = { x: this.vx, y: this.vy, z: this.vz };

    // applyPhysics handles gravity and collision response
    const result = applyPhysics(currentPos, currentVel, deltaTime, obstacles);

    // Update state
    this.x = result.position.x;
    this.y = result.position.y;
    this.z = result.position.z;

    this.vx = result.velocity.x;
    this.vy = result.velocity.y;
    this.vz = result.velocity.z;

    this.grounded = result.grounded;

    this.lastProcessedInput = input.seq;
  }

  canShoot(currentTime: number): boolean {
    if (this.isDead) return false;
    if (!this.isShooting) return false;

    const weaponConfig = GAME_CONSTANTS.WEAPONS[this.weapon];
    if (!weaponConfig) return false;

    // Check fire rate
    if (currentTime - this.lastShootTime >= weaponConfig.fireRate) {
      this.lastShootTime = currentTime;
      return true;
    }

    return false;
  }

  takeDamage(damage: number, attackerId: number): boolean {
    if (this.isDead) return false;

    this.health -= damage;

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.deaths++;
      return true; // Killed
    }

    return false;
  }

  getEyePosition(): Vec3 {
    return {
      x: this.x,
      y: this.y + GAME_CONSTANTS.PLAYER_HEIGHT - 0.2, // Slightly below top of head
      z: this.z
    };
  }

  saveHistory(timestamp: number): void {
    const idx = this.historyHead;
    this.historyX[idx] = this.x;
    this.historyY[idx] = this.y;
    this.historyZ[idx] = this.z;
    this.historyTime[idx] = timestamp;

    this.historyHead = (this.historyHead + 1) % Player.HISTORY_CAPACITY;
    if (this.historySize < Player.HISTORY_CAPACITY) {
      this.historySize++;
    }
  }

  getPositionAt(timestamp: number): Vec3 | null {
    if (this.historySize === 0) return null;

    // Search backwards from head-1
    // Head points to next empty slot, so head-1 is newest
    let idx = (this.historyHead - 1 + Player.HISTORY_CAPACITY) % Player.HISTORY_CAPACITY;

    // Check if timestamp is newer than latest snapshot
    if (timestamp >= this.historyTime[idx]) {
      return { x: this.historyX[idx], y: this.historyY[idx], z: this.historyZ[idx] };
    }

    for (let i = 0; i < this.historySize - 1; i++) {
      const currIdx = idx;
      const prevIdx = (idx - 1 + Player.HISTORY_CAPACITY) % Player.HISTORY_CAPACITY;

      const currTime = this.historyTime[currIdx];
      const prevTime = this.historyTime[prevIdx];

      if (timestamp <= currTime && timestamp >= prevTime) {
        // Interpolate
        const t = (timestamp - prevTime) / (currTime - prevTime);
        return {
          x: this.historyX[prevIdx] + (this.historyX[currIdx] - this.historyX[prevIdx]) * t,
          y: this.historyY[prevIdx] + (this.historyY[currIdx] - this.historyY[prevIdx]) * t,
          z: this.historyZ[prevIdx] + (this.historyZ[currIdx] - this.historyZ[prevIdx]) * t
        };
      }

      idx = prevIdx;

      // Optimization: if we are way past the time, stop
      if (currTime < timestamp - 1000) break; // Should have found it by now
    }

    // Too old, return oldest
    return { x: this.historyX[idx], y: this.historyY[idx], z: this.historyZ[idx] };
  }

  getLookDirection(): Vec3 {
    // Convert pitch/yaw to normalized direction vector
    // pitch rotates around X, yaw around Y
    // Consistent with Forward=+Z
    return {
      x: Math.sin(this.yaw) * Math.cos(this.pitch),
      y: -Math.sin(this.pitch), // Pitch is inverted (Negative = Up, Positive = Down from client)
      z: Math.cos(this.yaw) * Math.cos(this.pitch)
    };
  }

  getState(): PlayerState {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      z: this.z,
      vx: this.vx,
      vy: this.vy,
      vz: this.vz,
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      weapon: this.weapon,
      isShooting: this.isShooting,
      isDead: this.isDead,
      score: this.score
    };
  }
}

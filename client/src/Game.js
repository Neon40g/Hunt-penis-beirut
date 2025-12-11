// ============================================
// GAME CLASS - BABYLON.JS + NETWORKING
// ============================================

import * as BABYLON from '@babylonjs/core';
import { NetworkManager } from './NetworkManager.js';
import { InputManager } from './InputManager.js';
import { PlayerController } from './PlayerController.js';
import { WorldRenderer } from './WorldRenderer.js';

// Game constants (must match server)
const GAME_CONSTANTS = {
  TICK_RATE: 20,
  MOVE_SPEED: 5.0,
  SPRINT_MULTIPLIER: 1.6,
  SNEAK_MULTIPLIER: 0.5,
  JUMP_FORCE: 8.0,
  GRAVITY: 20.0,
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.4,
  HEAD_HEIGHT: 0.3,
  MAX_HEALTH: 100,
  RESPAWN_TIME: 2000,
  INTERPOLATION_BUFFER: 100,
  WEAPONS: [
    { name: 'Pistol', damage: 25, fireRate: 400, range: 100 },
    { name: 'SMG', damage: 15, fireRate: 100, range: 50 },
    { name: 'Rifle', damage: 35, fireRate: 150, range: 150 },
    { name: 'Shotgun', damage: 80, fireRate: 800, range: 20 }
  ],
  MAP_SIZE: 50,
  OBSTACLE_COUNT: 40
};

export class Game {
  constructor(canvas, wsUrl) {
    this.canvas = canvas;
    this.wsUrl = wsUrl;

    // Babylon.js
    this.engine = null;
    this.scene = null;
    this.camera = null;

    // Managers
    this.network = null;
    this.input = null;
    this.playerController = null;
    this.worldRenderer = null;

    // Game state
    this.playerId = 0;
    this.mapSeed = 0;
    this.tickRate = 20;
    this.isConnected = false;
    this.isDead = false;

    // Fixed timestep accumulator for physics
    this.physicsAccumulator = 0;
    this.fixedDeltaTime = 1 / GAME_CONSTANTS.TICK_RATE;

    // Players
    this.players = new Map(); // id -> { mesh, state, interpolation }

    // HUD elements
    this.hudElements = {
      healthFill: document.getElementById('healthFill'),
      weaponName: document.getElementById('weaponName'),
      weaponSlots: document.querySelectorAll('.weapon-slot'),
      scoreList: document.getElementById('scoreList'),
      deathScreen: document.getElementById('death-screen'),
      respawnTimer: document.getElementById('respawnTimer')
    };
  }

  async init() {
    // Create Babylon.js engine
    this.engine = new BABYLON.Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true
    });

    // Create scene
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.15, 1);

    // Enable collision detection
    this.scene.collisionsEnabled = true;

    // Create FPS camera
    this.camera = new BABYLON.UniversalCamera(
      'camera',
      new BABYLON.Vector3(0, GAME_CONSTANTS.PLAYER_HEIGHT, 0),
      this.scene
    );
    this.camera.minZ = 0.1;
    this.camera.fov = 1.2; // ~70 degrees
    this.camera.inertia = 0;
    this.camera.angularSensibility = 500;

    // Setup lighting
    const light = new BABYLON.HemisphericLight(
      'light',
      new BABYLON.Vector3(0.5, 1, 0.3),
      this.scene
    );
    light.intensity = 0.8;

    const dirLight = new BABYLON.DirectionalLight(
      'dirLight',
      new BABYLON.Vector3(-0.5, -1, -0.3),
      this.scene
    );
    dirLight.intensity = 0.5;

    // Create managers
    this.input = new InputManager(this.canvas, this.camera);
    this.worldRenderer = new WorldRenderer(this.scene, GAME_CONSTANTS);
    this.playerController = new PlayerController(
      this.camera,
      this.scene,
      GAME_CONSTANTS,
      this.worldRenderer.obstacles
    );

    // Create network manager
    this.network = new NetworkManager(this.wsUrl);
    this.setupNetworkHandlers();

    // Start render loop
    this.engine.runRenderLoop(() => {
      this.update();
      this.scene.render();
    });

    // Handle resize
    window.addEventListener('resize', () => {
      this.engine.resize();
    });

    console.log('[Game] Initialized');
  }

  setupNetworkHandlers() {
    this.network.onWelcome = (data) => {
      this.playerId = data.playerId;
      this.tickRate = data.tickRate;
      this.mapSeed = data.mapSeed;
      this.isConnected = true;

      // Regenerate world with correct seed
      this.worldRenderer.generateWorld(data.mapSeed);
      this.playerController.obstacles = this.worldRenderer.obstacles;

      // Update physics timestep to match server
      this.fixedDeltaTime = 1 / this.tickRate;
      this.playerController.fixedDeltaTime = this.fixedDeltaTime;

      console.log(`[Game] Joined as player ${this.playerId}, TickRate: ${this.tickRate}`);
    };

    this.network.onSnapshot = (snapshot) => {
      this.processSnapshot(snapshot);
    };

    this.network.onDisconnect = () => {
      this.isConnected = false;
      console.log('[Game] Disconnected');
    };
  }

  connect(playerName) {
    this.network.connect(playerName);
  }

  lockPointer() {
    this.canvas.requestPointerLock();
  }

  update() {
    if (!this.isConnected) return;

    const frameTime = this.engine.getDeltaTime() / 1000;

    // Get input state (sampled once per frame)
    const inputState = this.input.getState();

    // Accumulate time for fixed timestep physics
    this.physicsAccumulator += frameTime;

    // Cap accumulator to prevent spiral of death
    if (this.physicsAccumulator > this.fixedDeltaTime * 5) {
      this.physicsAccumulator = this.fixedDeltaTime * 5;
    }

    // Run physics in fixed timesteps (matching server tick rate)
    while (this.physicsAccumulator >= this.fixedDeltaTime) {
      this.physicsAccumulator -= this.fixedDeltaTime;

      // Build the full input with rotation for storage and sending
      const seq = this.network.inputSequence++;
      const fullInput = {
        seq,
        forward: inputState.forward,
        backward: inputState.backward,
        left: inputState.left,
        right: inputState.right,
        jump: inputState.jump,
        sprint: inputState.sprint,
        sneak: inputState.sneak,
        shoot: inputState.shoot,
        weapon: inputState.weapon,
        yaw: this.camera.rotation.y,
        pitch: this.camera.rotation.x,
        timestamp: Date.now()
      };

      // Update local player (client-side prediction)
      if (!this.isDead) {
        // Store input BEFORE applying (for reconciliation)
        // Use fixed deltaTime to match server physics exactly
        this.playerController.storeInput(fullInput, seq, this.fixedDeltaTime);

        // Apply input locally with fixed timestep
        this.playerController.update(inputState, this.fixedDeltaTime);

        // Handle shooting effects
        if (inputState.shoot) {
          this.handleLocalShoot(inputState.weapon);
        }
      }

      // Send input to server (one input per physics tick)
      this.network.sendInput(fullInput);
    }

    // Update camera position (every frame for smooth visuals)
    if (!this.isDead) {
      // Interpolate between previous and current physics state
      const alpha = this.physicsAccumulator / this.fixedDeltaTime;
      const pos = this.playerController.getInterpolatedPosition(alpha);

      this.camera.position.x = pos.x;
      this.camera.position.y = pos.y + GAME_CONSTANTS.PLAYER_HEIGHT - 0.2;
      this.camera.position.z = pos.z;
    }

    // Interpolate other players
    this.interpolatePlayers();

    // Update HUD
    this.updateHUD(inputState.weapon);
  }

  processSnapshot(snapshot) {
    const now = Date.now();

    for (const playerState of snapshot.players) {
      if (playerState.id === this.playerId) {
        // Local player - reconcile
        this.reconcileLocalPlayer(playerState, snapshot.lastProcessedInput);
        this.updateLocalPlayerState(playerState);
      } else {
        // Remote player - add to interpolation buffer
        this.updateRemotePlayer(playerState, now);
      }
    }

    // Process hit events for visual feedback
    for (const hit of snapshot.hits) {
      if (hit.shooterId === this.playerId) {
        // We hit someone - show hit marker on crosshair
        this.showHitMarker(hit.headshot);
      }
      if (hit.targetId === this.playerId) {
        // We got hit - show damage indicator
        this.showDamageIndicator(hit.damage);
      }
      // Show hit effect on target player
      const targetPlayer = this.players.get(hit.targetId);
      if (targetPlayer && targetPlayer.mesh) {
        this.worldRenderer.createHitMarker(
          {
            x: targetPlayer.mesh.position.x,
            y: targetPlayer.mesh.position.y + GAME_CONSTANTS.PLAYER_HEIGHT * 0.7,
            z: targetPlayer.mesh.position.z
          },
          hit.headshot
        );
      }
    }

    // Remove disconnected players
    const activeIds = new Set(snapshot.players.map(p => p.id));
    for (const [id, player] of this.players) {
      if (!activeIds.has(id)) {
        player.mesh.dispose();
        this.players.delete(id);
      }
    }

    // Update scoreboard
    this.updateScoreboard(snapshot.players);
  }

  showHitMarker(headshot) {
    // Flash crosshair red for hits
    const crosshair = document.querySelector('.crosshair');
    if (crosshair) {
      crosshair.style.filter = headshot ? 'drop-shadow(0 0 5px red)' : 'drop-shadow(0 0 3px yellow)';
      setTimeout(() => { crosshair.style.filter = ''; }, 150);
    }
  }

  showDamageIndicator(damage) {
    // Flash screen red when taking damage
    const canvas = this.canvas;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(transparent 50%, rgba(255,0,0,${damage / 200}));
      pointer-events: none; z-index: 40;
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 200);
  }

  handleLocalShoot(weaponIndex) {
    const now = Date.now();
    const weapon = GAME_CONSTANTS.WEAPONS[weaponIndex] || GAME_CONSTANTS.WEAPONS[0];

    // Check fire rate
    if (!this.lastShootTime) this.lastShootTime = 0;
    if (now - this.lastShootTime < weapon.fireRate) return;
    this.lastShootTime = now;

    // Muzzle flash position
    const flashPos = this.camera.position.clone();
    const forward = this.camera.getDirection(BABYLON.Vector3.Forward());
    const right = this.camera.getDirection(BABYLON.Vector3.Right());

    // Offset slightly right and down (weapon position)
    flashPos.addInPlace(forward.scale(0.5));
    flashPos.addInPlace(right.scale(0.2));
    flashPos.y -= 0.15;

    this.worldRenderer.createMuzzleFlash(
      { x: flashPos.x, y: flashPos.y, z: flashPos.z },
      { x: forward.x, y: forward.y, z: forward.z }
    );

    // Create Tracers (multiple for shotgun)
    const bulletCount = weapon.bulletCount || 1;
    for (let i = 0; i < bulletCount; i++) {
      // Calculate spread
      const spread = weapon.spread || 0;
      const dir = forward.clone();
      if (spread > 0) {
        dir.x += (Math.random() - 0.5) * spread;
        dir.y += (Math.random() - 0.5) * spread;
        dir.z += (Math.random() - 0.5) * spread;
        dir.normalize();
      }

      // Raycast for visual tracer end
      const ray = new BABYLON.Ray(this.camera.position, dir, weapon.range);
      const hit = this.scene.pickWithRay(ray, (mesh) => {
        return mesh.checkCollisions; // Only hit collideable things
      });

      const endPos = hit.pickedPoint || ray.origin.add(ray.direction.scale(weapon.range));

      // Spawn tracer from GUN position (flashPos) to hit position
      this.worldRenderer.createTracer(
        { x: flashPos.x, y: flashPos.y, z: flashPos.z },
        { x: endPos.x, y: endPos.y, z: endPos.z },
        new BABYLON.Color3(0, 1, 0) // Green for local
      );
    }

    // Screen shake removed as per user request
    // const shakeAmount = 0.02;
    // this.camera.rotation.x -= shakeAmount;
    // setTimeout(() => {
    //   if (this.camera) this.camera.rotation.x += shakeAmount;
    // }, 50);
  }

  reconcileLocalPlayer(serverState, lastProcessedInput) {
    // Use proper server reconciliation with input replay
    const serverPosition = { x: serverState.x, y: serverState.y, z: serverState.z };
    const serverVelocity = { x: serverState.vx, y: serverState.vy, z: serverState.vz };
    const serverGrounded = serverState.y <= 0.01; // Approximate grounded state

    this.playerController.reconcile(
      serverPosition,
      serverVelocity,
      serverGrounded,
      lastProcessedInput
    );
  }

  updateLocalPlayerState(state) {
    // Update death state
    if (state.isDead && !this.isDead) {
      this.onDeath();
    } else if (!state.isDead && this.isDead) {
      this.onRespawn(state);
    }

    this.isDead = state.isDead;

    // Update health
    const healthPercent = (state.health / GAME_CONSTANTS.MAX_HEALTH) * 100;
    this.hudElements.healthFill.style.width = `${healthPercent}%`;
  }

  updateRemotePlayer(state, timestamp) {
    let playerData = this.players.get(state.id);

    if (!playerData) {
      // Create new player mesh
      const mesh = this.worldRenderer.createPlayerMesh(state.id);
      playerData = {
        mesh,
        states: [],
        lastState: state
      };
      this.players.set(state.id, playerData);
    }

    // Add to interpolation buffer
    playerData.states.push({
      state,
      timestamp
    });

    // Keep only last 1 second of states
    while (playerData.states.length > 0 &&
      timestamp - playerData.states[0].timestamp > 1000) {
      playerData.states.shift();
    }

    playerData.lastState = state;

    // Update visibility based on death
    playerData.mesh.isVisible = !state.isDead;

    // Handle remote shooting
    if (state.isShooting && !state.isDead) {
      this.handleRemoteShoot(playerData, state.weapon);
    }
  }

  handleRemoteShoot(playerData, weaponIndex) {
    const now = Date.now();
    const weapon = GAME_CONSTANTS.WEAPONS[weaponIndex] || GAME_CONSTANTS.WEAPONS[0];

    // Limit visual fire rate
    if (!playerData.lastShootTime) playerData.lastShootTime = 0;
    if (now - playerData.lastShootTime < weapon.fireRate) return;
    playerData.lastShootTime = now;

    // Calculate gun position (approximate)
    const mesh = playerData.mesh;

    // Calculate direction from state (Forward = +Z)
    const forward = new BABYLON.Vector3(
      Math.sin(playerData.lastState.yaw) * Math.cos(playerData.lastState.pitch),
      -Math.sin(playerData.lastState.pitch),
      Math.cos(playerData.lastState.yaw) * Math.cos(playerData.lastState.pitch)
    );
    forward.normalize();

    const right = new BABYLON.Vector3(
      Math.cos(playerData.lastState.yaw),
      0,
      -Math.sin(playerData.lastState.yaw)
    );

    const start = mesh.position.clone();
    start.y += GAME_CONSTANTS.PLAYER_HEIGHT * 0.7; // Shoulder height
    start.addInPlace(forward.scale(0.5));
    start.addInPlace(right.scale(0.2));

    // Muzzle flash
    this.worldRenderer.createMuzzleFlash(
      { x: start.x, y: start.y, z: start.z },
      { x: forward.x, y: forward.y, z: forward.z }
    );

    // Tracers
    const bulletCount = weapon.bulletCount || 1;
    for (let i = 0; i < bulletCount; i++) {
      const spread = weapon.spread || 0;
      const dir = forward.clone();
      if (spread > 0) {
        dir.x += (Math.random() - 0.5) * spread;
        dir.y += (Math.random() - 0.5) * spread;
        dir.z += (Math.random() - 0.5) * spread;
        dir.normalize();
      }

      const end = start.add(dir.scale(weapon.range));

      this.worldRenderer.createTracer(
        { x: start.x, y: start.y, z: start.z },
        { x: end.x, y: end.y, z: end.z },
        new BABYLON.Color3(1, 0, 0) // Red for enemy
      );
    }
  }

  interpolatePlayers() {
    const now = Date.now();
    const renderTime = now - GAME_CONSTANTS.INTERPOLATION_BUFFER;

    for (const [id, playerData] of this.players) {
      if (playerData.states.length < 2) {
        // Not enough data - smoothly lerp to last known state
        if (playerData.lastState) {
          const lerpFactor = 0.2; // Smooth transition
          playerData.mesh.position.x += (playerData.lastState.x - playerData.mesh.position.x) * lerpFactor;
          playerData.mesh.position.y += (playerData.lastState.y - playerData.mesh.position.y) * lerpFactor;
          playerData.mesh.position.z += (playerData.lastState.z - playerData.mesh.position.z) * lerpFactor;
          playerData.mesh.rotation.y = this.lerpAngle(playerData.mesh.rotation.y, playerData.lastState.yaw + Math.PI, lerpFactor);
        }
        continue;
      }

      // Find two states to interpolate between
      let fromState = null;
      let toState = null;

      for (let i = 0; i < playerData.states.length - 1; i++) {
        if (playerData.states[i].timestamp <= renderTime &&
          playerData.states[i + 1].timestamp >= renderTime) {
          fromState = playerData.states[i];
          toState = playerData.states[i + 1];
          break;
        }
      }

      if (fromState && toState) {
        // Interpolate between two known states
        const total = toState.timestamp - fromState.timestamp;
        const progress = total > 0 ? (renderTime - fromState.timestamp) / total : 0;
        const t = Math.max(0, Math.min(1, progress));

        // Position interpolation
        const targetX = fromState.state.x + (toState.state.x - fromState.state.x) * t;
        const targetY = fromState.state.y + (toState.state.y - fromState.state.y) * t;
        const targetZ = fromState.state.z + (toState.state.z - fromState.state.z) * t;

        // Smooth lerp to target (reduces jitter)
        const smoothFactor = 0.3;
        playerData.mesh.position.x += (targetX - playerData.mesh.position.x) * smoothFactor;
        playerData.mesh.position.y += (targetY - playerData.mesh.position.y) * smoothFactor;
        playerData.mesh.position.z += (targetZ - playerData.mesh.position.z) * smoothFactor;

        // Angle interpolation with proper wrap-around handling
        const targetYaw = this.lerpAngle(fromState.state.yaw, toState.state.yaw, t);
        playerData.mesh.rotation.y = this.lerpAngle(playerData.mesh.rotation.y, targetYaw + Math.PI, smoothFactor);

        // Pitch interpolation (Head rotation)
        const interpolatedPitch = fromState.state.pitch + (toState.state.pitch - fromState.state.pitch) * t;
        if (playerData.mesh.metadata && playerData.mesh.metadata.head) {
          // Smoothly interpolate pitch, negating the server pitch for correct visual rotation
          const currentPitch = playerData.mesh.metadata.head.rotation.x;
          const targetMeshPitch = -interpolatedPitch; // Negate server pitch
          playerData.mesh.metadata.head.rotation.x = currentPitch + (targetMeshPitch - currentPitch) * smoothFactor;
        }
      } else if (playerData.states.length >= 2) {
        // Extrapolate using velocity from last two states
        const lastIdx = playerData.states.length - 1;
        const prevState = playerData.states[lastIdx - 1];
        const lastState = playerData.states[lastIdx];
        const dt = (lastState.timestamp - prevState.timestamp) / 1000;

        if (dt > 0) {
          // Calculate velocity
          const vx = (lastState.state.x - prevState.state.x) / dt;
          const vy = (lastState.state.y - prevState.state.y) / dt;
          const vz = (lastState.state.z - prevState.state.z) / dt;

          // Extrapolate position (limit extrapolation to avoid wild predictions)
          const extrapolateTime = Math.min((now - lastState.timestamp) / 1000, 0.2);
          const targetX = lastState.state.x + vx * extrapolateTime;
          const targetY = lastState.state.y + vy * extrapolateTime;
          const targetZ = lastState.state.z + vz * extrapolateTime;

          // Smooth lerp to extrapolated position
          const smoothFactor = 0.2;
          playerData.mesh.position.x += (targetX - playerData.mesh.position.x) * smoothFactor;
          playerData.mesh.position.y += (targetY - playerData.mesh.position.y) * smoothFactor;
          playerData.mesh.position.z += (targetZ - playerData.mesh.position.z) * smoothFactor;
          playerData.mesh.rotation.y = this.lerpAngle(playerData.mesh.rotation.y, lastState.state.yaw + Math.PI, smoothFactor);

          // Extrapolate pitch? Probably better to just hold last known pitch to avoid neck snapping
          if (playerData.mesh.metadata && playerData.mesh.metadata.head) {
            playerData.mesh.metadata.head.rotation.x = -lastState.state.pitch; // Negated
          }
        }
      }
    }
  }

  // Helper: Lerp angle with wrap-around handling
  lerpAngle(from, to, t) {
    let diff = to - from;
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return from + diff * t;
  }

  updateHUD(currentWeapon) {
    // Update weapon display
    const weapon = GAME_CONSTANTS.WEAPONS[currentWeapon];
    this.hudElements.weaponName.textContent = weapon.name;

    // Update weapon slots
    this.hudElements.weaponSlots.forEach((slot, index) => {
      slot.classList.toggle('active', index === currentWeapon);
    });
  }

  updateScoreboard(players) {
    // Sort by score
    const sorted = [...players].sort((a, b) => b.score - a.score);

    let html = '';
    for (const player of sorted.slice(0, 8)) {
      const isSelf = player.id === this.playerId;
      html += `<div class="score-entry${isSelf ? ' self' : ''}">
        <span>Player ${player.id}</span>
        <span>${player.score}</span>
      </div>`;
    }

    this.hudElements.scoreList.innerHTML = html;
  }

  onDeath() {
    this.hudElements.deathScreen.style.display = 'flex';

    // Countdown timer
    let countdown = 2;
    this.hudElements.respawnTimer.textContent = `Respawning in ${countdown}...`;

    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.hudElements.respawnTimer.textContent = `Respawning in ${countdown}...`;
      } else {
        clearInterval(timer);
      }
    }, 1000);
  }

  onRespawn(state) {
    this.hudElements.deathScreen.style.display = 'none';

    // Teleport to spawn position
    this.playerController.position.x = state.x;
    this.playerController.position.y = state.y;
    this.playerController.position.z = state.z;
    this.playerController.velocity.x = 0;
    this.playerController.velocity.y = 0;
    this.playerController.velocity.z = 0;
  }
}

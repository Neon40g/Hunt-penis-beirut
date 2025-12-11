// ============================================
// SHARED TYPES FOR CLIENT AND SERVER
// ============================================

// Vector3 for positions and velocities
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Player input sent from client to server
export interface InputData {
  seq: number;           // Sequence number for reconciliation
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  sneak: boolean;
  shoot: boolean;
  weapon: number;        // 0-3 for weapons 1-4
  yaw: number;           // Camera rotation Y (radians)
  pitch: number;         // Camera rotation X (radians)
  timestamp: number;
}

// Individual player state in world snapshot
export interface PlayerState {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  health: number;
  weapon: number;
  isShooting: boolean;
  isDead: boolean;
  score: number;
}

// Projectile/hit event
export interface HitEvent {
  shooterId: number;
  targetId: number;
  damage: number;
  headshot: boolean;
}

// World snapshot sent from server to clients
export interface WorldSnapshot {
  tick: number;
  timestamp: number;
  players: PlayerState[];
  hits: HitEvent[];
  lastProcessedInput: number;  // For client reconciliation
}

// Server -> Client message types
export const ServerMessageType = {
  WELCOME: 1,
  SNAPSHOT: 2,
  PLAYER_JOINED: 3,
  PLAYER_LEFT: 4,
  DEATH: 5,
  RESPAWN: 6,
  GAME_OVER: 7
} as const;

// Client -> Server message types
export const ClientMessageType = {
  JOIN: 1,
  INPUT: 2,
  PING: 3
} as const;

// Join request from client
export interface JoinRequest {
  name: string;
}

// Welcome message from server
export interface WelcomeMessage {
  playerId: number;
  tickRate: number;
  mapSeed: number;
}

// Game constants shared between client and server
export const GAME_CONSTANTS = {
  TICK_RATE: 60,                    // Server ticks per second
  MOVE_SPEED: 5.0,                  // Units per second
  SPRINT_MULTIPLIER: 1.6,
  SNEAK_MULTIPLIER: 0.5,
  JUMP_FORCE: 8.0,
  GRAVITY: 20.0,
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.4,
  HEAD_HEIGHT: 0.3,                 // Head hitbox size
  MAX_HEALTH: 100,
  RESPAWN_TIME: 2000,               // 2 seconds in ms
  INTERPOLATION_BUFFER: 100,        // ms of interpolation delay

  // Weapon definitions
  WEAPONS: [
    {
      name: 'Pistol',
      damage: 25,
      fireRate: 400,
      range: 100,
      spread: 0.02,
      automatic: false,
      bulletCount: 1
    },
    {
      name: 'SMG',
      damage: 15,
      fireRate: 100,
      range: 50,
      spread: 0.08,
      automatic: true,
      bulletCount: 1
    },
    {
      name: 'Rifle',
      damage: 35,
      fireRate: 150,
      range: 150,
      spread: 0.01,
      automatic: true,
      bulletCount: 1
    },
    {
      name: 'Shotgun',
      damage: 15,
      fireRate: 800,
      range: 20,
      spread: 0.15,
      automatic: false,
      bulletCount: 8
    }
  ],

  // Map generation
  MAP_SIZE: 50,
  OBSTACLE_COUNT: 40
} as const;

// Death reasons
export const DeathReason = {
  KILLED: 1,
  SUICIDE: 2,
  FELL: 3
} as const;

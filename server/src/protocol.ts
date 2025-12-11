// ============================================
// BINARY PROTOCOL ENCODING (ZERO-GC OPTIMIZED)
// ============================================

import { 
  type PlayerState, 
  type HitEvent, 
  type WorldSnapshot,
  ServerMessageType,
  ClientMessageType
} from '@shooter/shared';

// Pre-allocated buffers for zero-GC encoding
const WELCOME_BUFFER = new ArrayBuffer(8);
const WELCOME_VIEW = new DataView(WELCOME_BUFFER);

const MAX_PLAYERS = 32;
const MAX_HITS = 16;
const PLAYER_STATE_SIZE = 40;
const HIT_EVENT_SIZE = 6;
const SNAPSHOT_HEADER_SIZE = 19; // 1 + 4 + 8 + 1 + 1 + 4

const SNAPSHOT_BUFFER = new ArrayBuffer(
  SNAPSHOT_HEADER_SIZE + 
  MAX_PLAYERS * PLAYER_STATE_SIZE + 
  MAX_HITS * HIT_EVENT_SIZE
);
const SNAPSHOT_VIEW = new DataView(SNAPSHOT_BUFFER);

// Encode welcome message
// Format: [type:u8][playerId:u16][tickRate:u8][mapSeed:u32]
export function encodeWelcome(playerId: number, tickRate: number, mapSeed: number): ArrayBuffer {
  WELCOME_VIEW.setUint8(0, ServerMessageType.WELCOME);
  WELCOME_VIEW.setUint16(1, playerId, true);
  WELCOME_VIEW.setUint8(3, tickRate);
  WELCOME_VIEW.setUint32(4, mapSeed, true);
  return WELCOME_BUFFER.slice(0, 8);
}

// Encode world snapshot
// Format: [type:u8][tick:u32][timestamp:f64][playerCount:u8][hitCount:u8][lastInput:u32][players...][hits...]
export function encodeSnapshot(
  tick: number,
  timestamp: number,
  players: PlayerState[],
  hits: HitEvent[],
  lastProcessedInput: number
): ArrayBuffer {
  let offset = 0;
  
  // Header
  SNAPSHOT_VIEW.setUint8(offset++, ServerMessageType.SNAPSHOT);
  SNAPSHOT_VIEW.setUint32(offset, tick, true); offset += 4;
  SNAPSHOT_VIEW.setFloat64(offset, timestamp, true); offset += 8;
  SNAPSHOT_VIEW.setUint8(offset++, players.length);
  SNAPSHOT_VIEW.setUint8(offset++, hits.length);
  SNAPSHOT_VIEW.setUint32(offset, lastProcessedInput, true); offset += 4;
  
  // Players (40 bytes each)
  for (const p of players) {
    SNAPSHOT_VIEW.setUint16(offset, p.id, true); offset += 2;
    SNAPSHOT_VIEW.setFloat32(offset, p.x, true); offset += 4;
    SNAPSHOT_VIEW.setFloat32(offset, p.y, true); offset += 4;
    SNAPSHOT_VIEW.setFloat32(offset, p.z, true); offset += 4;
    SNAPSHOT_VIEW.setFloat32(offset, p.vx, true); offset += 4;
    SNAPSHOT_VIEW.setFloat32(offset, p.vy, true); offset += 4;
    SNAPSHOT_VIEW.setFloat32(offset, p.vz, true); offset += 4;
    SNAPSHOT_VIEW.setFloat32(offset, p.yaw, true); offset += 4;
    SNAPSHOT_VIEW.setFloat32(offset, p.pitch, true); offset += 4;
    SNAPSHOT_VIEW.setUint8(offset++, p.health);
    SNAPSHOT_VIEW.setUint8(offset++, p.weapon);
    SNAPSHOT_VIEW.setUint8(offset++, p.isShooting ? 1 : 0);
    SNAPSHOT_VIEW.setUint8(offset++, p.isDead ? 1 : 0);
    SNAPSHOT_VIEW.setUint16(offset, p.score, true); offset += 2;
  }
  
  // Hits (6 bytes each)
  for (const h of hits) {
    SNAPSHOT_VIEW.setUint16(offset, h.shooterId, true); offset += 2;
    SNAPSHOT_VIEW.setUint16(offset, h.targetId, true); offset += 2;
    SNAPSHOT_VIEW.setUint8(offset++, h.damage);
    SNAPSHOT_VIEW.setUint8(offset++, h.headshot ? 1 : 0);
  }
  
  return SNAPSHOT_BUFFER.slice(0, offset);
}

// Decode client input
// Format: [type:u8][seq:u32][flags:u8][weapon:u8][yaw:f32][pitch:f32][timestamp:f64]
export function decodeInput(buffer: ArrayBuffer): {
  seq: number;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  sneak: boolean;
  shoot: boolean;
  weapon: number;
  yaw: number;
  pitch: number;
  timestamp: number;
} {
  const view = new DataView(buffer);
  let offset = 1; // Skip message type
  
  const seq = view.getUint32(offset, true); offset += 4;
  const flags = view.getUint8(offset++);
  const weapon = view.getUint8(offset++);
  const yaw = view.getFloat32(offset, true); offset += 4;
  const pitch = view.getFloat32(offset, true); offset += 4;
  const timestamp = view.getFloat64(offset, true);
  
  return {
    seq,
    forward: (flags & 1) !== 0,
    backward: (flags & 2) !== 0,
    left: (flags & 4) !== 0,
    right: (flags & 8) !== 0,
    jump: (flags & 16) !== 0,
    sprint: (flags & 32) !== 0,
    sneak: (flags & 64) !== 0,
    shoot: (flags & 128) !== 0,
    weapon,
    yaw,
    pitch,
    timestamp
  };
}

// Decode join request
// Format: [type:u8][nameLength:u8][name:string]
export function decodeJoinRequest(buffer: ArrayBuffer): { name: string } {
  const view = new Uint8Array(buffer);
  const nameLength = view[1];
  const nameBytes = view.slice(2, 2 + nameLength);
  const name = new TextDecoder().decode(nameBytes);
  return { name };
}

// Get message type
export function getMessageType(buffer: ArrayBuffer): number {
  return new Uint8Array(buffer)[0];
}

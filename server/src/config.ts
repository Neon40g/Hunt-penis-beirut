// ============================================
// SERVER CONFIGURATION
// ============================================

export const CONFIG = {
  // Environment detection
  IS_PRODUCTION: process.env.NODE_ENV === 'production',

  // Server settings
  PORT: parseInt(process.env.PORT || '9001', 10),
  HOST: process.env.HOST || '0.0.0.0',

  // Database (PostgreSQL on Railway)
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Game settings
  TICK_RATE: parseInt(process.env.TICK_RATE || '60', 10),
  MAX_PLAYERS_PER_ROOM: parseInt(process.env.MAX_PLAYERS_PER_ROOM || '16', 10),
  MAX_ROOMS: parseInt(process.env.MAX_ROOMS || '10', 10),

  // Network / Anti-Cheat settings
  MAX_LAG_COMPENSATION: 400, // Max ms to rewind (prevents lag switching)

  // Map seed (for consistent obstacle generation)
  MAP_SEED: parseInt(process.env.MAP_SEED || '12345', 10)
} as const;

export type Config = typeof CONFIG;

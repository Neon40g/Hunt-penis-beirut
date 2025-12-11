// ============================================
// DATABASE LAYER WITH IN-MEMORY FALLBACK
// ============================================

import postgres from 'postgres';
import { CONFIG } from './config.js';

// User stats interface
export interface UserStats {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  gamesPlayed: number;
  createdAt: Date;
}

// In-memory fallback storage
class InMemoryStore {
  private users: Map<string, UserStats> = new Map();

  async getUser(id: string): Promise<UserStats | null> {
    return this.users.get(id) || null;
  }

  async createUser(name: string): Promise<UserStats> {
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const user: UserStats = {
      id,
      name,
      kills: 0,
      deaths: 0,
      gamesPlayed: 0,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateStats(id: string, kills: number, deaths: number): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.kills += kills;
      user.deaths += deaths;
      user.gamesPlayed += 1;
    }
  }

  async getLeaderboard(limit: number = 10): Promise<UserStats[]> {
    return Array.from(this.users.values())
      .sort((a, b) => b.kills - a.kills)
      .slice(0, limit);
  }
}

// PostgreSQL store
class PostgresStore {
  private sql: postgres.Sql;

  constructor(connectionString: string) {
    this.sql = postgres(connectionString, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10
    });
  }

  async initialize(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
  }

  async getUser(id: string): Promise<UserStats | null> {
    const rows = await this.sql`
      SELECT id, name, kills, deaths, games_played as "gamesPlayed", created_at as "createdAt"
      FROM users WHERE id = ${id}
    `;
    return rows[0] as UserStats || null;
  }

  async createUser(name: string): Promise<UserStats> {
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const rows = await this.sql`
      INSERT INTO users (id, name)
      VALUES (${id}, ${name})
      RETURNING id, name, kills, deaths, games_played as "gamesPlayed", created_at as "createdAt"
    `;
    return rows[0] as UserStats;
  }

  async updateStats(id: string, kills: number, deaths: number): Promise<void> {
    await this.sql`
      UPDATE users SET
        kills = kills + ${kills},
        deaths = deaths + ${deaths},
        games_played = games_played + 1
      WHERE id = ${id}
    `;
  }

  async getLeaderboard(limit: number = 10): Promise<UserStats[]> {
    const rows = await this.sql`
      SELECT id, name, kills, deaths, games_played as "gamesPlayed", created_at as "createdAt"
      FROM users ORDER BY kills DESC LIMIT ${limit}
    `;
    return rows as unknown as UserStats[];
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

// Database interface
export interface Database {
  getUser(id: string): Promise<UserStats | null>;
  createUser(name: string): Promise<UserStats>;
  updateStats(id: string, kills: number, deaths: number): Promise<void>;
  getLeaderboard(limit?: number): Promise<UserStats[]>;
}

// Create and export database instance
let db: Database;

export async function initDatabase(): Promise<Database> {
  if (CONFIG.DATABASE_URL) {
    try {
      console.log('[DB] Connecting to PostgreSQL...');
      const pgStore = new PostgresStore(CONFIG.DATABASE_URL);
      await pgStore.initialize();
      console.log('[DB] PostgreSQL connected successfully');
      db = pgStore;
    } catch (error) {
      console.warn('[DB] PostgreSQL connection failed, using in-memory storage:', error);
      db = new InMemoryStore();
    }
  } else {
    console.log('[DB] No DATABASE_URL set, using in-memory storage');
    db = new InMemoryStore();
  }
  return db;
}

export function getDatabase(): Database {
  return db;
}

// ============================================
// GAME MODE BASE CLASS
// ============================================

import { Player } from './Player.js';
import type { Obstacle } from './physics.js';
import type { HitEvent } from '@shooter/shared';

// Game mode interface - extend this to create new modes
export abstract class GameMode {
  abstract readonly name: string;
  abstract readonly description: string;
  
  // Called when a player joins the game
  abstract onPlayerJoin(player: Player, obstacles: Obstacle[]): void;
  
  // Called when a player leaves
  abstract onPlayerLeave(player: Player): void;
  
  // Called when a player kills another
  abstract onPlayerKill(killer: Player, victim: Player, headshot: boolean): void;
  
  // Called when a player dies (any cause)
  abstract onPlayerDeath(player: Player, killerId: number | null): void;
  
  // Called to check if game should end
  abstract shouldEndGame(players: Map<number, Player>): boolean;
  
  // Get winner(s) when game ends
  abstract getWinners(players: Map<number, Player>): Player[];
  
  // Get spawn position for player
  abstract getSpawnPosition(player: Player, obstacles: Obstacle[]): { x: number; y: number; z: number };
  
  // Process game-mode specific logic per tick
  abstract tick(players: Map<number, Player>, deltaTime: number): void;
}

// ============================================
// FREE FOR ALL (DEATHMATCH) GAME MODE
// ============================================

import { GameMode } from './GameMode.js';
import { Player } from './Player.js';
import type { Obstacle } from './physics.js';
import { GAME_CONSTANTS } from '@shooter/shared';

export class FreeForAllMode extends GameMode {
  readonly name = 'Free For All';
  readonly description = 'Every player for themselves. Most kills wins!';
  
  // Optional: score limit to end game
  private scoreLimit: number = 0; // 0 = no limit
  private timeLimit: number = 0;  // 0 = no limit (in ms)
  private startTime: number = 0;
  
  constructor(options?: { scoreLimit?: number; timeLimit?: number }) {
    super();
    if (options?.scoreLimit) this.scoreLimit = options.scoreLimit;
    if (options?.timeLimit) this.timeLimit = options.timeLimit;
    this.startTime = Date.now();
  }
  
  onPlayerJoin(player: Player, obstacles: Obstacle[]): void {
    // Spawn player at random position
    player.spawn(obstacles);
    console.log(`[FFA] ${player.name} joined the game`);
  }
  
  onPlayerLeave(player: Player): void {
    console.log(`[FFA] ${player.name} left the game`);
  }
  
  onPlayerKill(killer: Player, victim: Player, headshot: boolean): void {
    // Award points
    killer.score += headshot ? 2 : 1;
    killer.kills++;
    
    console.log(`[FFA] ${killer.name} killed ${victim.name}${headshot ? ' (HEADSHOT)' : ''}`);
  }
  
  onPlayerDeath(player: Player, killerId: number | null): void {
    // Set respawn timer
    player.respawnTime = Date.now() + GAME_CONSTANTS.RESPAWN_TIME;
  }
  
  shouldEndGame(players: Map<number, Player>): boolean {
    // Check score limit
    if (this.scoreLimit > 0) {
      for (const player of players.values()) {
        if (player.score >= this.scoreLimit) {
          return true;
        }
      }
    }
    
    // Check time limit
    if (this.timeLimit > 0) {
      if (Date.now() - this.startTime >= this.timeLimit) {
        return true;
      }
    }
    
    return false;
  }
  
  getWinners(players: Map<number, Player>): Player[] {
    let maxScore = -1;
    const winners: Player[] = [];
    
    for (const player of players.values()) {
      if (player.score > maxScore) {
        maxScore = player.score;
        winners.length = 0;
        winners.push(player);
      } else if (player.score === maxScore) {
        winners.push(player);
      }
    }
    
    return winners;
  }
  
  getSpawnPosition(player: Player, obstacles: Obstacle[]): { x: number; y: number; z: number } {
    const mapSize = GAME_CONSTANTS.MAP_SIZE;
    const halfMap = mapSize / 2 - 2;
    
    // Find position away from other players if possible
    // For now, just random position
    return {
      x: (Math.random() - 0.5) * halfMap * 2,
      y: 0,
      z: (Math.random() - 0.5) * halfMap * 2
    };
  }
  
  tick(players: Map<number, Player>, deltaTime: number): void {
    const now = Date.now();
    
    // Handle respawns
    for (const player of players.values()) {
      if (player.isDead && player.respawnTime > 0 && now >= player.respawnTime) {
        player.respawnTime = 0;
        // Will be respawned by Room
      }
    }
  }
}

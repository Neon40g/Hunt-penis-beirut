// ============================================
// SERVER-SIDE PHYSICS (MATCHES CLIENT)
// ============================================

import { GAME_CONSTANTS, type Vec3 } from '@shooter/shared';

// Obstacle representation for collision
export interface Obstacle {
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

// Generate map obstacles from seed (deterministic)
export function generateObstacles(seed: number): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const mapSize = GAME_CONSTANTS.MAP_SIZE;
  const count = GAME_CONSTANTS.OBSTACLE_COUNT;
  
  // Simple seeded random
  let s = seed;
  const random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  
  for (let i = 0; i < count; i++) {
    const width = 1 + random() * 4;
    const height = 2 + random() * 6;
    const depth = 1 + random() * 4;
    const x = (random() - 0.5) * (mapSize - width);
    const z = (random() - 0.5) * (mapSize - depth);
    
    obstacles.push({ x, z, width, height, depth });
  }
  
  // Add boundary walls
  const wallThickness = 1;
  const halfSize = mapSize / 2;
  
  // North wall
  obstacles.push({ x: 0, z: halfSize, width: mapSize, height: 5, depth: wallThickness });
  // South wall
  obstacles.push({ x: 0, z: -halfSize, width: mapSize, height: 5, depth: wallThickness });
  // East wall
  obstacles.push({ x: halfSize, z: 0, width: wallThickness, height: 5, depth: mapSize });
  // West wall
  obstacles.push({ x: -halfSize, z: 0, width: wallThickness, height: 5, depth: mapSize });
  
  return obstacles;
}

// Check AABB collision with obstacle
function checkObstacleCollision(
  x: number, y: number, z: number,
  radius: number, height: number,
  obstacle: Obstacle
): boolean {
  const halfW = obstacle.width / 2;
  const halfD = obstacle.depth / 2;
  
  // AABB vs cylinder approximation (treat player as AABB)
  const closestX = Math.max(obstacle.x - halfW, Math.min(x, obstacle.x + halfW));
  const closestZ = Math.max(obstacle.z - halfD, Math.min(z, obstacle.z + halfD));
  
  const distX = x - closestX;
  const distZ = z - closestZ;
  const distSq = distX * distX + distZ * distZ;
  
  if (distSq < radius * radius) {
    // Check Y
    if (y < obstacle.height && y + height > 0) {
      return true;
    }
  }
  
  return false;
}

// Check collision with all obstacles
export function checkCollision(
  x: number, y: number, z: number,
  radius: number, height: number,
  obstacles: Obstacle[]
): boolean {
  for (const obs of obstacles) {
    if (checkObstacleCollision(x, y, z, radius, height, obs)) {
      return true;
    }
  }
  return false;
}

// Get ground height at position (simple - always 0 for now)
export function getGroundHeight(x: number, z: number, obstacles: Obstacle[]): number {
  return 0;
}

// Apply physics to player position
export function applyPhysics(
  position: Vec3,
  velocity: Vec3,
  deltaTime: number,
  obstacles: Obstacle[]
): { position: Vec3; velocity: Vec3; grounded: boolean } {
  const radius = GAME_CONSTANTS.PLAYER_RADIUS;
  const height = GAME_CONSTANTS.PLAYER_HEIGHT;
  
  // Apply gravity
  velocity.y -= GAME_CONSTANTS.GRAVITY * deltaTime;
  
  // Calculate new position
  let newX = position.x + velocity.x * deltaTime;
  let newY = position.y + velocity.y * deltaTime;
  let newZ = position.z + velocity.z * deltaTime;
  
  // Check X collision
  if (checkCollision(newX, position.y, position.z, radius, height, obstacles)) {
    newX = position.x;
    velocity.x = 0;
  }
  
  // Check Z collision
  if (checkCollision(newX, position.y, newZ, radius, height, obstacles)) {
    newZ = position.z;
    velocity.z = 0;
  }
  
  // Check Y collision (ground and ceiling)
  let grounded = false;
  const groundY = getGroundHeight(newX, newZ, obstacles);
  
  if (newY <= groundY) {
    newY = groundY;
    velocity.y = 0;
    grounded = true;
  } else if (checkCollision(newX, newY, newZ, radius, height, obstacles)) {
    newY = position.y;
    velocity.y = 0;
  }
  
  // Map bounds check
  const halfMap = GAME_CONSTANTS.MAP_SIZE / 2 - radius;
  newX = Math.max(-halfMap, Math.min(halfMap, newX));
  newZ = Math.max(-halfMap, Math.min(halfMap, newZ));
  
  return {
    position: { x: newX, y: newY, z: newZ },
    velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
    grounded
  };
}

// Raycast for shooting
export interface RaycastHit {
  hit: boolean;
  point: Vec3;
  distance: number;
  obstacleHit: boolean;
}

export function raycast(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  obstacles: Obstacle[]
): RaycastHit {
  const step = 0.5;
  const steps = Math.ceil(maxDistance / step);
  
  let x = origin.x;
  let y = origin.y;
  let z = origin.z;
  
  const dx = direction.x * step;
  const dy = direction.y * step;
  const dz = direction.z * step;
  
  for (let i = 0; i < steps; i++) {
    x += dx;
    y += dy;
    z += dz;
    
    // Check ground
    if (y < 0) {
      return {
        hit: true,
        point: { x, y: 0, z },
        distance: i * step,
        obstacleHit: false
      };
    }
    
    // Check obstacles
    for (const obs of obstacles) {
      const halfW = obs.width / 2;
      const halfD = obs.depth / 2;
      
      if (x >= obs.x - halfW && x <= obs.x + halfW &&
          z >= obs.z - halfD && z <= obs.z + halfD &&
          y >= 0 && y <= obs.height) {
        return {
          hit: true,
          point: { x, y, z },
          distance: i * step,
          obstacleHit: true
        };
      }
    }
  }
  
  return {
    hit: false,
    point: { x, y, z },
    distance: maxDistance,
    obstacleHit: false
  };
}

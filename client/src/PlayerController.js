// ============================================
// PLAYER CONTROLLER - CLIENT-SIDE PREDICTION
// ============================================

export class PlayerController {
  constructor(camera, scene, constants, obstacles) {
    this.camera = camera;
    this.scene = scene;
    this.constants = constants;
    this.obstacles = obstacles;

    // Position and velocity
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };

    // State
    this.grounded = false;

    // Input history for reconciliation - stores inputs with their deltaTime
    this.inputHistory = [];
    this.maxHistorySize = 120; // 2 seconds at 60fps

    // Fixed timestep for consistent physics (matches server tick)
    this.fixedDeltaTime = 1 / constants.TICK_RATE;

    // Previous position for interpolation
    this.prevPosition = { ...this.position };
  }

  update(input, deltaTime) {
    // Build input with current camera yaw for consistent physics
    const inputWithYaw = {
      ...input,
      yaw: this.camera.rotation.y
    };

    // Use the same physics as reconciliation for consistency
    this.applyInput(inputWithYaw, deltaTime);
  }

  checkCollision(x, y, z, radius, height) {
    for (const obs of this.obstacles) {
      if (this.checkObstacleCollision(x, y, z, radius, height, obs)) {
        return true;
      }
    }
    return false;
  }

  checkObstacleCollision(x, y, z, radius, height, obstacle) {
    const halfW = obstacle.width / 2;
    const halfD = obstacle.depth / 2;

    // AABB vs cylinder (approximated as AABB)
    const closestX = Math.max(obstacle.x - halfW, Math.min(x, obstacle.x + halfW));
    const closestZ = Math.max(obstacle.z - halfD, Math.min(z, obstacle.z + halfD));

    const distX = x - closestX;
    const distZ = z - closestZ;
    const distSq = distX * distX + distZ * distZ;

    if (distSq < radius * radius) {
      // Check Y overlap
      if (y < obstacle.height && y + height > 0) {
        return true;
      }
    }

    return false;
  }

  // Store input for reconciliation - include deltaTime used
  storeInput(input, seq, deltaTime) {
    this.inputHistory.push({
      seq,
      input: { ...input },
      deltaTime,
      positionBefore: { ...this.position },
      velocityBefore: { ...this.velocity },
      groundedBefore: this.grounded
    });

    // Trim old entries
    while (this.inputHistory.length > this.maxHistorySize) {
      this.inputHistory.shift();
    }
  }

  // Reconcile with server state - replay unacknowledged inputs
  reconcile(serverPosition, serverVelocity, serverGrounded, lastProcessedSeq) {
    // Find the index of the last processed input
    const index = this.inputHistory.findIndex(h => h.seq === lastProcessedSeq);

    if (index === -1) {
      // No matching input found - server might be ahead or behind
      // Check if we have any history
      if (this.inputHistory.length === 0) {
        this.position = { ...serverPosition };
        this.velocity = { ...serverVelocity };
        this.grounded = serverGrounded;
        return;
      }

      // Check if server is behind our oldest input
      if (lastProcessedSeq < this.inputHistory[0].seq) {
        // Server hasn't caught up yet, don't reconcile
        return;
      }

      // Server is ahead of all our history, snap to server
      this.position = { ...serverPosition };
      this.prevPosition = { ...serverPosition };
      this.velocity = { ...serverVelocity };
      this.grounded = serverGrounded;
      this.inputHistory = [];
      return;
    }

    // Get inputs that need to be replayed (after the acknowledged one)
    const unacknowledgedInputs = this.inputHistory.slice(index + 1);

    // Remove acknowledged inputs from history
    this.inputHistory = unacknowledgedInputs;

    // Calculate what our predicted position would be after replaying from server state
    // First, save current state
    const savedPosition = { ...this.position };
    const savedVelocity = { ...this.velocity };
    const savedGrounded = this.grounded;

    // Set state to server's authoritative state
    this.position = { ...serverPosition };
    this.velocity = { ...serverVelocity };
    this.grounded = serverGrounded;

    // Re-apply all unacknowledged inputs
    for (const record of unacknowledgedInputs) {
      this.applyInput(record.input, record.deltaTime);
    }

    // Check if the difference between saved and new predicted position is significant
    const dx = this.position.x - savedPosition.x;
    const dy = this.position.y - savedPosition.y;
    const dz = this.position.z - savedPosition.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    // Threshold: if difference is very small, keep the smooth local prediction
    // This prevents micro-jitter from floating point differences
    const RECONCILE_THRESHOLD = 0.01; // 1cm squared
    if (distSq < RECONCILE_THRESHOLD) {
      // Difference is negligible, restore saved state for smoother experience
      this.position = savedPosition;
      this.velocity = savedVelocity;
      this.grounded = savedGrounded;
    }
    // Otherwise, keep the reconciled state (already set)
  }

  // Apply a single input (used for both normal update and reconciliation)
  applyInput(input, deltaTime) {
    // Save state for interpolation
    this.prevPosition = { ...this.position };

    // Calculate movement direction in local space
    let moveX = 0;
    let moveZ = 0;

    // Fixed: Forward is +Z, Backward is -Z
    if (input.forward) moveZ += 1;
    if (input.backward) moveZ -= 1;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;

    // Normalize diagonal movement
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    // Rotate by camera yaw to get world-space direction
    // In Babylon.js: yaw=0 looks at +Z, yaw=PI/2 looks at +X
    // Local space: -Z is forward, +X is right
    // We need to transform local movement to world space
    const yaw = input.yaw !== undefined ? input.yaw : this.camera.rotation.y;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    // Forward vector at yaw: (sin(yaw), 0, cos(yaw))
    // Right vector at yaw: (cos(yaw), 0, -sin(yaw))
    // Rotated vector
    const worldMoveX = moveX * cosYaw + moveZ * sinYaw;
    const worldMoveZ = -moveX * sinYaw + moveZ * cosYaw;

    // Apply speed modifiers
    let speed = this.constants.MOVE_SPEED;
    if (input.sprint) speed *= this.constants.SPRINT_MULTIPLIER;
    if (input.sneak) speed *= this.constants.SNEAK_MULTIPLIER;

    // Set horizontal velocity
    this.velocity.x = worldMoveX * speed;
    this.velocity.z = worldMoveZ * speed;

    // Jump
    if (input.jump && this.grounded) {
      this.velocity.y = this.constants.JUMP_FORCE;
      this.grounded = false;
    }

    // Apply gravity
    this.velocity.y -= this.constants.GRAVITY * deltaTime;

    // Calculate new position
    let newX = this.position.x + this.velocity.x * deltaTime;
    let newY = this.position.y + this.velocity.y * deltaTime;
    let newZ = this.position.z + this.velocity.z * deltaTime;

    // Collision detection
    const radius = this.constants.PLAYER_RADIUS;
    const height = this.constants.PLAYER_HEIGHT;

    // Check X collision
    if (this.checkCollision(newX, this.position.y, this.position.z, radius, height)) {
      newX = this.position.x;
      this.velocity.x = 0;
    }

    // Check Z collision
    if (this.checkCollision(newX, this.position.y, newZ, radius, height)) {
      newZ = this.position.z;
      this.velocity.z = 0;
    }

    // Ground check
    if (newY <= 0) {
      newY = 0;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.checkCollision(newX, newY, newZ, radius, height)) {
      newY = this.position.y;
      this.velocity.y = 0;
    }

    // Map bounds
    const halfMap = this.constants.MAP_SIZE / 2 - radius;
    newX = Math.max(-halfMap, Math.min(halfMap, newX));
    newZ = Math.max(-halfMap, Math.min(halfMap, newZ));

    // Update position
    this.position.x = newX;
    this.position.y = newY;
    this.position.z = newZ;
  }

  // Get interpolated position for rendering
  getInterpolatedPosition(alpha) {
    // Clamp alpha to 0-1
    alpha = Math.max(0, Math.min(1, alpha));

    return {
      x: this.prevPosition.x + (this.position.x - this.prevPosition.x) * alpha,
      y: this.prevPosition.y + (this.position.y - this.prevPosition.y) * alpha,
      z: this.prevPosition.z + (this.position.z - this.prevPosition.z) * alpha
    };
  }
}

// ============================================
// WORLD RENDERER - MAP & PLAYER MESHES
// ============================================

import * as BABYLON from '@babylonjs/core';

export class WorldRenderer {
  constructor(scene, constants) {
    this.scene = scene;
    this.constants = constants;
    this.obstacles = [];

    // Materials
    this.groundMaterial = null;
    this.obstacleMaterial = null;
    this.playerMaterial = null;
    this.headMaterial = null;

    this.createMaterials();
    this.createGround();
    this.generateWorld(12345); // Default seed
  }

  createMaterials() {
    // Ground material
    this.groundMaterial = new BABYLON.StandardMaterial('groundMat', this.scene);
    this.groundMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.25, 0.2);
    this.groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

    // Obstacle material
    this.obstacleMaterial = new BABYLON.StandardMaterial('obstacleMat', this.scene);
    this.obstacleMaterial.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.5);
    this.obstacleMaterial.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

    // Player body material
    this.playerMaterial = new BABYLON.StandardMaterial('playerMat', this.scene);
    this.playerMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.2);
    this.playerMaterial.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    // Player head material
    this.headMaterial = new BABYLON.StandardMaterial('headMat', this.scene);
    this.headMaterial.diffuseColor = new BABYLON.Color3(1, 0.8, 0.6);
    this.headMaterial.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
  }

  createGround() {
    const mapSize = this.constants.MAP_SIZE;

    // Ground plane
    const ground = BABYLON.MeshBuilder.CreateGround(
      'ground',
      { width: mapSize, height: mapSize },
      this.scene
    );
    ground.material = this.groundMaterial;
    ground.checkCollisions = true;

    // Grid lines on ground
    const gridSize = 5;
    const gridMaterial = new BABYLON.StandardMaterial('gridMat', this.scene);
    gridMaterial.diffuseColor = new BABYLON.Color3(0.15, 0.2, 0.15);
    gridMaterial.alpha = 0.5;

    for (let i = -mapSize / 2; i <= mapSize / 2; i += gridSize) {
      // X lines
      const lineX = BABYLON.MeshBuilder.CreateBox(
        `gridX${i}`,
        { width: mapSize, height: 0.02, depth: 0.05 },
        this.scene
      );
      lineX.position.z = i;
      lineX.position.y = 0.01;
      lineX.material = gridMaterial;

      // Z lines
      const lineZ = BABYLON.MeshBuilder.CreateBox(
        `gridZ${i}`,
        { width: 0.05, height: 0.02, depth: mapSize },
        this.scene
      );
      lineZ.position.x = i;
      lineZ.position.y = 0.01;
      lineZ.material = gridMaterial;
    }
  }

  generateWorld(seed) {
    // Clear existing obstacles
    this.obstacles.forEach(obs => {
      if (obs.mesh) obs.mesh.dispose();
    });
    this.obstacles = [];

    const mapSize = this.constants.MAP_SIZE;
    const count = this.constants.OBSTACLE_COUNT;

    // Seeded random
    let s = seed;
    const random = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    // Create random obstacles
    for (let i = 0; i < count; i++) {
      const width = 1 + random() * 4;
      const height = 2 + random() * 6;
      const depth = 1 + random() * 4;
      const x = (random() - 0.5) * (mapSize - width);
      const z = (random() - 0.5) * (mapSize - depth);

      this.createObstacle(x, z, width, height, depth, i);
    }

    // Boundary walls
    const wallThickness = 1;
    const wallHeight = 5;
    const halfSize = mapSize / 2;

    // North wall
    this.createObstacle(0, halfSize, mapSize, wallHeight, wallThickness, 'wallN');
    // South wall
    this.createObstacle(0, -halfSize, mapSize, wallHeight, wallThickness, 'wallS');
    // East wall
    this.createObstacle(halfSize, 0, wallThickness, wallHeight, mapSize, 'wallE');
    // West wall
    this.createObstacle(-halfSize, 0, wallThickness, wallHeight, mapSize, 'wallW');

    console.log(`[World] Generated ${this.obstacles.length} obstacles with seed ${seed}`);
  }

  createObstacle(x, z, width, height, depth, id) {
    const mesh = BABYLON.MeshBuilder.CreateBox(
      `obstacle_${id}`,
      { width, height, depth },
      this.scene
    );
    mesh.position.x = x;
    mesh.position.y = height / 2;
    mesh.position.z = z;
    mesh.material = this.obstacleMaterial;
    mesh.checkCollisions = true;

    // Add variation in color
    const varMaterial = this.obstacleMaterial.clone(`obsMat_${id}`);
    const variation = (Math.sin(x * 0.5) * 0.1 + Math.cos(z * 0.5) * 0.1);
    varMaterial.diffuseColor = new BABYLON.Color3(
      0.4 + variation,
      0.4 + variation,
      0.5 + variation
    );
    mesh.material = varMaterial;

    const obstacle = { x, z, width, height, depth, mesh };
    this.obstacles.push(obstacle);

    return obstacle;
  }

  createPlayerMesh(playerId) {
    // Create player mesh group
    const root = new BABYLON.TransformNode(`player_${playerId}`, this.scene);

    // Body (box)
    const bodyHeight = this.constants.PLAYER_HEIGHT - this.constants.HEAD_HEIGHT;
    const body = BABYLON.MeshBuilder.CreateBox(
      `body_${playerId}`,
      {
        width: this.constants.PLAYER_RADIUS * 2,
        height: bodyHeight,
        depth: this.constants.PLAYER_RADIUS * 2
      },
      this.scene
    );
    body.position.y = bodyHeight / 2;
    body.material = this.playerMaterial.clone(`playerMat_${playerId}`);

    // Randomize player color
    const hue = (playerId * 137.5) % 360;
    const color = BABYLON.Color3.FromHSV(hue, 0.7, 0.8);
    body.material.diffuseColor = color;

    body.parent = root;

    // Head (smaller cube)
    const headSize = this.constants.HEAD_HEIGHT * 2;
    const head = BABYLON.MeshBuilder.CreateBox(
      `head_${playerId}`,
      { width: headSize, height: headSize, depth: headSize },
      this.scene
    );
    head.position.y = bodyHeight + headSize / 2;
    head.material = this.headMaterial;
    head.parent = root;

    // Add a small indicator for facing direction
    const indicator = BABYLON.MeshBuilder.CreateBox(
      `indicator_${playerId}`,
      { width: 0.1, height: 0.1, depth: 0.3 },
      this.scene
    );
    indicator.position.y = 0; // Relative to head
    indicator.position.z = -headSize / 2 - 0.15;
    indicator.material = body.material;
    indicator.parent = head;

    // Attach head reference to root metadata for independent rotation
    root.metadata = { head: head };

    return root;
  }

  // Create a muzzle flash effect
  createMuzzleFlash(position, direction) {
    const flash = BABYLON.MeshBuilder.CreateSphere(
      'muzzleFlash',
      { diameter: 0.2 },
      this.scene
    );
    flash.position = new BABYLON.Vector3(position.x, position.y, position.z);

    const flashMaterial = new BABYLON.StandardMaterial('flashMat', this.scene);
    flashMaterial.emissiveColor = new BABYLON.Color3(1, 0.8, 0.3);
    flash.material = flashMaterial;

    // Remove after short time
    setTimeout(() => flash.dispose(), 50);
  }

  // Create a hit marker effect
  createHitMarker(position, headshot) {
    const marker = BABYLON.MeshBuilder.CreateSphere(
      'hitMarker',
      { diameter: headshot ? 0.4 : 0.2 },
      this.scene
    );
    marker.position = new BABYLON.Vector3(position.x, position.y, position.z);

    const markerMaterial = new BABYLON.StandardMaterial('hitMat', this.scene);
    markerMaterial.emissiveColor = headshot
      ? new BABYLON.Color3(1, 0, 0)
      : new BABYLON.Color3(1, 1, 0);
    marker.material = markerMaterial;

    // Remove after short time
    setTimeout(() => marker.dispose(), 200);
  }

  // Create bullet tracer
  createTracer(start, end, color = null) {
    const points = [
      new BABYLON.Vector3(start.x, start.y, start.z),
      new BABYLON.Vector3(end.x, end.y, end.z)
    ];

    const tracer = BABYLON.MeshBuilder.CreateLines('tracer', { points }, this.scene);

    // Debug Mode: High visibility tracers
    if (window.DEBUG_TRACERS) {
      tracer.color = color || new BABYLON.Color3(1, 0, 1); // Purple default for debug
      tracer.alpha = 1.0;

      // Log
      console.log(`[Tracer] Start: ${start.x.toFixed(2)},${start.y.toFixed(2)},${start.z.toFixed(2)} -> End: ${end.x.toFixed(2)},${end.y.toFixed(2)},${end.z.toFixed(2)} Dist: ${BABYLON.Vector3.Distance(points[0], points[1]).toFixed(2)}`);

      // Last for 10 seconds
      setTimeout(() => tracer.dispose(), 10000);
      return;
    }

    tracer.color = color || new BABYLON.Color3(1, 0.9, 0.5);
    tracer.alpha = 0.8;

    // Fade out and dispose
    let alpha = 0.8;
    const animate = () => {
      alpha -= 0.1;
      tracer.alpha = alpha;
      if (alpha <= 0) {
        tracer.dispose();
      } else {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }
}

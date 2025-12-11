// ============================================
// INPUT MANAGER - KEYBOARD + MOUSE
// ============================================

export class InputManager {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;

    // Key states
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      sneak: false
    };

    // Mouse state
    this.shoot = false;
    this.weapon = 0;

    // Pointer lock state
    this.isLocked = false;

    // Sensitivity
    this.mouseSensitivity = 0.002;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Keyboard
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Mouse
    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));

    // Pointer lock
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    });

    // Prevent context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Click to lock pointer
    this.canvas.addEventListener('click', () => {
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
      }
    });
  }

  onKeyDown(e) {
    if (e.repeat) return;

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'Space':
        this.keys.jump = true;
        e.preventDefault();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = true;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.keys.sneak = true;
        break;
      case 'Digit1':
        this.weapon = 0;
        break;
      case 'Digit2':
        this.weapon = 1;
        break;
      case 'Digit3':
        this.weapon = 2;
        break;
      case 'Digit4':
        this.weapon = 3;
        break;
    }
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'Space':
        this.keys.jump = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = false;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.keys.sneak = false;
        break;
    }
  }

  onMouseDown(e) {
    if (e.button === 0) { // Left click
      this.shoot = true;
    }
  }

  onMouseUp(e) {
    if (e.button === 0) {
      this.shoot = false;
    }
  }

  onMouseMove(e) {
    if (!this.isLocked) return;

    // Update camera rotation
    this.camera.rotation.y += e.movementX * this.mouseSensitivity;
    this.camera.rotation.x += e.movementY * this.mouseSensitivity;

    // Clamp vertical rotation
    this.camera.rotation.x = Math.max(-Math.PI / 2 + 0.1,
      Math.min(Math.PI / 2 - 0.1,
        this.camera.rotation.x));
  }

  getState() {
    return {
      forward: this.keys.forward,
      backward: this.keys.backward,
      left: this.keys.left,
      right: this.keys.right,
      jump: this.keys.jump,
      sprint: this.keys.sprint,
      sneak: this.keys.sneak,
      shoot: this.shoot,
      weapon: this.weapon
    };
  }
}

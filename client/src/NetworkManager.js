// ============================================
// NETWORK MANAGER - WEBSOCKET + BINARY PROTOCOL
// ============================================

// Message types (must match server)
const ClientMessageType = {
  JOIN: 1,
  INPUT: 2,
  PING: 3
};

const ServerMessageType = {
  WELCOME: 1,
  SNAPSHOT: 2,
  PLAYER_JOINED: 3,
  PLAYER_LEFT: 4,
  DEATH: 5,
  RESPAWN: 6,
  GAME_OVER: 7
};

export class NetworkManager {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.inputSequence = 0;

    // Callbacks
    this.onWelcome = null;
    this.onSnapshot = null;
    this.onDisconnect = null;

    // Pre-allocated buffers for encoding
    this.inputBuffer = new ArrayBuffer(64);
    this.inputView = new DataView(this.inputBuffer);

    // Clock Sync
    this.rtt = 0;
    this.serverTimeOffset = 0;

    // Start Ping loop
    setInterval(() => this.sendPing(), 1000);
  }

  connect(playerName) {
    console.log(`[Network] Connecting to ${this.wsUrl}...`);

    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[Network] Connected');
      this.sendJoin(playerName);
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      console.log('[Network] Disconnected');
      if (this.onDisconnect) this.onDisconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[Network] Error:', error);
    };
  }

  sendJoin(name) {
    // Encode: [type:u8][nameLength:u8][name:string]
    const nameBytes = new TextEncoder().encode(name);
    const buffer = new ArrayBuffer(2 + nameBytes.length);
    const view = new Uint8Array(buffer);

    view[0] = ClientMessageType.JOIN;
    view[1] = nameBytes.length;
    view.set(nameBytes, 2);

    this.ws.send(buffer);
  }

  sendInput(input) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Encode input data to binary
    // Format: [type:u8][seq:u32][flags:u8][weapon:u8][yaw:f32][pitch:f32][timestamp:f64]
    const view = this.inputView;
    let offset = 0;

    view.setUint8(offset++, ClientMessageType.INPUT);
    view.setUint32(offset, input.seq, true); offset += 4;

    // Pack booleans into flags byte
    let flags = 0;
    if (input.forward) flags |= 1;
    if (input.backward) flags |= 2;
    if (input.left) flags |= 4;
    if (input.right) flags |= 8;
    if (input.jump) flags |= 16;
    if (input.sprint) flags |= 32;
    if (input.sneak) flags |= 64;
    if (input.shoot) flags |= 128;

    view.setUint8(offset++, flags);
    view.setUint8(offset++, input.weapon);
    view.setFloat32(offset, input.yaw, true); offset += 4;
    view.setFloat32(offset, input.pitch, true); offset += 4;
    view.setUint8(offset++, input.weapon);
    view.setFloat32(offset, input.yaw, true); offset += 4;
    view.setFloat32(offset, input.pitch, true); offset += 4;
    // Use Server Time estimate
    view.setFloat64(offset, this.getServerTime(), true); offset += 8;

    this.ws.send(this.inputBuffer.slice(0, offset));
  }

  handleMessage(data) {
    const view = new DataView(data);
    const type = view.getUint8(0);

    switch (type) {
      case ServerMessageType.WELCOME:
        this.handleWelcome(view);
        break;
      case ServerMessageType.SNAPSHOT:
        this.handleSnapshot(view, data);
        break;
      case ClientMessageType.PING: // Echoed ping
        this.handlePing(view);
        break;
    }
  }

  sendPing() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const buffer = new ArrayBuffer(9); // 1 + 8
    const view = new DataView(buffer);
    view.setUint8(0, ClientMessageType.PING);
    view.setFloat64(1, Date.now(), true);

    this.ws.send(buffer);
  }

  handlePing(view) {
    const sentTime = view.getFloat64(1, true);
    const now = Date.now();
    this.rtt = now - sentTime;
  }

  getServerTime() {
    return Date.now() + this.serverTimeOffset;
  }

  handleWelcome(view) {
    // Format: [type:u8][playerId:u16][tickRate:u8][mapSeed:u32]
    const playerId = view.getUint16(1, true);
    const tickRate = view.getUint8(3);
    const mapSeed = view.getUint32(4, true);

    if (this.onWelcome) {
      this.onWelcome({ playerId, tickRate, mapSeed });
    }
  }

  handleSnapshot(view, data) {
    // Format: [type:u8][tick:u32][timestamp:f64][playerCount:u8][hitCount:u8][lastInput:u32][players...][hits...]
    let offset = 1;

    const tick = view.getUint32(offset, true); offset += 4;
    const serverTime = view.getFloat64(offset, true); offset += 8;

    // Clock Synchronization
    // We update our offset based on the server time received in snapshot
    // serverTime is the time when snapshot was SENT
    // So current server time is roughly serverTime + latency/2 (time to travel to us)
    // offset = (serverTime + latency/2) - now
    // We smooth it to avoid jumps

    const now = Date.now();
    const estimatedServerTime = serverTime + (this.rtt / 2);
    const split = estimatedServerTime - now;

    // Smooth update (simple exponential moving average)
    if (this.serverTimeOffset === 0) {
      this.serverTimeOffset = split;
    } else {
      this.serverTimeOffset = this.serverTimeOffset * 0.9 + split * 0.1;
    }

    const playerCount = view.getUint8(offset++);
    const hitCount = view.getUint8(offset++);
    const lastProcessedInput = view.getUint32(offset, true); offset += 4;

    // Decode players
    const players = [];
    for (let i = 0; i < playerCount; i++) {
      const player = {
        id: view.getUint16(offset, true),
        x: view.getFloat32(offset + 2, true),
        y: view.getFloat32(offset + 6, true),
        z: view.getFloat32(offset + 10, true),
        vx: view.getFloat32(offset + 14, true),
        vy: view.getFloat32(offset + 18, true),
        vz: view.getFloat32(offset + 22, true),
        yaw: view.getFloat32(offset + 26, true),
        pitch: view.getFloat32(offset + 30, true),
        health: view.getUint8(offset + 34),
        weapon: view.getUint8(offset + 35),
        isShooting: view.getUint8(offset + 36) === 1,
        isDead: view.getUint8(offset + 37) === 1,
        score: view.getUint16(offset + 38, true)
      };
      players.push(player);
      offset += 40; // Player state size
    }

    // Decode hits
    const hits = [];
    for (let i = 0; i < hitCount; i++) {
      const hit = {
        shooterId: view.getUint16(offset, true),
        targetId: view.getUint16(offset + 2, true),
        damage: view.getUint8(offset + 4),
        headshot: view.getUint8(offset + 5) === 1
      };
      hits.push(hit);
      offset += 6;
    }

    if (this.onSnapshot) {
      this.onSnapshot({ tick, timestamp: serverTime, players, hits, lastProcessedInput });
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

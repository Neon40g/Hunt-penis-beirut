// ============================================
// MAIN SERVER ENTRY POINT
// ============================================

import uWS from 'uWebSockets.js';
import { ClientMessageType, GAME_CONSTANTS } from '@shooter/shared';
import {
  decodeInput,
  decodeJoinRequest,
  encodeWelcome,
  getMessageType
} from './protocol.js';
import { CONFIG } from './config.js';
import { initDatabase } from './database.js';
import { Room, type SocketData } from './Room.js';

// Room management
const rooms: Map<string, Room> = new Map();
const DEFAULT_ROOM = 'lobby';

// Get or create a room
function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId);
    rooms.set(roomId, room);
  }
  return room;
}

// Find available room
function findAvailableRoom(): Room {
  for (const room of rooms.values()) {
    if (!room.isFull) {
      return room;
    }
  }
  // Create new room
  const newId = `room_${rooms.size + 1}`;
  return getOrCreateRoom(newId);
}

// Start server
async function main(): Promise<void> {
  console.log('=================================');
  console.log('  FPS SHOOTER SERVER');
  console.log('=================================');
  console.log(`Environment: ${CONFIG.IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`Tick Rate: ${CONFIG.TICK_RATE}Hz`);
  
  // Initialize database
  await initDatabase();
  
  // Create default room
  getOrCreateRoom(DEFAULT_ROOM);
  
  // Create uWebSockets app
  const app = uWS.App();
  
  // WebSocket handler
  app.ws<SocketData>('/*', {
    // Connection settings
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 1024,
    idleTimeout: 120,
    
    // New connection
    open: (ws) => {
      console.log('[WS] New connection');
      // Initialize socket data
      const data = ws.getUserData();
      data.playerId = 0;
      data.roomId = '';
    },
    
    // Message received
    message: (ws, message, isBinary) => {
      if (!isBinary) return;
      
      // uWebSockets.js passes ArrayBuffer for binary messages
      const arrayBuffer = (message as ArrayBuffer).slice(0);
      
      const messageType = getMessageType(arrayBuffer);
      const data = ws.getUserData();
      
      switch (messageType) {
        case ClientMessageType.JOIN: {
          const request = decodeJoinRequest(arrayBuffer);
          const room = findAvailableRoom();
          const player = room.addPlayer(request.name, ws);
          
          if (player) {
            console.log(`[WS] ${request.name} joined room ${room.id} as player ${player.id}`);
            
            // Send welcome message
            const welcome = encodeWelcome(
              player.id,
              CONFIG.TICK_RATE,
              CONFIG.MAP_SEED
            );
            ws.send(welcome, true);
          } else {
            console.log(`[WS] Failed to join - room full`);
            ws.close();
          }
          break;
        }
        
        case ClientMessageType.INPUT: {
          if (data.playerId === 0 || !data.roomId) return;
          
          const input = decodeInput(arrayBuffer);
          const room = rooms.get(data.roomId);
          if (room) {
            room.processInput(data.playerId, input);
          }
          break;
        }
        
        case ClientMessageType.PING: {
          // Echo back for latency measurement
          ws.send(message, true);
          break;
        }
      }
    },
    
    // Connection closed
    close: (ws, code, message) => {
      const data = ws.getUserData();
      if (data.playerId && data.roomId) {
        const room = rooms.get(data.roomId);
        if (room) {
          room.removePlayer(data.playerId);
          console.log(`[WS] Player ${data.playerId} disconnected from ${data.roomId}`);
          
          // Clean up empty rooms (except default)
          if (room.playerCount === 0 && room.id !== DEFAULT_ROOM) {
            rooms.delete(room.id);
            console.log(`[WS] Room ${room.id} removed (empty)`);
          }
        }
      }
    }
  });
  
  // Health check endpoint
  app.get('/health', (res, req) => {
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      players: Array.from(rooms.values()).reduce((sum, r) => sum + r.playerCount, 0)
    }));
  });
  
  // CORS headers for browser connections
  app.options('/*', (res, req) => {
    res.writeHeader('Access-Control-Allow-Origin', '*');
    res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.writeHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
  });
  
  // Start listening
  app.listen(CONFIG.HOST, CONFIG.PORT, (listenSocket) => {
    if (listenSocket) {
      console.log(`[Server] Listening on ${CONFIG.HOST}:${CONFIG.PORT}`);
      console.log(`[Server] WebSocket: ws://${CONFIG.HOST}:${CONFIG.PORT}`);
    } else {
      console.error(`[Server] Failed to listen on ${CONFIG.HOST}:${CONFIG.PORT}`);
      process.exit(1);
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  for (const room of rooms.values()) {
    room.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] Received SIGTERM, shutting down...');
  for (const room of rooms.values()) {
    room.stop();
  }
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('[Server] Fatal error:', error);
  process.exit(1);
});

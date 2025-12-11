// ============================================
// MAIN CLIENT ENTRY POINT
// ============================================

import { Game } from './Game.js';

// Get WebSocket URL based on environment
function getWebSocketUrl() {
  // Check for production URL
  const prodUrl = import.meta.env.VITE_WS_URL;
  if (prodUrl) {
    return prodUrl;
  }
  
  // Development: connect to same host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname || 'localhost';
  const port = 9001;
  return `${protocol}//${host}:${port}`;
}

// DOM Elements
const lobby = document.getElementById('lobby');
const playerNameInput = document.getElementById('playerName');
const joinBtn = document.getElementById('joinBtn');
const hud = document.getElementById('hud');
const deathScreen = document.getElementById('death-screen');

// Game instance
let game = null;

// Initialize
async function init() {
  const canvas = document.getElementById('renderCanvas');
  const wsUrl = getWebSocketUrl();
  
  console.log('[Client] WebSocket URL:', wsUrl);
  
  // Create game instance
  game = new Game(canvas, wsUrl);
  await game.init();
  
  // Handle join button
  joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Player';
    joinGame(name);
  });
  
  // Handle enter key in input
  playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const name = playerNameInput.value.trim() || 'Player';
      joinGame(name);
    }
  });
}

// Join game
function joinGame(name) {
  if (!game) return;
  
  lobby.style.display = 'none';
  hud.style.display = 'block';
  
  game.connect(name);
  game.lockPointer();
}

// Start
init().catch(console.error);

// Expose for debugging
window.game = game;

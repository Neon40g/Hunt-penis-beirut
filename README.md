# FPS Shooter Monorepo

A high-performance browser-based 3D FPS game built with Babylon.js and uWebSockets.js.

## Project Structure

```
/Hunt-penis-beirut
  ├── /shared       # Shared schemas, types, and constants
  ├── /server       # Node.js + uWebSockets.js backend
  ├── /client       # Babylon.js + Vite frontend
  └── package.json  # Root config with NPM workspaces
```

## Tech Stack

- **Client**: Babylon.js, Vite, Native WebSocket
- **Server**: Node.js, uWebSockets.js, PostgreSQL (optional)
- **Shared**: schema-pack for binary protocols, TypeScript

## Features

- **Authoritative Server**: 20Hz tick rate game loop
- **Client-Side Prediction**: Smooth local movement
- **Entity Interpolation**: Smooth remote player rendering
- **Binary Protocol**: Efficient network communication
- **Zero-GC Game Loop**: Optimized for low-end hardware
- **Free For All Mode**: Deathmatch gameplay

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Space | Jump |
| Shift | Sprint |
| Ctrl | Sneak |
| 1-4 | Switch Weapons |
| LMB | Shoot |

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
# Install dependencies (from root)
npm install

# Build shared package first
npm run build:shared
```

### Running Locally

```bash
# Terminal 1: Start server
npm run dev:server

# Terminal 2: Start client
npm run dev:client
```

- Client: http://localhost:3000
- Server WebSocket: ws://localhost:9001

### LAN Play

The server binds to `0.0.0.0` by default, allowing LAN connections.
Other players on your network can connect using your local IP.

## Production Deployment

### Server (Railway)

1. Connect your GitHub repo to Railway
2. Set the root directory to `shooter-monorepo`
3. Railway will auto-detect the Dockerfile in `/server`
4. Add environment variables:
   - `DATABASE_URL` (optional, for PostgreSQL)
   - `NODE_ENV=production`

### Client (GitHub Pages)

1. Enable GitHub Pages in repository settings
2. Uncomment the workflow in `.github/workflows/deploy.yml`
3. Add `VITE_WS_URL` secret with your production WebSocket URL
   - Example: `wss://your-railway-app.railway.app`

## Environment Variables

### Server

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 9001 |
| `HOST` | Bind address | 0.0.0.0 |
| `NODE_ENV` | Environment | development |
| `DATABASE_URL` | PostgreSQL connection string | (in-memory) |

### Client

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_WS_URL` | WebSocket server URL | ws://localhost:9001 |

## Game Modes

### Free For All (FFA)

Every player for themselves. Score points by eliminating other players.
Headshots award 2 points, body shots award 1 point.

## Weapons

| # | Weapon | Damage | Fire Rate | Range |
|---|--------|--------|-----------|-------|
| 1 | Pistol | 25 | 400ms | 100m |
| 2 | SMG | 15 | 100ms | 50m |
| 3 | Rifle | 35 | 150ms | 150m |
| 4 | Shotgun | 80 | 800ms | 20m |

## Architecture

### Network Protocol

All messages use binary encoding via schema-pack for minimal bandwidth.

**Client → Server:**
- `JOIN`: Player name
- `INPUT`: Movement, rotation, actions
- `PING`: Latency measurement

**Server → Client:**
- `WELCOME`: Player ID, tick rate, map seed
- `SNAPSHOT`: World state (all players, hits)

### Game Loop

1. Server runs at 20Hz (50ms per tick)
2. Each tick:
   - Process all pending player inputs
   - Validate and apply movements
   - Check shooting and hit detection
   - Handle deaths and respawns
   - Broadcast world snapshot to all clients

### Client Prediction

1. Client immediately applies local input
2. Server validates and sends authoritative state
3. Client reconciles if deviation exceeds threshold

## License

MIT

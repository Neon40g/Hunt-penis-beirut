# ============================================
# SERVER DOCKERFILE FOR RAILWAY DEPLOYMENT
# ============================================

FROM node:20-alpine AS builder

# Install build dependencies for uWebSockets.js
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy root package files
COPY package.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

# Install dependencies
RUN npm install

# Copy source code
COPY shared/ ./shared/
COPY server/ ./server/

# Build shared package
RUN npm run build:shared

# Build server
RUN npm run build:server

# ============================================
# Production image
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/package.json ./

# Set production environment
ENV NODE_ENV=production

# Expose port (Railway uses PORT env var)
EXPOSE 9001

# Start server
CMD ["node", "server/dist/index.js"]

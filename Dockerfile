# Multi-stage build for MineCraft Bot Assistant

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source files (excluding server via .dockerignore)
COPY index.html vite.config.ts tailwind.config.ts postcss.config.js tsconfig*.json ./
COPY src/ ./src/
COPY public/ ./public/

# Build frontend
RUN npm run build

# Stage 2: Install server dependencies (separate for better caching)
FROM node:20-alpine AS server-deps

WORKDIR /app/server

# Copy package.json only
COPY server/package.json ./

# Install production dependencies
RUN npm install --omit=dev

# Stage 3: Production image
FROM node:20-alpine AS production

WORKDIR /app

# Copy server dependencies from stage 2
COPY --from=server-deps /app/server/node_modules ./server/node_modules

# Copy server source
COPY server/ ./server/

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/dist ./dist/

# Create data and logs directory
RUN mkdir -p /app/server/data /app/server/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check - use /api/auth/check which doesn't require auth
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/check || exit 1

# Start the server (use docker restart policy instead of PM2 for ARM compatibility)
WORKDIR /app/server
CMD ["node", "index.js"]

# Multi-stage build for MineCraft Bot Assistant

# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY index.html vite.config.ts tailwind.config.ts postcss.config.js tsconfig*.json ./
COPY src/ ./src/
COPY public/ ./public/

# Build frontend
RUN npm run build

# Stage 2: Install server dependencies (production only)
FROM node:22-alpine AS server-deps

WORKDIR /app/server

# Copy package files (lockfile included for reproducible installs)
COPY server/package.json server/package-lock.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Stage 3: Final Production Image (Alpine based, lightweight)
FROM node:22-alpine AS production

WORKDIR /app

# Install minimal runtime dependencies (if any)
# minebot itself only needs nodejs, but some native modules might need libs
# Usually alpine is enough for pure node apps
RUN apk add --no-cache tzdata curl ca-certificates

# Install sing-box from edge community repo
RUN apk add --no-cache sing-box --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community

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

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:3000/ || exit 1

# Start the server
WORKDIR /app/server
CMD ["node", "index.js"]

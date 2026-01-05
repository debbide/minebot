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
# Use Debian slim for Puppeteer compatibility
FROM node:20-slim AS server-deps

WORKDIR /app/server

# Copy package.json only
COPY server/package.json ./

# Install production dependencies
RUN npm install --omit=dev

# Stage 3: Production image with Chrome for Puppeteer
FROM node:20-slim AS production

# Install Chrome dependencies and Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server dependencies from stage 2
COPY --from=server-deps /app/server/node_modules ./server/node_modules

# Copy server source
COPY server/ ./server/

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/dist ./dist/

# Create data and logs directory
RUN mkdir -p /app/server/data /app/server/logs

# Install Puppeteer's bundled Chrome
RUN cd /app/server && npx puppeteer browsers install chrome

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
# Tell Puppeteer to skip downloading Chrome (we install it manually)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

# Expose port
EXPOSE 3000

# Health check - use /api/auth/check which doesn't require auth
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/check || exit 1

# Start the server (use docker restart policy instead of PM2 for ARM compatibility)
WORKDIR /app/server
CMD ["node", "index.js"]

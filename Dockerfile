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

# Stage 3: Production image with Chrome/Chromium for Puppeteer
FROM node:20-slim AS production

# Detect architecture and install appropriate browser
# ARM64: Install Chromium from apt (Puppeteer's Chrome doesn't support ARM Linux)
# AMD64: Install Puppeteer's bundled Chrome
ARG TARGETARCH

# Install common dependencies
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

# Install Chromium for ARM64 architecture
# Note: In Debian bookworm (used by node:20-slim), the package is 'chromium'
# The binary path is /usr/bin/chromium
RUN if [ "$TARGETARCH" = "arm64" ]; then \
    apt-get update && apt-get install -y chromium --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && echo "Chromium installed at: $(which chromium || which chromium-browser || echo 'not found')"; \
    fi

WORKDIR /app

# Copy server dependencies from stage 2
COPY --from=server-deps /app/server/node_modules ./server/node_modules

# Copy server source
COPY server/ ./server/

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/dist ./dist/

# Create data and logs directory
RUN mkdir -p /app/server/data /app/server/logs

# Install Puppeteer's bundled Chrome only for AMD64
RUN if [ "$TARGETARCH" = "amd64" ]; then \
    cd /app/server && npx puppeteer browsers install chrome; \
    fi

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
# Skip Puppeteer's automatic Chrome download (we handle it ourselves)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# For ARM64: Tell Puppeteer to use system Chromium (standard path in Debian)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Expose port
EXPOSE 3000

# Health check - use node for reliability
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://127.0.0.1:3000/api/auth/check', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));"

# Start the server (use docker restart policy instead of PM2 for ARM compatibility)
WORKDIR /app/server
CMD ["node", "index.js"]

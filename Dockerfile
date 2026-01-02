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

# Stage 2: Production image
FROM node:20-alpine AS production

# Install PM2 globally
RUN npm install -g pm2

WORKDIR /app

# Copy server package.json and install dependencies
COPY server/package.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev

# Copy server source
COPY server/ ./

# Copy built frontend from stage 1
WORKDIR /app
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

# Start with PM2 for process management
WORKDIR /app/server
CMD ["pm2-runtime", "ecosystem.config.cjs"]

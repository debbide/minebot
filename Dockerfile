# Multi-stage build for MineCraft Bot Assistant

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY package*.json ./
RUN npm ci

# Copy frontend source
COPY . .

# Build frontend
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies for server
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./dist/

# Create data directory for config persistence
RUN mkdir -p /app/server/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/status || exit 1

# Start the server
WORKDIR /app/server
CMD ["node", "index.js"]

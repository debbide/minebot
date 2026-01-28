# Multi-stage build: Frontend (Node) + Backend (Python)

# ==================== Stage 1: Build Frontend ====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/ui

# Copy package files
COPY ui/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY ui/ ./

# Build for production
RUN npm run build

# ==================== Stage 2: Python Backend with Frontend ====================
FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome (for SeleniumBase)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Python requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python source code
COPY *.py ./
COPY simple_bypass.py ./
COPY bypass.py ./
COPY renewal.py ./
COPY task_store.py ./
COPY api.py ./

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/ui/dist ./ui/dist

# Create data directory for persistence
RUN mkdir -p /app/data /app/output/screenshots

# Expose port
EXPOSE 5000

# Set environment
ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99
ENV SE_OFFLINE=1

# Start Xvfb and run the app
CMD Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 & python api.py

FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
# xvfb: for virtual display
# chromium: browser for seleniumbase
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    xvfb \
    libglib2.0-0 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libasound2 \
    google-chrome-stable || true \
    && rm -rf /var/lib/apt/lists/*

# If google-chrome-stable failed (not in standard repos), try simple chromium
RUN if ! command -v google-chrome > /dev/null; then \
    apt-get update && apt-get install -y chromium chromium-driver \
    && rm -rf /var/lib/apt/lists/*; \
    fi

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install SeleniumBase dependencies (drivers etc)
RUN seleniumbase install chromedriver

# Copy source code
COPY . .

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99
ENV PORT=5000

# Expose port
EXPOSE 5000

# Start API
CMD ["python", "api.py"]

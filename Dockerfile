FROM node:18-slim

# Install system dependencies including Chromium for Puppeteer
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxshmfence1 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Create user with ID 1000 for Hugging Face compatibility
# Note: node:slim might already have a user with UID 1000 (node)
RUN id -u 1000 >/dev/null 2>&1 || useradd -m -u 1000 user
USER 1000
ENV HOME=/home/node \
    PATH=/home/node/.local/bin:$PATH \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR $HOME/app

# Copy package files with correct ownership
COPY --chown=1000:1000 package*.json ./
RUN npm install

# Copy rest of the code with correct ownership
COPY --chown=1000:1000 . .

# HF Spaces port
ENV PORT=7860
EXPOSE 7860

CMD ["npm", "start"]

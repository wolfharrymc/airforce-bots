FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create user with ID 1000 for Hugging Face compatibility
# Note: node:slim might already have a user with UID 1000 (node)
RUN id -u 1000 >/dev/null 2>&1 || useradd -m -u 1000 user
USER 1000
ENV HOME=/home/node \
    PATH=/home/node/.local/bin:$PATH

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

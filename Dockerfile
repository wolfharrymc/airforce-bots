FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create user with ID 1000 for Hugging Face compatibility
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy package files with correct ownership
COPY --chown=user package*.json ./
RUN npm install

# Copy rest of the code with correct ownership
COPY --chown=user . .

# HF Spaces port
ENV PORT=7860
EXPOSE 7860

CMD ["npm", "start"]

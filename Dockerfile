# Dockerfile - Simplified

# 1. Start with a lean Node.js image
FROM node:20-slim

# 2. Install Python3 and required dependencies for diagram generation
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# 3. Install Python dependencies for diagram generation
RUN pip3 install --no-cache-dir --break-system-packages \
    matplotlib \
    numpy

# 4. Set up the working directory
WORKDIR /usr/src/app

# 5. Skip Puppeteer's bundled Chrome download (use system Chrome at runtime)
ENV PUPPETEER_SKIP_DOWNLOAD=true

# 6. Copy package files and install npm dependencies deterministically
COPY package*.json ./
RUN npm ci --omit=dev

# 7. Copy the rest of your application code
COPY . .

# 8. Create non-root user and set ownership
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser \
    && chown -R appuser:appgroup /usr/src/app

# 9. Run as non-root user
USER appuser

# 10. Tell Docker what port the app will run on
EXPOSE 3000

# 11. Health check — verifies app is responsive and database is connected
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.end();"

# 12. Define the command to start your server
CMD ["node", "server.js"]

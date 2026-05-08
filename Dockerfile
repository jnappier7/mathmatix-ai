# Dockerfile - Simplified

# 1. Start with a lean Node.js image
FROM node:20-slim

# 2. Install Python3 and the system libraries Puppeteer's bundled
#    chrome-headless-shell needs at runtime. We deliberately don't install the
#    Debian `chromium` package — its crashpad handler fails to launch in this
#    container with "chrome_crashpad_handler: --database is required".
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# 3. Install Python dependencies for diagram generation
RUN pip3 install --no-cache-dir --break-system-packages \
    matplotlib \
    numpy

# 4. Set up the working directory
WORKDIR /usr/src/app

# 5. Pin Puppeteer's browser cache to a project-local dir so it survives the
#    later chown to appuser. (Default is $HOME/.cache, which appuser can't read.)
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer

# 6. Copy package files and install npm dependencies deterministically.
#    Puppeteer's postinstall downloads chrome-headless-shell into the cache dir.
COPY package*.json .puppeteerrc.cjs ./
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

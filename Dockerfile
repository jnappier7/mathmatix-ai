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

# 5. Copy package files and install npm dependencies
COPY package*.json ./
RUN npm install

# 6. Copy the rest of your application code
COPY . .

# 7. Tell Docker what port the app will run on
EXPOSE 3000

# 8. Define the command to start your server
CMD ["node", "server.js"]
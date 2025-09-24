# Dockerfile - Simplified

# 1. Start with a lean Node.js image
FROM node:20-slim

# 2. Set up the working directory
WORKDIR /usr/src/app

# 3. Copy package files and install npm dependencies
COPY package*.json ./
RUN npm install

# 4. Copy the rest of your application code
COPY . .

# 5. Tell Docker what port the app will run on
EXPOSE 3000

# 6. Define the command to start your server
CMD ["node", "server.js"]
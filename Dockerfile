# Dockerfile

# 1. Start with a lean Node.js image
FROM node:20-slim

# 2. Install the system dependencies we need (this is the key fix)
RUN apt-get update && apt-get install -y poppler-utils

# 3. Set up the working directory inside the container
WORKDIR /usr/src/app

# 4. Copy package files and install npm dependencies
COPY package*.json ./
RUN npm install

# 5. Copy the rest of your application code
COPY . .

# 6. Tell Docker what port the app will run on
EXPOSE 3000

# 7. Define the command to start your server
CMD ["node", "server.js"]

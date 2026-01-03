# Use the official Node.js 18 Alpine image (small and secure)
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# 1. Copy ONLY the package.json and package-lock.json first
# This allows Docker to cache the dependency installation layer
COPY backend/package*.json ./

# 2. Install production dependencies only
RUN npm ci --only=production

# 3. Copy the TypeScript configuration
COPY backend/tsconfig.json ./

# 4. Copy the entire backend source code
COPY backend/src ./src

# 5. Build the TypeScript code into JavaScript
RUN npm run build

# 6. Define the command to run the application
CMD ["node", "dist/index.js"]

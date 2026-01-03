FROM node:18-alpine
WORKDIR /app

# 1. COPY EVERYTHING from backend first. This cache-busts the layer.
COPY backend/ ./

# 2. Install production dependencies
RUN npm install 

# 3. Build the TypeScript code
RUN npm run build

# 4. Start the application
CMD ["node", "dist/index.js"]

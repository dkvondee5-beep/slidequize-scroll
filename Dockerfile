FROM node:18-alpine
WORKDIR /app

COPY backend/ ./

RUN npm install
RUN npm run build

# KEY FIX: Use the direct, absolute path to node and your app
CMD ["/usr/local/bin/node", "/app/dist/index.js"]

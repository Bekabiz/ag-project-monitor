FROM node:20-slim

WORKDIR /app

COPY mcp/package.json mcp/package-lock.json ./
RUN npm ci --production

COPY mcp/server.js ./

EXPOSE 3001

CMD ["node", "server.js"]

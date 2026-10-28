FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY mcp ./mcp
ENV PORT=3080 VOUCHWALL_DATA=/data NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3080
USER node
CMD ["node", "server/index.mjs"]

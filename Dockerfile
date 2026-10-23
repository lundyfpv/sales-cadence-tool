# Sales Cadence Tool — no npm dependencies; uses Node's built-in SQLite and crypto.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    DATA_DIR=/data \
    HTTP_PORT=8080 \
    HTTPS_PORT=8443

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /data && chown -R node:node /data
USER node

VOLUME ["/data"]
EXPOSE 8080 8443

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||8080)+'/api/session').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]

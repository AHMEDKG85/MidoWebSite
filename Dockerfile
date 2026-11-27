FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --no-package-lock --no-audit --no-fund

COPY . .
RUN npm run build \
  && mkdir -p /app/data /app/uploads/catalog /app/uploads/models /app/uploads/prescriptions \
  && chown -R node:node /app

ENV NODE_ENV=production \
  PORT=3000 \
  DATABASE_PATH=/app/data/mido.sqlite \
  UPLOAD_DIR=/app/uploads

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]

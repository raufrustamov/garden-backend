# ── Build stage: install dependencies ──
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Production stage: copy only what's needed ──
FROM node:22-alpine
WORKDIR /app

# Non-root user for security
RUN addgroup -S garden && adduser -S garden -G garden

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER garden
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# ---- deps ----
FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json tsup.config.ts ./
RUN npm ci --ignore-scripts
COPY src/ ./src/
RUN npm run build

# ---- release ----
FROM base AS release
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json README.md ./

LABEL org.opencontainers.image.title="Storix" \
      org.opencontainers.image.description="Unified Cloud Storage SDK" \
      org.opencontainers.image.source="https://github.com/ak2311581/storix"

CMD ["node", "-e", "console.log('Storix container ready')"]

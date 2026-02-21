# ── Stage 1: Install & Build ─────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
COPY prisma ./prisma/

RUN npm ci --ignore-scripts \
 && npx prisma generate

# Build NestJS
COPY tsconfig.json nest-cli.json ./
COPY src ./src/

RUN npm run build

# ── Stage 2: Production Runtime ──────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production deps
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
COPY prisma ./prisma/

RUN npm ci --omit=dev --ignore-scripts \
 && npx prisma generate \
 && npm cache clean --force

# Copy build output
COPY --from=builder /app/dist ./dist

EXPOSE ${PORT:-3001}

# Railway injects DATABASE_URL, REDIS_URL, PORT, etc.
# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

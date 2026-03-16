FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools for native deps (bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including dev for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Force cache invalidation on code changes
ENV BUILD_VERSION=20260316a

# Copy source code
COPY . .

# Build NestJS
RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

# --- Production stage ---
FROM node:22-alpine

WORKDIR /app

# Copy everything needed from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy || echo 'Migration skipped'; node dist/main.js"]

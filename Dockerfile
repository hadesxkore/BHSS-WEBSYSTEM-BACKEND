# BHSS Websystem Backend - Dockerfile

# 1. Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# 2. Runtime stage
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8000

# Coolify / server will pass PORT, MONGODB_URI, JWT_SECRET via env vars
CMD ["node", "dist/index.js"]

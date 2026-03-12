# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Non-root user
RUN addgroup -g 1001 -S medidas && adduser -u 1001 -S medidas -G medidas

# Production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output
COPY --from=builder /app/dist ./dist

# Copy frontend static files (if any)
COPY dist-ui/ ./dist-ui/

# Copy existing data and uploads (seed data)
COPY data/ ./data/
COPY uploads/ ./uploads/

# Ensure ownership
RUN chown -R medidas:medidas uploads data dist-ui

USER medidas
EXPOSE 3000

CMD ["node", "dist/server.js"]

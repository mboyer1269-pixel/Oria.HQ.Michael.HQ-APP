# =============================================================
# Oria HQ — Dockerfile
# Next.js 16 standalone build — Node 20 Alpine
# Build: docker build -t oria-local:latest .
# Run:   docker run --rm -p 3000:3000 oria-local:latest
# Health: curl http://localhost:3000/api/health
# =============================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
# Stub required env vars so build does not fail without .env
# Real values injected at runtime via docker-compose .env
ENV NEXT_PUBLIC_SUPABASE_URL=http://localhost
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=stub
RUN npm run build

# Stage 3: Runner (production, minimal image)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Create non-root user for security
RUN addgroup -S oria && adduser -S oria -G oria
# Copy standalone output
COPY --from=builder --chown=oria:oria /app/public ./public
COPY --from=builder --chown=oria:oria /app/.next/standalone ./
COPY --from=builder --chown=oria:oria /app/.next/static ./.next/static
USER oria
EXPOSE 3000
# Liveness probe: GET /api/health -> {ok:true}
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]

# ────────────────────────────────────────────────────────────────────────────
# iClone — Multi-stage Dockerfile (Bun + Next.js standalone)
# ────────────────────────────────────────────────────────────────────────────

# ── base ──────────────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────
FROM base AS builder

# NEXT_PUBLIC_* vars are baked at build time — they MUST be declared as ARGs
# and written to .env.local BEFORE `bun run build`.
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_CONVEX_SITE_URL

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Inject public env vars for Next.js build-time replacement.
# This file is written AFTER COPY so it overwrites any local .env.local.
RUN echo "NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL}" > .env.local \
 && echo "NEXT_PUBLIC_CONVEX_SITE_URL=${NEXT_PUBLIC_CONVEX_SITE_URL}" >> .env.local

RUN bun run build

# ── runner ────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user (mirrors Next.js official Docker example)
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Use bun fetch() for healthcheck — bun:alpine has no curl/wget.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1

CMD ["bun", "server.js"]

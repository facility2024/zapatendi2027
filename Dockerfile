# Easypanel / Docker — Node server on port 3000
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
# .env.production (committed, public values only) is the single source for
# VITE_* at build time. Do NOT declare ARG/ENV VITE_* here: an empty ENV
# overrides .env.production and the client bundle loses Supabase config.
COPY . .

RUN bun run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

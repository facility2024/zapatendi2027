# Easypanel / Docker — Node server on port 3000
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .

# Build-time public URL used by the W-API webhook (set as build arg in Easypanel)
ARG VITE_PUBLIC_APP_URL
ENV VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL
# Supabase public values are baked into the client bundle at build time
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

RUN bun run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

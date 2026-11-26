<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

## Commands

- **bun is the package manager** (`bun.lock`, `bunfig.toml`) — despite the
  README's `npm` instructions. `bun install`; bun auto-loads `.env`.
- `bun run dev` · `bun run build` · `bun run test` · `bun run lint` · `bun run format`
- No `typecheck` script: run `bunx tsc --noEmit`.
- Single test: `bunx vitest run src/test/<file>.test.ts`. Tests live in
  `src/test/`, run in jsdom, and need no network or Supabase.
- Check order: `bun run format` → `bun run lint` → `bunx tsc --noEmit` → `bun run test`.
  Tests and `tsc` currently pass; `lint` does not.
- `lint` runs Prettier _as_ ESLint errors. Failures that are only
  `prettier/prettier` are fixed by `bun run format`; the baseline also has a
  few real pre-existing errors (`no-unused-expressions` in
  `src/components/app/Panel.tsx`, `no-explicit-any` in
  `src/lib/bot.functions.ts`). Don't assume you caused lint failures — check
  whether the failing files are ones you touched.
- `bunfig.toml` enforces a 24h supply-chain `minimumReleaseAge` with
  `@lovable.dev/*` packages excluded; confirm with the user before adding
  excludes.
- No CI or pre-commit hooks — these local commands are the only gate.

## Architecture

- TanStack Start file-based routing: routes live in `src/routes/`;
  `src/routeTree.gen.ts` is generated — never edit it (prettier ignores it).
  No `src/pages/` or `app/` dirs; conventions in `src/routes/README.md`.
- `vite.config.ts` wraps `@lovable.dev/vite-tanstack-config`, which already
  installs the TanStack/React/Tailwind/nitro/`@`-alias/`VITE_*`-env plugins.
  Never re-add them, never set `ssr.external`/`resolve.external` (the Worker
  build has no module resolution), and never add compression plugins or
  compress response bodies in server code (edge already compresses;
  double-encoding garbles output — same rule documented in `src/server.ts`).
- Server-only modules use the `*.server.ts` suffix; the `server-only` package
  is banned by ESLint. Route files and `*.functions.ts` ship to the client
  bundle: dynamic-import `@/integrations/supabase/client.server` inside
  handlers, never at top level.
- Files under `src/integrations/supabase/` (`client*.ts`, `auth-*.ts`,
  `types.ts`) are generated — don't hand-edit.
- `src/start.ts` middleware arrays are append-only; never replace
  `requestMiddleware`/`functionMiddleware`.
- Local `.env` holds the new Supabase project's URL/keys (`dvwwqqhgdveusvczasbj`)
  including `SUPABASE_SERVICE_ROLE_KEY` — no Lovable Cloud injection; `.env` is
  gitignored, never commit or paste its values.
- `src/lib/site.ts` hardcodes the published `PUBLIC_APP_URL`; the W-API
  webhook must never point at a preview.
- shadcn/ui (new-york + lucide, Tailwind 4): primitives in
  `src/components/ui`, screens in `src/components/app`.

## Project rules

- Each user's WhatsApp bot config lives in `bot_configs` (RLS by user_id); the webhook route `/api/public/wapi/$secret` finds the owner by the unguessable `webhook_secret`, so users never mix data.
- Licenses are admin-only writes (RLS via has_role); the first account to sign up becomes admin.
- AI replies use OpenAI-compatible chat endpoints for OpenAI, Grok and Gemini with the user's own key; media is emitted via [IMAGEM:]/[VIDEO:]/[AUDIO:]/[LINK:] tags parsed in bot.server.ts.
- The W-API webhook answers immediately and runs AI + delivery inside request.waitUntil, because W-API holds later webhooks until the previous one is answered.
- Anti-refusal filter in `bot.server.ts`: `isRefusal()` (PT/EN regex, >400 chars never counts) → one retry with the `REGRA ABSOLUTA` system suffix → second refusal throws, so nothing is sent or saved to `ai_memory`; old refusals are also filtered out of the history sent to the model (a stored refusal becomes a loop).
- Chat delivery is delay-free: `delay_min`/`delay_max` default to 0 in the schema and `deliver()` waits nothing when both are 0.
- Password recovery uses a public `/reset-password` route and a dedicated form that verifies a recovery session before updating credentials; keep ordinary signed-in sessions out of this recovery-only flow.

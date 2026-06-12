## Tech Stack

| Layer     | What                  | Notes                                                             |
|-----------|-----------------------|-------------------------------------------------------------------|
| Framework | Next.js 16.2.9        | **Breaking changes** — read docs before writing code              |
| UI        | React 19.2.4          | New hooks, Actions, `use()` — not what you know from v18          |
| Styling   | Tailwind CSS v4       | Breaking changes from v3 — no `tailwind.config.js`, config in CSS |
| Language  | TypeScript 5 (strict) | Strict mode on                                                    |
| Hosting   | Cloudflare Pages      | SSR via `@opennextjs/cloudflare`                                  |
| Database  | Cloudflare D1         | SQLite at the edge — accessed via Wrangler bindings               |
| Cache     | Cloudflare KV         | Steam library cache with 24hr TTL                                 |
| Secrets   | `.dev.vars` (local)   | Cloudflare dashboard (production)                                 |

## Critical: Read the Docs First

**Before writing any Next.js code**, read the relevant guide in `node_modules/next/dist/docs/`. This version has breaking changes — APIs, routing conventions, and file structure may differ from training data. Heed deprecation notices.

- `node_modules/next/dist/docs/01-app/02-guides/` — guides for common tasks
- `node_modules/next/dist/docs/01-app/03-api-reference/` — API reference

**Tailwind CSS v4** has a completely different config model — there is no `tailwind.config.js`. All customization lives in `app/globals.css` using `@theme`.

## Project Structure

```
steam-game-finder/
├── app/                        # App Router root (no src/ directory)
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home — Steam ID input form
│   ├── globals.css             # Global styles + Tailwind v4 theme config
│   ├── results/
│   │   └── page.tsx            # Results table
│   ├── group/
│   │   └── [slug]/
│   │       └── page.tsx        # Shared group page
│   └── api/
│       ├── resolve/
│       │   └── route.ts        # Call 1: resolve IDs → SteamID64s + visibility
│       └── libraries/
│           └── route.ts        # Call 2: fetch libraries → enriched game list
├── components/                 # Shared UI components
├── lib/
│   ├── types.ts                # Shared TypeScript types (SteamGame, SteamUser, etc.)
│   ├── api-cache.ts            # Cache-first wrapper — all external calls go through here
│   ├── steam.ts                # Steam API client (user/library endpoints)
│   ├── steam-store.ts          # Steam Store API client (game enrichment)
│   ├── steamspy.ts             # SteamSpy client with 1 req/sec queue
│   └── db.ts                   # D1 query helpers
├── wrangler.jsonc              # Cloudflare config (D1 + KV bindings)
└── .dev.vars                   # Local secrets — NEVER commit this
```

Import alias `@/*` maps to the repo root (e.g. `@/lib/steam`).

## Coding Guidelines

- Follow ESLint config (eslint-config-next). Run `npm run lint` before finishing.
- Use ES6+ and TypeScript strictly. No `any` — use proper types.
- Use descriptive names: `resolvedSteamIds`, not `ids`.
- Check for existing components before creating new ones.
- No comments unless the WHY is non-obvious.

### Components

- Server Components by default in the App Router. Add `"use client"` only when you need browser APIs, event handlers, or React state.
- Keep server-side data fetching in Server Components or route handlers — don't leak API keys to the client.

### API Routes (`app/api/`)

- All Steam API calls go through server-side route handlers to keep `STEAM_API_KEY` off the client.
- Steam API key is `process.env.STEAM_API_KEY`. In local dev it comes from `.dev.vars`.

### External API calls — cache first, always

Never call Steam or SteamSpy directly. All external calls go through `lib/api-cache.ts`, which checks KV or D1 before hitting the upstream API and writes on a miss. A call that could be served from cache and isn't is a bug. See PLAN.md "API Caching Layer" for TTLs and key patterns.

## Cloudflare / Wrangler

- Local dev with full D1/KV emulation: `wrangler dev` (not `npm run dev`)
- `npm run dev` works for UI-only changes but won't have D1/KV bindings
- D1 binding name: `DB`. KV binding name: `STEAM_CACHE`
- Run D1 migrations: `wrangler d1 execute steam-game-finder --file=./schema.sql`
- Deploy: `wrangler pages deploy` or push to GitHub (auto-deploy if connected)
- Access Cloudflare env bindings in route handlers via the `cloudflare` context — read `node_modules/next/dist/docs/` for the pattern used in this Next.js version

## External APIs

This project integrates two external APIs for game data. Full specs are in markdown files at the repo root — read them before touching anything in `lib/steam.ts`, `lib/steam-store.ts`, or `lib/steamspy.ts`.

| API | Spec file | Rate limit | Key required |
|-----|-----------|------------|--------------|
| Steam Web API | `steamapi.md` | 100,000 calls/day | Yes — `STEAM_API_KEY` |
| Steam Store API | `steam-store.md` | ~200 req/5 min | No |
| SteamSpy | `steamspy.md` | 1 req/sec | No |

All calls go through `lib/api-cache.ts` — never call these APIs directly. See PLAN.md for caching strategy and TTLs.

## Misc

- Use `.ai/temp/` for scratch files — it is in `.gitignore`
- Never commit `.dev.vars` (already in `.gitignore`)
- When Tailwind v4 changes aren't reflected, check that `globals.css` has `@import "tailwindcss"` and restart the dev server
- `npm run build` compiles for Cloudflare via the opennextjs adapter; run it to catch edge-runtime incompatibilities before deploying

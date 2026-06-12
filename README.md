# Steam Game Finder

Find games your friend group can all play together. Enter Steam profiles, compare libraries, filter by co-op/multiplayer.

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A [Steam Web API key](https://steamcommunity.com/dev/apikey)

## Running locally

**1. Install dependencies**

```bash
npm install
```

**2. Create `.dev.vars`** (never commit this file — it's in `.gitignore`)

```
STEAM_API_KEY=your_steam_api_key_here
```

**3. Set up the local D1 database**

```bash
npx wrangler d1 execute steam-game-finder --file=./schema.sql --local
```

**4. Start the dev server**

```bash
npx wrangler dev
```

Open [http://localhost:3000](http://localhost:3000). This gives you full D1/KV emulation. Hot reload works normally.

> `npm run dev` also works for UI-only changes but won't have database or KV bindings.

## Deploying to Cloudflare Workers

**1. Log in to Cloudflare**

```bash
npx wrangler login
```

**2. Create the D1 database** (first time only)

```bash
npx wrangler d1 create steam-game-finder
```

Copy the `database_id` from the output into `wrangler.jsonc` if it differs from the one already there.

**3. Apply the database schema** (first time only)

```bash
npx wrangler d1 execute steam-game-finder --file=./schema.sql --remote
```

**4. Set your Steam API key as a secret**

```bash
npx wrangler secret put STEAM_API_KEY
```

Paste your key when prompted.

**5. Deploy**

```bash
npm run deploy
```

Your worker will be live at `https://steam-game-finder.<your-subdomain>.workers.dev`.

## Subsequent deploys

```bash
npm run deploy
```

That's it — builds and deploys in one command.

## Tech stack

| Layer | What |
|---|---|
| Framework | Next.js 16 (App Router) |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Styling | Tailwind CSS v4 |

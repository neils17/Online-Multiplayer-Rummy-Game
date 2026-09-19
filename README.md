# Online Multiplayer Rummy Game

A mobile-friendly, browser-based Indian 13-card rummy game for two players, with private invite codes and a practice dealer.

## Features

- Online multiplayer across networks and a bot practice mode.
- One- or two-deck games, expert mode, and configurable match score limits.
- Drag-and-drop grouping, smooth card movement, double-tap discarding, and automatic arrangement.
- Classic casino styling, complete card artwork, and detailed round scoreboards.
- Special all-natural sets and all-natural sequences wins with double opponent penalties.

## Development

Use Node.js 22.13 or later and npm.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the local URL printed by the development server. The app uses React, TypeScript, Vinext/Vite, Cloudflare Workers, and a D1 database via Drizzle. The local Cloudflare integration provides the development database; schema migrations are in `drizzle/`.

```sh
npm run build
node --experimental-strip-types tests/game.test.mjs
node --experimental-strip-types tests/match-rules.test.mjs
```

Additional tests live in `tests/`; API tests require the local server. Some component tests use an esbuild bundle.

## Project layout

- `app/`: game interface and server API.
- `lib/`: rules, scoring, arrangement, bot decisions, and animation helpers.
- `hooks/`: gestures, animation, and responsive layout.
- `components/game/`: card faces, discard pile, rules, and scoreboards.
- `db/` and `drizzle/`: database schema and migrations.
- `public/`: card images and other game assets.

## Hosting

The existing game is hosted at https://rummy.nsankineni-99.chatgpt.site. `.openai/hosting.json` identifies that Sites deployment and its `DB` binding. Uploading this repository to GitHub does not move or redeploy the live game. GitHub Pages alone cannot run the multiplayer backend; another deployment requires a compatible Workers runtime, D1 database, and migrations.

## Assets and local data

Card face attribution and licensing are in `public/cards/README.md` and `public/cards/LICENSE.txt`. Other artwork includes user-supplied assets; this repository does not grant additional rights to those images.

Local credentials, environment files, dependencies, build output, and runtime database files are excluded. Live rooms and player data are stored by the hosting service and are not part of this repository.

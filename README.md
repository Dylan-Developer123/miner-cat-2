# ⛏️ Miner Cat 2 — self-hosted edition

A complete, playable Miner Cat 2 digging game you can host yourself **for free**.
Includes accounts (username + password + display name), server-side saves with
1-minute autosave, a coins leaderboard, and an admin/developer account.

## What you get

- 25 stages, 50 blocks deep each — stage 25 goes on forever
- 21-block-wide mine with bedrock borders, spawn in the middle
- 100 health, mineable lava (25 damage/sec), armor upgrades
- Upgrades: pickaxe, armor, backpack size
- Ores get rarer the deeper you go — diamond is the rarest (no crystal)
- Achievements, backpack, "Go to Spawn" button with auto-sell
- The **first account ever created** automatically becomes the admin/owner
  with a **DEVELOPER** tag and admin powers (coins, heal, upgrades, stage jump)

## Deploy free on Render (step by step)

You need: a free [Render](https://render.com) account and a free
[GitHub](https://github.com) account. ~10 minutes.

1. **Put this project on GitHub**
   - Create a new repository at github.com/new (name it `miner-cat-2`).
   - Upload these files (or push with git):
     - `server.js`, `package.json`, `render.yaml`, `README.md`
     - the whole `public/` folder (`index.html`, `styles.css`, `game.js`)

2. **Deploy with the blueprint**
   - In Render: **New +** → **Blueprint** → connect your GitHub → pick the
     `miner-cat-2` repo.
   - Render reads `render.yaml` and creates a **free** web service.
   - Click **Apply**. Wait 2–3 minutes for the first build.

3. **Open your game**
   - Render gives you a URL like `https://miner-cat-2.onrender.com`.
   - Open it, create the first account — that account becomes the **admin**.

4. **Play!** Create more accounts for friends; everyone appears on the
   coins leaderboard.

## Free-tier notes (important)

- **Sleeping:** the free tier sleeps after ~15 minutes with no visitors.
  The first visit after sleep takes **30–60 seconds** to wake up — just wait,
  it will load.
- **Data resets on redeploy:** game accounts and saves live in a SQLite file
  on the server's disk, and Render's free tier **wipes the disk on every
  redeploy**. For a small friends-and-family game this is usually fine, but
  if you want permanent data, attach Render's managed Postgres (paid) and set
  `DATABASE_URL` — the schema is simple to port (`users`, `saves`, `sessions`).
- You can change the SQLite location with the `DB_PATH` environment variable.

## Run it on your own computer

```bash
npm install
npm start
# open http://localhost:3000
```

## Project layout

```
server.js        Express API + SQLite (accounts, sessions, saves, leaderboard, admin)
public/
  index.html     Auth screens + game UI shell
  styles.css     Bright cream/beige rounded-panel theme
  game.js        Full game: world gen, physics, mining, rendering, UI
render.yaml      One-click Render blueprint (free tier)
```

# 🌾 Team Farm Explorer — Real-Time Multiplayer (Kudos Economy Edition)

A live, shared farm for team bonding — now with a game economy that ties
**every crop the team grows directly back to recognizing each other**.

---

## 🌱 How the new economy works

1. **Seeds only come from sending kudos.** Recognize a teammate on the Kudos
   Board and the *team* earns one random seed (one of 6 crop types) into a
   shared Seed Bank. No kudos = no seeds = nothing to grow.
2. **Planting spends a seed.** When you till a plot and go to plant, you can
   only choose crop types the team actually has seeds banked for — the Plant
   menu greys out anything you don't have.
3. **Harvesting fills the shared Harvest Basket** with the grown crop.
4. **Animals are picky eaters.** Chickens ONLY eat corn 🌽, cows ONLY eat
   carrots 🥕, sheep ONLY eat strawberries 🍓 — no substitutes. The team has
   to deliberately grow (and therefore deliberately earn seeds for) the right
   crop to raise each animal.
5. **Leaderboards keep everyone accountable** — "Top Kudos Givers" sits right
   alongside "Master Growers" and "Best Caretakers," so the team can see at a
   glance who's remembering to recognize others, not just who's farming.

This turns kudos from a "nice to have" side feature into the literal engine
that makes the whole farm run — the more the team recognizes each other, the
more it can grow together.

---

## What's inside

```
team-farm-explorer/
├── server.js         # The multiplayer server (holds the shared farm state)
├── package.json
├── public/
│   └── index.html    # The game client (everything players see/interact with)
└── README.md          # You're reading it
```

This is a small Node.js project with **zero external dependencies** (it only
uses Node's built-in `http` module), so it's easy to deploy anywhere that
runs Node.

## How it works (in plain terms)

- The **server** keeps one shared copy of the farm (who's playing, crops,
  animals, the seed bank, the harvest basket, kudos, decorations) in memory.
- Every player's browser polls the server about once a second to see what
  everyone else has done, and sends a request every time *they* do something.
- Because state lives in the server's memory, **it resets if the server
  restarts** (e.g. a free host spinning down from inactivity, or a redeploy).
  That's fine for a single team-social "season" — use the in-game
  **New Season** button anytime you want a clean slate.

---

## 🚀 Deploy it in ~5 minutes (Render, free, no credit card)

1. **Get the code onto GitHub:**
   - Create a new repository on [github.com](https://github.com).
   - If the repo is empty, use the **"uploading an existing file"** link on
     the Quick Setup page (or create one small file first, like a README, so
     the normal **Add file → Upload files** button appears).
   - Upload `server.js`, `package.json`, `README.md`, and the whole `public`
     folder, then commit.

2. **Deploy on [render.com](https://render.com):**
   - Sign up (GitHub login works great — no card needed).
   - Click **New +** → **Web Service**, connect your GitHub account, and
     select your repo.
   - Confirm these settings:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Instance Type:** Free
   - Click **Create Web Service** and wait ~1–2 minutes.

3. **Share the live URL** Render gives you (e.g.
   `https://team-farm-explorer.onrender.com`) with your team.

### Good to know
- Free Render services sleep after 15 minutes of no visitors and take
  ~30–60 seconds to wake up on the next request — open the link yourself a
  minute before your team social to warm it up.
- To update the game later, re-upload changed files to the same GitHub repo
  — Render auto-redeploys on every push (this resets the current season).

---

## Alternative: run it yourself on any computer/server

```bash
npm install    # no-op here since there are no dependencies, but harmless
npm start
```

Listens on port `3000` by default — open `http://<that-computer's-address>:3000`
from any device on the same network. Set the `PORT` environment variable to
use a different port.

---

## Limitations to know about

- **No persistence** — state lives in memory only. A server restart clears
  the farm (roster included).
- **Single shared farm per deployment** — everyone who opens the URL lands
  on the same farm. Deploy separate instances for separate teams.
- **Casual-scale** — built for a team of roughly 2–30 people on a shared
  social, not a large-scale production service.

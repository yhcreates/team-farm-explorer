# 🌾 Team Farm Explorer — Real-Time Multiplayer

A live, shared farm for team bonding. Recognize a teammate → the team earns a
seed → grow it (over real days) → feed the animals — with farmers you can
customize (including uploading your own photo!), wandering animals, and a
clear shared farm name for everyone.

---

## 🆕 What's in this update

1. **Farm name now shows in the header and browser tab title** once someone
   sets it — no more wondering if you're really on the same farm as everyone
   else.
2. **"My Farmer" modal has a proper close (✕) button** in the top-right
   corner, so you can back out without editing your look or leaving the farm.
3. **Upload a photo for your farmer's face!** In the character creator, click
   **"📷 Upload Photo"** to use a headshot instead of the default face. It's
   automatically resized/compressed client-side to a small square before
   being sent, and shows up for everyone on the shared farm. Remove it
   anytime with the "✕ Remove Photo" button.
4. **Custom farm-themed cursor** — hovering over anything walkable/
   interactive on the farm now shows a small hoe icon instead of the generic
   browser pointer.
5. **Animals wander on their own!** Chickens, the cow, and the sheep now
   randomly roam within their pen every few seconds, entirely server-side,
   so everyone sees the same movement — the pen actually feels alive.

---

## 🌱 The kudos economy (recap)

1. **Seeds only come from sending kudos** — recognizing a teammate earns the
   team one completely random seed.
2. **Sentiment ≠ seed.** The sentiment you pick (why you're recognizing
   someone) is fully decoupled from the random seed reward. Tailor your own
   sentiment tags anytime via "+ Add a new sentiment tag."
3. **Planting spends a seed**, **harvesting fills a shared basket**, and
   **animals are picky eaters** (each only accepts its own liked crop).
4. **Leaderboards** track Top Kudos Givers, Master Growers, and Best
   Caretakers.

## ⏱️ Growth timing (recap)

Crops grow over real calendar days (🥕 Carrot 1 day → 🎃 Pumpkin 7 days, the
max). Watering is an optional booster (up to 30% faster), but real time
always has to pass.

## ⚠️ Persistence still matters

Because growth can take up to a week, the server persists its state to a
local `farm-state.json` file after every action. **This only protects your
data if wherever you host it keeps that file around** — see the hosting
guidance below (free tiers with no persistent disk will lose progress).

---

## What's inside

```
team-farm-explorer/
├── server.js         # Multiplayer server (state, economy, growth, animal AI, persistence)
├── package.json
├── public/
│   └── index.html    # Game client (rendering, photo upload, character creator, UI)
└── README.md
```

Zero external dependencies — only Node's built-in `http` and `fs` modules.

---

## 🚀 Updating your existing deployment

1. Unzip this package.
2. On your GitHub repo, **Add file → Upload files**, drop in `server.js`,
   `package.json`, `README.md`, and the `public` folder (same-named files
   overwrite automatically).
3. Commit — your host auto-redeploys.

## 🚀 First-time deploy (recommended: Render Starter + persistent disk)

Free tiers spin down after 15 minutes idle and have no persistent disk —
since crops now take real days to grow, this will likely lose progress. For
reliable multi-day growth:

1. Create a GitHub repo and upload these files.
2. Sign up at [render.com](https://render.com).
3. **New +** → **Web Service** → connect your repo.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Starter (or higher) — not Free
4. Add a small persistent disk (~1GB) from the service's **Disks** page so
   `farm-state.json` survives restarts/redeploys.
5. Share the live URL with your team.

**Alternative:** self-host on an always-on internal machine — no special
config needed, just keep the folder and process running.

```bash
npm install    # no-op (no dependencies), but harmless
npm start
```

---

## Limitations to know about

- **Single shared farm per deployment.**
- **Casual-scale** — built for a team of roughly 2–30 people, not a
  large-scale production service.
- **Photos are stored as compressed data URLs** in the shared state file —
  fine for a small team's headshots, but not meant for hundreds of users.

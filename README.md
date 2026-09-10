# 🌾 Team Farm Explorer — Real-Time Multiplayer (Kudos Economy + Multi-Day Growth)

A live, shared farm for team bonding. Recognize a teammate → the team earns a
seed → grow it → feed the animals — and now, crops grow over real **days**
(not minutes), so this plays out as an ongoing "check in throughout the
week" activity rather than something you finish in one sitting.

---

## 🌱 The kudos economy

1. **Seeds only come from sending kudos.** Recognize a teammate on the Kudos
   Board and the *team* earns one random seed into a shared Seed Bank.
2. **Planting spends a seed** — you can only plant crop types the team has
   seeds banked for.
3. **Harvesting fills a shared Harvest Basket.**
4. **Animals are picky eaters** — chickens ONLY eat corn 🌽, cows ONLY eat
   carrots 🥕, sheep ONLY eat strawberries 🍓. No substitutes.
5. **Leaderboards** track Top Kudos Givers alongside Master Growers and Best
   Caretakers.

## ⏱️ Growth timing — now measured in days (max ~1 week)

| Crop | Grow time |
|---|---|
| 🥕 Carrot | **1 day** |
| 🌽 Corn | **1.5 days** |
| 🍅 Tomato | **2 days** |
| 🌻 Sunflower | **3 days** |
| 🍓 Strawberry | **4.5 days** |
| 🎃 Pumpkin | **7 days** (the max) |

These preserve the same relative order as real-world "days to maturity" for
each crop (fast root vegetables quicker, large vine fruit slower), compressed
so the slowest crop tops out at one week. **Watering is optional** — each
watering (up to 3 per plot) shaves 10% off the remaining time (30% max), but
real days always have to pass; nobody can rush a crop by clicking.

## ⚠️ IMPORTANT: this requires the server to keep running (read this before deploying)

Because crops can now take up to 7 real days to grow, **the server's saved
state must survive that entire week** — including any restarts. I've built
in file-based persistence (the server writes its state to a local file after
every action and reloads it on startup), but **this only actually protects
your data if wherever you host it keeps that file around**:

- **Render's free tier will NOT work reliably for this.** Free services spin
  down after 15 minutes of no visitors, and — critically — free tier has
  **no persistent disk option at all**, so every spin-down wipes the
  server's local files, including all growing crops, seeds, and kudos.
  Since nobody is likely to visit every 15 minutes for a full week, this
  will very likely lose progress.
- **Your options to make multi-day growth actually work:**
  1. **Upgrade to Render's paid "Starter" plan (~$7/month)** *and* attach a
     small persistent disk (~$0.25/GB/month, 1GB is plenty). The paid plan
     removes the 15-minute spin-down, and the disk survives restarts/redeploys.
     In Render, add this from your service's **Disks** page — just make sure
     the disk's mount path matches where this app is deployed (see Render's
     disk docs for the mount path for Node apps), or simplest: mount it at
     `/var/data` and I can adjust `STATE_FILE` in `server.js` to write there.
  2. **Self-host on an always-on machine** (an internal office server, a
     spare always-on computer, etc.). As long as the machine and the
     `farm-state.json` file next to `server.js` aren't deleted, growth
     continues correctly across any restarts — no special configuration
     needed, this is the simplest option if you have access to one.
- If you go with option 1 or 2, no other changes are needed — the
  persistence logic is already built in and tested.

---

## What's inside

```
team-farm-explorer/
├── server.js         # The multiplayer server (holds + persists shared farm state)
├── package.json
├── public/
│   └── index.html    # The game client
├── farm-state.json    # Auto-created by the server the first time it runs — this is where all progress is saved
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
4. **If you're still on Render's free tier**, read the warning above first —
   consider upgrading before relying on multi-day crops, or your team's
   progress may vanish between check-ins.

## 🚀 First-time deploy

**Recommended: Render Starter plan + persistent disk (~$7.25/month total)**
1. Create a GitHub repo and upload these files.
2. Sign up at [render.com](https://render.com).
3. **New +** → **Web Service** → connect your repo.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Starter (or higher) — NOT Free
4. After creating the service, go to its **Disks** page, add a small disk
   (1GB is plenty), and set its mount path per Render's Node.js guidance.
5. Share the live URL with your team.

**Alternative: self-host on an always-on internal machine**
```bash
npm install    # no-op (no dependencies), but harmless
npm start
```
Listens on port `3000` by default (`PORT` env var to change it). As long as
the machine stays on and the folder isn't deleted, growth persists correctly
across any restarts of the app itself.

---

## Limitations to know about

- **Single shared farm per deployment.**
- **Casual-scale** — built for a team of roughly 2–30 people, not a
  large-scale production service.
- If you truly can't avoid a spin-down-prone free host, consider shortening
  the grow durations in `CROP_GROWTH_MS` (both in `server.js` and
  `public/index.html` — keep them identical) to something under 15 minutes
  so a single sitting reliably survives without a restart.

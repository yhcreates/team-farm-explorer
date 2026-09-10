# 🌾 Team Farm Explorer — Real-Time Multiplayer (Kudos Economy + Real Growth Timing)

A live, shared farm for team bonding — with a game economy that ties every
crop the team grows back to recognizing each other, and growth times that
actually take a little real time (so the game doesn't blow through an entire
season in two minutes of clicking).

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
   Caretakers, so the team stays accountable for recognizing each other, not
   just farming.

## ⏱️ Growth timing (new)

Crops now grow over **real elapsed time** instead of finishing the instant
you spam-click "water." Each crop's grow time is scaled proportionally from
real-world "days to maturity" horticultural averages (~3 in-game seconds per
real-world day):

| Crop | Approx. real days to maturity | In-game grow time |
|---|---|---|
| 🥕 Carrot | ~70 days | **3:30** |
| 🌽 Corn | ~75 days | **3:45** |
| 🍅 Tomato | ~75 days | **3:45** |
| 🌻 Sunflower | ~85 days | **4:15** |
| 🍓 Strawberry | ~100 days | **5:00** |
| 🎃 Pumpkin | ~110 days | **5:30** |

**Watering is now optional**, not required — it's a small booster. Each
watering (up to 3 per plot) shaves 10% off the remaining grow time (up to
30% faster total), rewarding attentiveness without letting anyone rush a
crop to ripeness by clicking. A live countdown and a pulsing golden glow
appear on each plot so the team can see at a glance what's growing and
what's ready.

## 🖥️ Other improvements in this update

- **Bigger farm view** — the game canvas is now ~24% larger (936×624 vs. the
  original 756×504), giving more visual breathing room without changing the
  map layout.
- **Sidebar layout** — the Kudos Wall and Leaderboards now live in a sticky
  sidebar next to the farm (instead of below it), so they stay visible while
  playing. On narrower screens, it gracefully stacks below the farm instead.
- **Harvest badge** — the Harvest action button now shows a live count of
  how many plots on the whole farm are ready to pick.
- **Grow-time preview** — the Plant menu shows each crop's grow time and
  sorts fastest-to-slowest, so the team can pick strategically (e.g., plant
  something fast if time's short before the social wraps up).
- **Gentle kudos reminder** — if 5 minutes pass with no kudos sent, a soft
  toast nudges the team to recognize someone (never more than once every 5
  minutes, never intrusive).

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

Zero external dependencies — only Node's built-in `http` module.

## How it works (in plain terms)

- The **server** keeps one shared copy of the farm in memory.
- Every player's browser polls the server about once a second and sends a
  request every time they act.
- State resets if the server restarts (e.g. free-host inactivity spin-down).
  Use the in-game **New Season** button anytime you want a clean slate.

---

## 🚀 Updating your existing deployment (Render)

1. Unzip this package.
2. On your existing GitHub repo, click **Add file → Upload files** (or drag
   the files onto the file list) and drop in `server.js`, `package.json`,
   `README.md`, and the `public` folder. Same-named files overwrite
   automatically.
3. Commit — Render auto-redeploys within a minute or two (this resets the
   current season's crops/seeds/kudos; your team roster stays).

## 🚀 First-time deploy (Render, free, no credit card)

1. Create a new repo on [github.com](https://github.com). If it's empty,
   use the **"uploading an existing file"** link on the Quick Setup page.
2. Sign up at [render.com](https://render.com) (GitHub login works great).
3. **New +** → **Web Service** → connect your repo. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. **Create Web Service**, wait ~1–2 minutes, then share the live URL.

### Good to know
- Free Render services sleep after 15 minutes idle and take ~30–60 seconds
  to wake up — open the link yourself a minute before your social starts.

---

## Alternative: run it yourself

```bash
npm install    # no-op (no dependencies), but harmless
npm start
```

Listens on port `3000` by default (`PORT` env var to change it).

---

## Limitations to know about

- **No persistence** — state lives in memory only; a restart clears the farm.
- **Single shared farm per deployment.**
- **Casual-scale** — built for a team of roughly 2–30 people on a shared
  social, not a large-scale production service.

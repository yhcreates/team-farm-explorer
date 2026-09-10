# 🌾 Team Farm Explorer — Real-Time Multiplayer

A live, shared farm for team bonding. Recognize a teammate → earn a seed →
grow it (over real days) → sell it or feed animals → spend coins to
decorate and expand your farm — all together, in real time.

---

## 🆕 What's in this update

1. **Photo sizing controls.** Uploaded photos now render noticeably larger
   on your farmer's face (so they're actually recognizable at a glance), and
   the character creator now has a **zoom slider** — drag it to reframe your
   headshot tighter or looser before joining/saving. Re-upload the same
   photo anytime to adjust the zoom again.
2. **Every crop now has a purpose.** Previously, sunflowers, pumpkins, and
   tomatoes had no animal to feed them and just sat in the basket. Now
   there's a **Market** — walk up to the stall (near the barn) or click
   "Open Market" anytime, and sell ANY harvested crop or animal product for
   coins. Slower-growing crops (which tie up a plot longer) sell for more.
3. **Coins fund Build & Expand.** Decorations now cost coins (in addition to
   the existing points-based unlock tiers), and there's a brand-new
   **"Expand Farm"** tab where the team can permanently unlock new plots of
   farmland using coins — literally growing the size of your farm.

---

## 💰 The new Market economy

| Item | Sells for |
|---|---|
| 🥕 Carrot | 4 coins |
| 🌽 Corn | 5 coins |
| 🍅 Tomato | 6 coins |
| 🌻 Sunflower | 8 coins |
| 🍓 Strawberry | 10 coins |
| 🎃 Pumpkin | 14 coins |
| 🥚 Eggs | 8 coins |
| 🥛 Milk | 12 coins |
| 🧶 Wool | 16 coins |

Coins are shared by the whole team (like the seed bank and harvest basket).
Spend them in **🏗️ Build & Expand**:
- **Decorations** now require both a points tier (from the team's total
  harvests + animal products) AND a coin payment — ranging from 15 coins
  (Flower Patch, Garden Rock) up to 250 coins (Rainbow Arch, Team Statue).
- **Farm Expansions** permanently unlock new farmland:
  - 🗺️ **South Field** — 8 new plots, 150 coins
  - 🗺️ **East Field** — 6 new plots, 300 coins

Once unlocked, an expansion's tiles work exactly like the original field —
till, plant, water, harvest — forever (well, until a "New Season" reset).

---

## 🌱 The kudos economy (recap)

Seeds only come from sending kudos (fully random, decoupled from the
sentiment you pick). Sentiments are tailorable — add your own custom tags
anytime. Animals are still picky eaters (chicken/corn, cow/carrot,
sheep/strawberry) for their happiness-and-product loop, but now every crop
also has a Market buyer, so nothing grown is ever wasted.

## ⏱️ Growth timing (recap)

Crops grow over real calendar days (🥕 Carrot 1 day → 🎃 Pumpkin 7 days).
Watering is an optional booster (up to 30% faster).

## ⚠️ Persistence still matters

Because growth can take up to a week, the server persists everything
(including coins and unlocked expansions) to `farm-state.json` after every
action — but this only survives restarts if your hosting keeps that file
around. Free hosting tiers with no persistent disk will lose progress; see
hosting guidance below.

---

## What's inside

```
team-farm-explorer/
├── server.js         # Multiplayer server (state, economy, market, expansions, growth, animal AI, persistence)
├── package.json
├── public/
│   └── index.html    # Game client (rendering, photo upload+zoom, Market, Build & Expand UI)
└── README.md
```

Zero external dependencies — only Node's built-in `http` and `fs` modules.

---

## 🚀 Updating your existing deployment

1. Unzip this package.
2. On your GitHub repo, **Add file → Upload files**, drop in `server.js`,
   `package.json`, `README.md`, and the `public` folder (same-named files
   overwrite automatically).
3. Commit — your host auto-redeploys. This resets the current season's
   progress (crops, coins, expansions, kudos) — your farmer roster and
   custom sentiments stay.

## 🚀 First-time deploy (recommended: Render Starter + persistent disk)

1. Create a GitHub repo and upload these files.
2. Sign up at [render.com](https://render.com).
3. **New +** → **Web Service** → connect your repo.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Starter (or higher) — not Free
4. Add a small persistent disk (~1GB) from the service's **Disks** page.
5. Share the live URL with your team.

**Alternative:** self-host on an always-on internal machine.

```bash
npm install    # no-op (no dependencies), but harmless
npm start
```

---

## Limitations to know about

- **Single shared farm per deployment.**
- **Casual-scale** — built for a team of roughly 2–30 people.
- **Photos are stored as compressed data URLs** in the shared state file —
  fine for a small team, not meant for hundreds of users.

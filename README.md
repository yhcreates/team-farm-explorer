# 🌾 Team Farm Explorer — Real-Time Multiplayer

A live, shared farm for team bonding. Recognize a teammate → earn a seed →
grow it (over real days) → sell it or feed animals → spend coins to
decorate, expand your farm, and buy more animals — all together, live.

---

## 🆕 What's in this update

1. **A direct path between the field and the pen.** Previously the only
   route from the farmland to the animal pen was a long loop around the top
   corridor. There's now a shortcut: a 1-tile gap cuts straight through the
   shared fence line partway down the field, roughly halving travel time.
2. **Much simpler lock indicators.** The two locked field-expansion zones
   used to show a 🔒 icon and coin-cost label on *every single tile*
   (18 tiles each) — visually noisy. Now each locked zone is just a clean,
   flat grey block with **one** 🔒 + cost label in the middle. Same
   information, far less clutter.
3. **A "Close" button in My Farmer.** Alongside "Leave Farm" and "Edit My
   Look," there's now a plain **Close** button for when you just want to
   back out without changing anything (the small ✕ in the corner still
   works too).
4. **Buy Animals.** Build & Expand has a new **"🐣 Buy Animals"** tab —
   spend coins to add more chickens, cows, or sheep to your pen. Each
   purchase costs a bit more than the last (per animal type), so it stays
   balanced instead of letting the pen get spammed. New animals spawn into
   a free spot in the pen and wander just like the originals.

| Animal | Starting cost | Cost increase per owned |
|---|---|---|
| 🐔 Chicken | 50 coins | +25 each |
| 🐄 Cow | 100 coins | +50 each |
| 🐑 Sheep | 100 coins | +50 each |

---

## 🗺️ The field (recap)

84 total farmland tiles: 48 open from the start, plus two purchasable
"Field Expansion" tiers (18 tiles each, 200 and 400 coins) that permanently
unlock more of the *same* contiguous field.

## 💰 The Market economy (recap)

Every crop and animal product sells for coins — including sunflowers,
pumpkins, and tomatoes, which no animal eats. Coins fund Build & Expand:
decorations (coins only), field expansions, and now buying more animals.

## 🌱 The kudos economy (recap)

Seeds only come from sending kudos (fully random, decoupled from the
sentiment you pick — sentiments are tailorable, add your own anytime).

## ⏱️ Growth timing (recap)

Crops grow over real calendar days (🥕 Carrot 1 day → 🎃 Pumpkin 7 days).
Watering is an optional booster (up to 30% faster).

## ⚠️ Persistence still matters

Because growth can take up to a week, the server persists everything to
`farm-state.json` after every action — this only survives restarts if your
hosting keeps that file around. See hosting guidance below.

---

## What's inside

```
team-farm-explorer/
├── server.js         # Multiplayer server (state, economy, market, expansions, animal purchases, growth, animal AI, persistence)
├── package.json
├── public/
│   └── index.html    # Game client (rendering, photo drag/zoom editor, Market, Build & Expand UI incl. Buy Animals)
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
   progress (crops, coins, expansions, purchased animals, kudos) — farmer
   roster and custom sentiments stay.

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
- **Animal cap** of 16 total (across all types) so the pen never visually
  overflows.
- **Photos are stored as compressed data URLs** in the shared state file —
  fine for a small team, not meant for hundreds of users.

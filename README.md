# 🌾 Team Farm Explorer — Real-Time Multiplayer

A live, shared farm for team bonding. Recognize a teammate → earn a seed →
grow it (over real days) → sell it or feed animals → spend coins to
decorate and expand your farm — all together, in real time.

---

## 🆕 What's in this update

1. **Clearer rules at a glance.** A new "Farm Loop" ribbon at the top of the
   page always shows the whole game loop in one line: 💌 Kudos → 🌱 Seed →
   🌾 Grow → 🧺 Harvest → 💰 Sell/🍽️ Feed → 🏗️ Build & Expand. The How-to-Play
   modal leads with the same summary before the detailed steps.
2. **Photo repositioning.** The character creator's photo uploader is now a
   real cropper: after uploading, **drag inside the circular preview** to
   reposition your face, and use the zoom slider to get in closer. The final
   crop is computed live as you drag.
3. **Decorations cost coins only.** Removed the old "points tier" gate that
   used to sit alongside the coin cost — every decoration can now be bought
   the moment your team can afford it, full stop.
4. **A much bigger canvas and a much bigger field.** The farm is now
   1144×728 (up from 936×624), and the farmland grid grew from 24 tiles to
   **84 tiles** — 48 open from the start, plus 36 more behind two
   purchasable "Field Expansion" tiers. Crucially, the locked tiles are part
   of the *same* big field (not a separate zone elsewhere on the map) — they
   render right there as greyed-out soil with a 🔒 and the unlock cost
   printed directly on the tile, so the rule is obvious without opening any
   menu.

---

## 🗺️ The new field

| Section | Tiles | Status |
|---|---|---|
| Open field | 48 | Available from the start |
| Field Expansion I | 18 | 🔒 200 coins to unlock |
| Field Expansion II | 18 | 🔒 400 coins to unlock |

Once unlocked, an expansion's tiles work exactly like the rest of the field
— till, plant, water, harvest — forever (until a "New Season" reset).

## 💰 The Market economy (recap)

Every crop and animal product sells for coins — including sunflowers,
pumpkins, and tomatoes, which no animal eats. Coins fund **Build & Expand**:
- **Decorations** — coins only, 15 to 250 depending on the item.
- **Field Expansions** — permanently grow the farm itself (see table above).

## 🌱 The kudos economy (recap)

Seeds only come from sending kudos (fully random, decoupled from the
sentiment you pick — sentiments are tailorable, add your own anytime).
Animals are picky eaters (chicken/corn, cow/carrot, sheep/strawberry) and
also wander their pen on their own.

## ⏱️ Growth timing (recap)

Crops grow over real calendar days (🥕 Carrot 1 day → 🎃 Pumpkin 7 days).
Watering is an optional booster (up to 30% faster).

## ⚠️ Persistence still matters

Because growth can take up to a week, the server persists everything to
`farm-state.json` after every action — but this only survives restarts if
your hosting keeps that file around. Free hosting tiers with no persistent
disk will lose progress; see hosting guidance below.

---

## What's inside

```
team-farm-explorer/
├── server.js         # Multiplayer server (state, economy, market, expansions, growth, animal AI, persistence)
├── package.json
├── public/
│   └── index.html    # Game client (rendering, photo drag/zoom editor, Market, Build & Expand UI)
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
   progress (crops, coins, expansions, kudos) — farmer roster and custom
   sentiments stay.

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

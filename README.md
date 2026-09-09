# 🌾 Team Farm Explorer — Real-Time Multiplayer

A live, shared farm for team bonding. Everyone who opens the link joins the
**same farm** and sees each other walking around, tilling soil, planting
crops, feeding animals, and leaving kudos — all in real time.

This is a small Node.js project with **zero external dependencies** (it only
uses Node's built-in `http` module), so it's easy to deploy anywhere that
runs Node.

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

## How it works (in plain terms)

- The **server** keeps one shared copy of the farm (who's playing, crops,
  animals, kudos, decorations) in memory.
- Every player's browser polls the server about once a second to see what
  everyone else has done, and sends a request every time *they* do something
  (till, plant, water, harvest, feed, post kudos, place a decoration).
- Because state lives in the server's memory, **it resets if the server
  restarts** (e.g. a free host spinning down from inactivity, or a redeploy).
  That's totally fine for a single team-social "season" — just use the
  in-game **New Season** button when you want a clean slate, and know that a
  long-idle server will start fresh next time it wakes up.

---

## 🚀 Deploy it in ~5 minutes (Render, free, no credit card)

I recommend **[Render](https://render.com)** because, as of today, it's one
of the only hosts that gives you a real, always-running Node server for free
with no credit card required. The one trade-off: a free Render service goes
to sleep after 15 minutes with no visitors, and takes ~30–60 seconds to wake
back up on the next request — so if you're kicking off a team social, open
the link a minute early to "wake it up" before everyone joins.

**Steps:**

1. **Get the code onto GitHub** (Render deploys from a Git repo):
   - Create a new, empty repository on [github.com](https://github.com) (e.g. `team-farm-explorer`).
   - Upload all the files in this folder to that repo (drag-and-drop works fine on GitHub's web UI, or use `git push` if you're comfortable with Git).

2. **Create the Render service:**
   - Go to [render.com](https://render.com) and sign up (GitHub, GitLab, or Google login — no card needed).
   - Click **New +** → **Web Service**.
   - Connect your GitHub account and pick the repo you just created.
   - Render will auto-detect it's a Node app. Confirm these settings:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Instance Type:** Free
   - Click **Create Web Service**.

3. **Wait ~1–2 minutes** for the first deploy to finish. Render will give you
   a live URL like `https://team-farm-explorer.onrender.com`.

4. **Share that URL with your team** — everyone who opens it joins the same
   live farm. 🎉

### Updating the game later
Just push changes to the same GitHub repo — Render automatically redeploys
on every push (this will also reset the current season's farm state).

---

## Alternative: run it yourself on any computer/server

If your organization already has somewhere to run a small Node app
internally (a shared server, an internal VM, etc.), you don't need Render at
all:

```bash
npm install    # (no-op here since there are no dependencies, but harmless)
npm start
```

By default it listens on port `3000` — open `http://<that-computer's-address>:3000`
from any device on the same network. Set the `PORT` environment variable to
use a different port.

---

## Limitations to know about

- **No persistence** — state lives in memory only. A server restart clears
  the farm (roster included). Great for single-session team socials; not a
  system of record.
- **Single shared farm per deployment** — everyone who opens the URL lands
  on the same farm. If you want two teams to have separate independent
  farms, deploy two separate instances (two Render services from the same
  repo work fine).
- **Casual-scale, not enterprise-scale** — this is built for a team of
  roughly 2–30 people on a shared social, not a large-scale production
  service.

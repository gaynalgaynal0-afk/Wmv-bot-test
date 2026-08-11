# WMV Converter Bot — Node.js Edition (Termux)

Node.js port of the original Python bot, cleaned up specifically for
running on-device in Termux — no leftover Render-only wiring (keep-alive
pinger, worker/web service split, hardcoded deploy URLs).

## Files

| File | Needed on Termux? | Purpose |
|---|---|---|
| `bot.js` | ✅ yes | The Telegram bot itself (video → WMV converter) |
| `server.js` | optional | Landing page + secret mini-app panel — only run this if you actually want the web UI, and only reachable publicly via a tunnel (see below) |
| `start.sh` | ✅ yes | Installs Node/ffmpeg, runs `bot.js` |
| `.env.example` | reference | Copy to `.env` or `export` the values manually |

`render.yaml` and the Flask/Express keep-alive server from the original
Render deployment have been removed entirely — Termux keeps the process
alive as long as your session/tmux is open, so nothing needs to ping
itself to stay awake.

## Quick start

```bash
pkg install -y git
git clone <your-repo-url>
cd <your-repo-folder>
export BOT_TOKEN=123456:your-bot-token-here
bash start.sh
```

`start.sh` installs `nodejs-lts` and `ffmpeg`, runs `npm install`, and
starts the bot with `node bot.js`. That's the entire on-device footprint —
`server.js` is not started automatically.

## If you want the web landing page / mini app too

```bash
export PORT=5000
node server.js
```

Telegram's `web_app` keyboard button requires a **public HTTPS** URL — a
bare Termux device isn't reachable from the internet on its own. Pair it
with a tunnel if you want that button to work, e.g.:

```bash
pkg install -y cloudflared
cloudflared tunnel --url http://localhost:5000
```

Then set `MINI_APP_URL` in `bot.js`'s environment to the tunnel's URL. If
`MINI_APP_URL` is left empty, the "🔧 time scale patcher" keyboard row is
hidden automatically — the bot works fine without it.

## Environment variables

- `BOT_TOKEN` — **required**, from @BotFather
- `MINI_APP_URL` — optional, only if you're running `server.js` behind a
  tunnel and want the mini-app button
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` — optional, only used on
  `x86_64` devices for the local Bot API server (2GB file support)
- `PORT` / `SECRET_PATH` — only relevant to `server.js`

## A note on the 2GB local server

The official `telegram-bot-api` binary is **amd64-only**. Most phones are
`arm64`/`aarch64`, so `start.sh` skips the local server automatically on
those devices and the bot falls back to standard `api.telegram.org`
limits (~20MB download / ~50MB upload) — fine for short clips.

## Keeping it running in the background

```bash
termux-wake-lock
pkg install -y tmux
tmux new -s bot
bash start.sh
# Ctrl+B then D to detach; `tmux attach -t bot` to come back
```

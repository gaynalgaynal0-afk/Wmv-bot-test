# WMV Converter Bot — Node.js Edition (Termux, MTProto/2GB)

Node.js port of the original Python bot. This edition talks **MTProto**
directly via [GramJS](https://gram.js.org/) instead of the plain HTTP Bot
API — same idea as the original Python bot using Pyrogram. That means
**no 20MB download / 50MB upload cap**, full 2GB support, no local server
binary, and no compiling anything on your phone.

## Files

| File | Needed on Termux? | Purpose |
|---|---|---|
| `bot.js` | ✅ yes | The Telegram bot (video → WMV converter), MTProto edition |
| `server.js` | optional | Landing page + secret mini-app panel |
| `start.sh` | ✅ yes | Installs Node/ffmpeg, runs `bot.js` |
| `.env.example` | reference | Copy values into your shell / a `.env` |

## Getting your API ID / hash

You need these **in addition to** your bot token — they identify the app
making the MTProto connection, not a personal login:

1. Go to https://my.telegram.org and log in with your own phone number
2. Open "API development tools"
3. Create an app (any name/platform is fine) — you'll get `api_id` and `api_hash`

This is a one-time step and doesn't expose your account; the bot still
only acts as your bot, not as you.

## Quick start

```bash
pkg install -y git
git clone <your-repo-url>
cd <your-repo-folder>
export BOT_TOKEN=123456:your-bot-token-here
export TELEGRAM_API_ID=1234567
export TELEGRAM_API_HASH=your_api_hash_here
bash start.sh
```

On first run, GramJS authenticates as your bot over MTProto and writes a
`.session` file next to `bot.js` so future restarts skip the handshake.
**Don't commit `.session` to git** — it's already in `.gitignore`.

## If you want the web landing page / mini app too

```bash
export PORT=5000
node server.js
```

Telegram's `web_app` keyboard button needs a public HTTPS URL. Pair it
with a tunnel if you want it to work:

```bash
pkg install -y cloudflared
cloudflared tunnel --url http://localhost:5000
```

Then set `MINI_APP_URL` to the tunnel URL before starting `bot.js`. Leave
it unset and that keyboard row is hidden automatically.

## Environment variables

- `BOT_TOKEN` — **required**, from @BotFather
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` — **required**, from my.telegram.org
- `MINI_APP_URL` — optional, only if running `server.js` behind a tunnel
- `PORT` / `SECRET_PATH` — only relevant to `server.js`

## Keeping it running in the background

```bash
termux-wake-lock
pkg install -y tmux
tmux new -s bot
bash start.sh
# Ctrl+B then D to detach; `tmux attach -t bot` to come back
```

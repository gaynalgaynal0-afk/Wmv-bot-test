#!/data/data/com.termux/files/usr/bin/bash
# start.sh — Termux launcher for the WMV converter bot (bot.js only).
# Usage: bash start.sh
set -e

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ BOT_TOKEN is not set. Run: export BOT_TOKEN=123456:your-token-here"
  exit 1
fi

echo "==> Installing dependencies (Termux)..."
pkg update -y -q
pkg install -y -q nodejs-lts ffmpeg

echo "==> Installing npm packages..."
npm install --omit=dev

# ── Optional: local telegram-bot-api server for 2GB uploads/downloads ──────
# The official prebuilt binary is amd64-only, so this only runs on x86_64
# devices/emulators. On real Android phones (arm64/aarch64) this step is
# skipped automatically and the bot falls back to the standard Bot API,
# which limits downloads to ~20MB and uploads to ~50MB.
ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ] && [ -n "$TELEGRAM_API_ID" ] && [ -n "$TELEGRAM_API_HASH" ]; then
  pkg install -y -q wget unzip
  if [ ! -f "$PREFIX/bin/telegram-bot-api" ]; then
    echo "==> x86_64 detected — downloading local telegram-bot-api binary..."
    wget -q https://github.com/tdlib/telegram-bot-api/releases/download/v7.11/telegram-bot-api-amd64-linux.zip -O /tmp/tgapi.zip
    unzip -q /tmp/tgapi.zip -d /tmp/tgapi
    mv /tmp/tgapi/telegram-bot-api "$PREFIX/bin/telegram-bot-api"
    chmod +x "$PREFIX/bin/telegram-bot-api"
    rm -rf /tmp/tgapi /tmp/tgapi.zip
  fi

  mkdir -p "$HOME/.telegram-bot-api-data"
  echo "==> Starting local Telegram Bot API server on port 8081..."
  telegram-bot-api \
    --api-id="${TELEGRAM_API_ID}" \
    --api-hash="${TELEGRAM_API_HASH}" \
    --local \
    --http-port=8081 \
    --dir="$HOME/.telegram-bot-api-data" \
    --log="$HOME/.tgapi.log" &

  echo "==> Waiting for local API server to start..."
  for i in $(seq 1 15); do
    if curl -s "http://127.0.0.1:8081/bot${BOT_TOKEN}/getMe" > /dev/null 2>&1; then
      echo "==> Local API server is ready!"
      break
    fi
    sleep 1
  done
  export LOCAL_API_URL="http://127.0.0.1:8081"
else
  echo "==> Using standard api.telegram.org (no local 2GB server on this device)."
fi

echo "==> Starting bot..."
node bot.js

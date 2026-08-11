#!/data/data/com.termux/files/usr/bin/bash
# start.sh — Termux launcher for the WMV converter bot (MTProto edition).
# Usage: bash start.sh
set -e

if [ -z "$BOT_TOKEN" ]; then
  echo "❌ BOT_TOKEN is not set. Run: export BOT_TOKEN=123456:your-token-here"
  exit 1
fi
if [ -z "$TELEGRAM_API_ID" ] || [ -z "$TELEGRAM_API_HASH" ]; then
  echo "❌ TELEGRAM_API_ID and TELEGRAM_API_HASH are required (free from https://my.telegram.org)."
  echo "   export TELEGRAM_API_ID=1234567"
  echo "   export TELEGRAM_API_HASH=your_api_hash"
  exit 1
fi

echo "==> Installing dependencies (Termux)..."
pkg update -y -q
pkg install -y -q nodejs-lts ffmpeg

echo "==> Installing npm packages..."
npm install --omit=dev

echo "==> Starting bot..."
node bot.js

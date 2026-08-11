// bot.js — Node.js port of bot.py (WMV Converter Bot)
// Termux edition: no keep-alive web server, no Render-only wiring.
// Run with: node bot.js
// Requires: ffmpeg installed and on PATH (pkg install ffmpeg on Termux)

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
// URL for the "time scale patcher" web app button. Only meaningful if you're
// actually hosting server.js's mini app somewhere reachable over HTTPS
// (Telegram requires a public HTTPS URL for web_app buttons — a bare Termux
// device isn't reachable on its own, see README for tunnel options).
// Leave unset to hide that keyboard row entirely.
const MINI_APP_URL = process.env.MINI_APP_URL || "";
// If you're running the local telegram-bot-api server (see start.sh), point
// this at it, e.g. "http://127.0.0.1:8081". Leave empty to use api.telegram.org
// (standard Bot API limits apply: ~20MB download / 50MB upload).
const LOCAL_API_URL = process.env.LOCAL_API_URL || "";

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN environment variable is required.");
  process.exit(1);
}

const SUPPORTED_FORMATS = [
  "mp4", "avi", "mov", "mkv", "flv", "webm", "m4v", "3gp",
  "ogv", "ts", "mts", "m2ts", "wmv", "asf", "rm", "rmvb",
  "vob", "mpeg", "mpg",
];

const CAPTION_MSG = ">__*Upload this video using JV 60FPS studio extension*__";

// ── Bot setup ─────────────────────────────────────────────────────────────
const botOptions = { polling: true };
if (LOCAL_API_URL) {
  botOptions.baseApiUrl = LOCAL_API_URL;
  console.log(`Using local Bot API server at ${LOCAL_API_URL}`);
}
const bot = new TelegramBot(BOT_TOKEN, botOptions);

const menuKeyboard = [
  [{ text: "🚀 Start the bot" }],
  [{ text: "🎬 Convert video" }],
];
if (MINI_APP_URL) {
  menuKeyboard.push([
    { text: "🔧 time scale patcher", web_app: { url: MINI_APP_URL } },
  ]);
}
const MAIN_MENU = {
  reply_markup: { keyboard: menuKeyboard, resize_keyboard: true },
};

bot.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "convert", description: "Convert a video to studio60fps" },
]).catch((e) => console.error("setMyCommands failed:", e.message));

// ── ffmpeg conversion helper ─────────────────────────────────────────────
function convertToWmv(inputPath, outputPath) {
  return new Promise((resolve) => {
    const args = [
      "-i", inputPath,
      "-c:v", "wmv2", "-q:v", "1", "-b:v", "0",
      "-c:a", "wmav2", "-b:a", "320k", "-ar", "48000", "-ac", "2",
      "-f", "asf", "-y", outputPath,
    ];
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve([false, "Conversion timed out after 1 hour"]);
    }, 3600 * 1000);

    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 5000) stderr = stderr.slice(-5000); // cap memory
    });
    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve([false, err.message]);
    });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve([true, "OK"]);
      else resolve([false, stderr.slice(-300)]);
    });
  });
}

// ── Handlers ──────────────────────────────────────────────────────────────
bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🎬 *TIKTOK Studio method*\n\n" +
      ">Send a video file to convert it to studio60fps\n" +
      ">Tap *🎬 Convert video* or just send your file directly!\n\n" +
      "*📦 Max size: 2GB*",
    { parse_mode: "Markdown", ...MAIN_MENU }
  );
});

bot.onText(/^(\/convert|🎬 Convert video)$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "📤 Send me your video file now!\nSupported: " + SUPPORTED_FORMATS.join(", "),
    MAIN_MENU
  );
});

bot.onText(/^🚀 Start the bot$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "✅ Bot is running!\n\nSend me any video file to convert it to studio60fps.",
    MAIN_MENU
  );
});

bot.on("message", async (msg) => {
  const video = msg.video;
  const document = msg.document;
  if (!video && !document) return;

  let fileId = null;
  let originalName = "video";
  let fileSize = 0;

  if (video) {
    fileId = video.file_id;
    fileSize = video.file_size || 0;
    originalName = `video_${video.file_unique_id}.mp4`;
  } else if (document) {
    const fname = document.file_name || "";
    const ext = path.extname(fname).toLowerCase().replace(".", "");
    const mime = document.mime_type || "";
    if (mime.startsWith("video/") || SUPPORTED_FORMATS.includes(ext)) {
      fileId = document.file_id;
      fileSize = document.file_size || 0;
      originalName = fname || "video";
    }
  }

  if (!fileId) {
    await bot.sendMessage(
      msg.chat.id,
      "Please send a video file.\nSupported: " + SUPPORTED_FORMATS.join(", ")
    );
    return;
  }

  const sizeMb = fileSize / 1024 / 1024;
  if (sizeMb > 2000) {
    await bot.sendMessage(msg.chat.id, `❌ Too large (${sizeMb.toFixed(1)}MB). Max 2GB.`);
    return;
  }

  const status = await bot.sendMessage(msg.chat.id, "⬇️ Downloading...");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wmv_"));

  try {
    const ext = path.extname(originalName).replace(".", "") || "mp4";
    const inputPath = path.join(tmpDir, `input.${ext}`);
    const outputName = path.basename(originalName, path.extname(originalName)) + ".wmv";
    const outputPath = path.join(tmpDir, outputName);

    await bot.downloadFile(fileId, tmpDir).then((downloadedPath) => {
      fs.renameSync(downloadedPath, inputPath);
    });

    await bot.editMessageText("🔄 Converting to studio60fps (near-lossless)...", {
      chat_id: msg.chat.id,
      message_id: status.message_id,
    });

    const [ok, err] = await convertToWmv(inputPath, outputPath);
    if (!ok) {
      await bot.editMessageText(`❌ Conversion failed:\n${err.slice(0, 200)}`, {
        chat_id: msg.chat.id,
        message_id: status.message_id,
      });
      return;
    }

    const outMb = fs.statSync(outputPath).size / 1024 / 1024;
    await bot.editMessageText(`⬆️ Uploading (${outMb.toFixed(1)}MB)...`, {
      chat_id: msg.chat.id,
      message_id: status.message_id,
    });

    await bot.sendDocument(
      msg.chat.id,
      outputPath,
      { caption: CAPTION_MSG, parse_mode: "Markdown" },
      { filename: outputName }
    );
    await bot.deleteMessage(msg.chat.id, status.message_id);
  } catch (e) {
    await bot.editMessageText(`❌ Error: ${e.message}`, {
      chat_id: msg.chat.id,
      message_id: status.message_id,
    }).catch(() => {});
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

bot.on("polling_error", (err) => console.error("Polling error:", err.message));

console.log("Bot starting with Node.js edition!");

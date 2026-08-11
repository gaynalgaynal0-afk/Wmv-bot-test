// bot.js — MTProto edition (GramJS) using a bot token.
//
// Why: the plain HTTP Bot API caps file downloads at 20MB and uploads at
// ~50MB. GramJS talks MTProto directly (the same protocol Telegram Desktop
// uses), so a bot logged in this way can send/receive files up to 2GB with
// NO local server, NO compiling, and NO personal phone login — just your
// bot token plus an api_id/api_hash pair from my.telegram.org.
//
// Run with: node bot.js
// Requires: ffmpeg installed and on PATH (pkg install ffmpeg on Termux)

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH;
// Only meaningful if you're also running server.js behind a public HTTPS
// tunnel. Leave unset to hide that keyboard row entirely.
const MINI_APP_URL = process.env.MINI_APP_URL || "";
const SESSION_FILE = path.join(__dirname, ".session");

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN environment variable is required.");
  process.exit(1);
}
if (!API_ID || !API_HASH) {
  console.error(
    "❌ TELEGRAM_API_ID and TELEGRAM_API_HASH are required for the MTProto edition.\n" +
      "   Get them free from https://my.telegram.org (API Development Tools)."
  );
  process.exit(1);
}

const SUPPORTED_FORMATS = [
  "mp4", "avi", "mov", "mkv", "flv", "webm", "m4v", "3gp",
  "ogv", "ts", "mts", "m2ts", "wmv", "asf", "rm", "rmvb",
  "vob", "mpeg", "mpg",
];

const CAPTION_MSG = "Upload this video using JV 60FPS studio extension";

// ── Session persistence (skip re-auth handshake on every restart) ─────────
let savedSession = "";
if (fs.existsSync(SESSION_FILE)) {
  savedSession = fs.readFileSync(SESSION_FILE, "utf8").trim();
}
const stringSession = new StringSession(savedSession);

// ── ffmpeg conversion helper (unchanged) ───────────────────────────────────
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
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
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

// ── Pull video-like document info straight off the raw MTProto message ────
function extractVideoDoc(message) {
  const media = message.media;
  if (!media || media.className !== "MessageMediaDocument" || !media.document) {
    return null;
  }
  const doc = media.document;
  if (doc.className !== "Document") return null;

  let filename = "";
  let isVideo = false;
  for (const attr of doc.attributes || []) {
    if (attr.className === "DocumentAttributeFilename") filename = attr.fileName;
    if (attr.className === "DocumentAttributeVideo") isVideo = true;
  }
  const mimeType = doc.mimeType || "";
  const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";

  if (isVideo || mimeType.startsWith("video/") || SUPPORTED_FORMATS.includes(ext)) {
    return {
      doc,
      filename: filename || `video_${doc.id}.mp4`,
      sizeBytes: Number(doc.size),
    };
  }
  return null;
}

function buildMenu(withMiniApp) {
  const rows = [
    new Api.KeyboardButtonRow({ buttons: [new Api.KeyboardButton({ text: "🚀 Start the bot" })] }),
    new Api.KeyboardButtonRow({ buttons: [new Api.KeyboardButton({ text: "🎬 Convert video" })] }),
  ];
  if (withMiniApp) {
    rows.push(
      new Api.KeyboardButtonRow({
        buttons: [new Api.KeyboardButtonSimpleWebView({ text: "🔧 time scale patcher", url: MINI_APP_URL })],
      })
    );
  }
  return new Api.ReplyKeyboardMarkup({
    rows,
    resize: true,
    singleUse: false,
  });
}

async function main() {
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({ botAuthToken: BOT_TOKEN });
  fs.writeFileSync(SESSION_FILE, client.session.save());
  console.log("✅ Bot starting (MTProto/GramJS edition, 2GB support)!");

  const MAIN_MENU = buildMenu(Boolean(MINI_APP_URL));

  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message) return;
    const chatId = message.chatId;
    const text = (message.message || "").trim();

    // ── Commands / menu buttons ───────────────────────────────────────
    if (text === "/start") {
      await client.sendMessage(chatId, {
        message:
          "🎬 **TIKTOK Studio method**\n\n" +
          ">Send a video file to convert it to studio60fps\n" +
          ">Tap **🎬 Convert video** or just send your file directly!\n\n" +
          "*📦 Max size: 2GB*",
        parseMode: "md",
        buttons: MAIN_MENU,
      });
      return;
    }
    if (text === "/convert" || text === "🎬 Convert video") {
      await client.sendMessage(chatId, {
        message: "📤 Send me your video file now!\nSupported: " + SUPPORTED_FORMATS.join(", "),
        buttons: MAIN_MENU,
      });
      return;
    }
    if (text === "🚀 Start the bot") {
      await client.sendMessage(chatId, {
        message: "✅ Bot is running!\n\nSend me any video file to convert it to studio60fps.",
        buttons: MAIN_MENU,
      });
      return;
    }

    // ── Video / document handling ─────────────────────────────────────
    const videoInfo = extractVideoDoc(message);
    if (!message.media) return; // ignore plain text that isn't a command
    if (!videoInfo) {
      await client.sendMessage(chatId, {
        message: "Please send a video file.\nSupported: " + SUPPORTED_FORMATS.join(", "),
      });
      return;
    }

    const sizeMb = videoInfo.sizeBytes / 1024 / 1024;
    if (sizeMb > 2000) {
      await client.sendMessage(chatId, { message: `❌ Too large (${sizeMb.toFixed(1)}MB). Max 2GB.` });
      return;
    }

    const status = await client.sendMessage(chatId, { message: "⬇️ Downloading..." });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wmv_"));

    try {
      const ext = path.extname(videoInfo.filename).replace(".", "") || "mp4";
      const inputPath = path.join(tmpDir, `input.${ext}`);
      const outputName = path.basename(videoInfo.filename, path.extname(videoInfo.filename)) + ".wmv";
      const outputPath = path.join(tmpDir, outputName);

      await client.downloadMedia(message, { outputFile: inputPath });

      await client.editMessage(chatId, {
        message: status.id,
        text: "🔄 Converting to studio60fps (near-lossless)...",
      });

      const [ok, err] = await convertToWmv(inputPath, outputPath);
      if (!ok) {
        await client.editMessage(chatId, {
          message: status.id,
          text: `❌ Conversion failed:\n${err.slice(0, 200)}`,
        });
        return;
      }

      const outMb = fs.statSync(outputPath).size / 1024 / 1024;
      await client.editMessage(chatId, {
        message: status.id,
        text: `⬆️ Uploading (${outMb.toFixed(1)}MB)...`,
      });

      await client.sendFile(chatId, {
        file: outputPath,
        caption: CAPTION_MSG,
        forceDocument: true,
      });
      await client.deleteMessages(chatId, [status.id], { revoke: true });
    } catch (e) {
      await client
        .editMessage(chatId, { message: status.id, text: `❌ Error: ${e.message}` })
        .catch(() => {});
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, new NewMessage({}));
}

main().catch((e) => {
  console.error("Fatal error starting bot:", e);
  process.exit(1);
});

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

function loadEnv() {
  const content = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const botToken = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
const eveUrl = "http://127.0.0.1:2000/eve/v1/telegram";

if (!botToken) {
  console.error("[telegram-poller] TELEGRAM_BOT_TOKEN is missing in .env.local");
  process.exit(1);
}

console.log("[telegram-poller] Starting Telegram bridge for bot...");

// Ensure Telegram webhook is cleared so getUpdates works
try {
  const delRes = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
  const delData = await delRes.json();
  console.log("[telegram-poller] Cleared any existing webhook:", delData.ok);
} catch (err) {
  console.warn("[telegram-poller] Failed to delete webhook:", err.message);
}

let offset = 0;

while (true) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=25`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[telegram-poller] Telegram getUpdates failed (${res.status}): ${await res.text()}`);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    const data = await res.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message?.text ?? update.message?.caption ?? "[media/action]";
        const sender = update.message?.from?.username ?? update.message?.from?.id ?? "unknown";
        console.log(`[telegram-poller] Forwarding message from @${sender}: ${msg}`);

        try {
          const eveRes = await fetch(eveUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-telegram-bot-api-secret-token": secret,
            },
            body: JSON.stringify(update),
          });
          const eveText = await eveRes.text();
          console.log(`[telegram-poller] Eve webhook responded: ${eveRes.status} ${eveText}`);
        } catch (postErr) {
          console.error("[telegram-poller] Failed to forward update to Eve:", postErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[telegram-poller] Poll error:", err.message);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

import { pathToFileURL } from "node:url";

export function createTelegramBot(botToken, miniAppUrl) {
  if (!botToken) {
    throw new Error("BOT_TOKEN environment variable is required.");
  }
  if (!miniAppUrl || new URL(miniAppUrl).protocol !== "https:") {
    throw new Error("MINI_APP_URL must be an HTTPS URL.");
  }

  async function telegramApi(method, payload) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35_000)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(`Telegram Bot API ${method} failed: ${result.description ?? response.statusText}`);
    }
    return result.result;
  }

  async function start() {
    const me = await telegramApi("getMe", {});
    console.log(`Bot polling started: @${me.username}`);
    let offset = 0;

    while (true) {
      try {
        const updates = await telegramApi("getUpdates", {
          offset,
          timeout: 25,
          allowed_updates: ["message"]
        });
        for (const update of updates) {
          offset = update.update_id + 1;
          const message = update.message;
          if (message?.chat?.type !== "private" || !message.text || !/^\/start(?:@\w+)?(?:\s|$)/.test(message.text)) {
            continue;
          }

          await telegramApi("sendMessage", {
            chat_id: message.chat.id,
            text: "Mini App’ni ochish uchun tugmani bosing.",
            reply_markup: {
              inline_keyboard: [[{
                text: "Mini App’ni ochish",
                web_app: { url: miniAppUrl }
              }]]
            }
          });
        }
      } catch (error) {
        console.error("Bot polling error:", error.message);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  return { telegramApi, start };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bot = createTelegramBot(process.env.BOT_TOKEN, process.env.MINI_APP_URL);
  bot.start().catch(error => {
    console.error("Bot startup failed:", error.message);
    process.exitCode = 1;
  });
}

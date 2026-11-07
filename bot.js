import { pathToFileURL } from "node:url";

const defaultBusinessAutoReplyText = "Salom! Xabaringiz uchun rahmat. Tez orada siz bilan bog‘lanamiz.";

export async function handleBusinessMessage(message, telegramApi, autoReplyText) {
  const businessConnectionId = message?.business_connection_id;
  if (!businessConnectionId || !message.chat?.id) return;

  const connection = await telegramApi("getBusinessConnection", {
    business_connection_id: businessConnectionId
  });
  if (
    connection.is_enabled !== true ||
    connection.can_reply !== true ||
    connection.user?.id === message.from?.id ||
    message.sender_business_bot
  ) {
    return;
  }

  const payload = {
    business_connection_id: businessConnectionId,
    chat_id: message.chat.id,
    text: autoReplyText
  };
  if (Number.isInteger(message.message_id)) {
    payload.reply_parameters = { message_id: message.message_id };
  }
  await telegramApi("sendMessage", payload);
}

export function createTelegramBot(
  botToken,
  miniAppUrl,
  autoReplyText = process.env.BUSINESS_AUTO_REPLY_TEXT ?? defaultBusinessAutoReplyText
) {
  if (!botToken) {
    throw new Error("BOT_TOKEN environment variable is required.");
  }
  if (!miniAppUrl || new URL(miniAppUrl).protocol !== "https:") {
    throw new Error("MINI_APP_URL must be an HTTPS URL.");
  }
  if (!autoReplyText.trim()) {
    throw new Error("BUSINESS_AUTO_REPLY_TEXT must not be empty.");
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
          allowed_updates: ["message", "business_connection", "business_message"]
        });
        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.business_connection) {
            console.log(`Business connection ${update.business_connection.is_enabled ? "enabled" : "disabled"}.`);
          }
          if (update.business_message) {
            try {
              await handleBusinessMessage(update.business_message, telegramApi, autoReplyText);
            } catch (error) {
              console.error("Business auto-reply error:", error.message);
            }
            continue;
          }

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

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { verifyInitData } from "./telegram-auth.js";
import { createTelegramBot } from "./bot.js";

const botToken = process.env.BOT_TOKEN;
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const sendCooldownMs = 60_000;
const lastSendAt = new Map();
const publicDir = fileURLToPath(new URL("./public/", import.meta.url));
const bot = createTelegramBot(botToken, process.env.MINI_APP_URL);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

async function readJsonBody(request, limit = 8192) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) {
      throw new Error("Request body is too large.");
    }
  }
  return JSON.parse(body);
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function readAuthenticatedUser(request, response) {
  const body = await readJsonBody(request);
  try {
    return verifyInitData(body.initData, botToken);
  } catch {
    sendJson(response, 401, { ok: false, error: "Telegram tasdiqlashi yaroqsiz yoki muddati o‘tgan." });
    return null;
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/") {
    const html = await readFile(path.join(publicDir, "index.html"));
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'self'; script-src 'self' https://telegram.org; connect-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'none'",
      "x-content-type-options": "nosniff"
    });
    response.end(html);
    return;
  }

  if (request.method === "GET" && url.pathname === "/app.js") {
    const script = await readFile(path.join(publicDir, "app.js"));
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    response.end(script);
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth") {
    const user = await readAuthenticatedUser(request, response);
    if (!user) return;
    sendJson(response, 200, { ok: true, user });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/send-test") {
    const user = await readAuthenticatedUser(request, response);
    if (!user) return;
    const lastSend = lastSendAt.get(user.id) ?? 0;
    if (Date.now() - lastSend < sendCooldownMs) {
      sendJson(response, 429, { ok: false, error: "Yana yuborishdan oldin bir daqiqa kuting." });
      return;
    }

    await bot.telegramApi("sendMessage", {
      chat_id: user.id,
      text: "Salom! Bu Mini App ichidan so‘ralgan sinov xabari."
    });
    lastSendAt.set(user.id, Date.now());
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found." });
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    console.error("Request error:", error.message);
    if (!response.headersSent) {
      sendJson(response, 400, {
        ok: false,
        error: "So‘rovni tekshirib qayta urinib ko‘ring."
      });
    } else {
      response.destroy();
    }
  });
});

server.listen(port, host, () => {
  console.log(`Mini App backend listening on http://${host}:${port}`);
});

bot.start().catch(error => {
  console.error("Bot startup failed:", error.message);
  process.exitCode = 1;
  server.close();
});

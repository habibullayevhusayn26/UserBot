import { createHmac, timingSafeEqual } from "node:crypto";

const maxAuthAgeSeconds = 24 * 60 * 60;

export function verifyInitData(initData, botToken, now = Math.floor(Date.now() / 1000)) {
  if (typeof initData !== "string" || initData.length === 0 || initData.length > 8192) {
    throw new Error("Invalid Telegram initData.");
  }

  const params = new URLSearchParams(initData);
  const values = new Map();
  for (const [key, value] of params) {
    if (values.has(key)) {
      throw new Error("Duplicate initData field.");
    }
    values.set(key, value);
  }

  const receivedHash = values.get("hash");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error("Missing or invalid initData hash.");
  }

  values.delete("hash");
  const dataCheckString = [...values.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const actualHash = Buffer.from(receivedHash, "hex");
  if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
    throw new Error("Telegram initData signature verification failed.");
  }

  const authDate = Number(values.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate > now + 30 || now - authDate > maxAuthAgeSeconds) {
    throw new Error("Telegram initData has expired.");
  }

  let user;
  try {
    user = JSON.parse(values.get("user") ?? "");
  } catch {
    throw new Error("Invalid Telegram user data.");
  }
  if (!Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error("Invalid Telegram user ID.");
  }

  return {
    id: user.id,
    first_name: typeof user.first_name === "string" ? user.first_name : "",
    username: typeof user.username === "string" ? user.username : null
  };
}

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyInitData } from "./telegram-auth.js";

const token = "123456:example-token";
const now = 1_800_000_000;

function makeInitData({ authDate = now, user = { id: 123, first_name: "Ali", username: "ali" } } = {}) {
  const entries = [
    ["auth_date", String(authDate)],
    ["query_id", "AAEAAExample"],
    ["user", JSON.stringify(user)]
  ];
  const dataCheckString = entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return `${new URLSearchParams(entries)}&hash=${hash}`;
}

test("accepts valid signed initData and returns minimal user details", () => {
  assert.deepEqual(verifyInitData(makeInitData(), token, now), {
    id: 123,
    first_name: "Ali",
    username: "ali"
  });
});

test("rejects a modified signature", () => {
  const initData = makeInitData().replace("AAEAAExample", "AAEABExample");
  assert.throws(() => verifyInitData(initData, token, now), /signature verification failed/);
});

test("rejects expired authentication data", () => {
  assert.throws(
    () => verifyInitData(makeInitData({ authDate: now - 24 * 60 * 60 - 1 }), token, now),
    /expired/
  );
});

test("rejects duplicate fields", () => {
  const initData = makeInitData();
  assert.throws(() => verifyInitData(`${initData}&auth_date=${now}`, token, now), /Duplicate/);
});

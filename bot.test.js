import assert from "node:assert/strict";
import test from "node:test";
import { handleBusinessMessage } from "./bot.js";

test("replies to a customer through the enabled business connection", async () => {
  const calls = [];
  const telegramApi = async (method, payload) => {
    calls.push({ method, payload });
    if (method === "getBusinessConnection") {
      return { is_enabled: true, can_reply: true, user: { id: 100 } };
    }
  };

  await handleBusinessMessage({
    business_connection_id: "connection-1",
    chat: { id: 200 },
    from: { id: 200 },
    message_id: 7
  }, telegramApi, "Salom!");

  assert.deepEqual(calls, [
    { method: "getBusinessConnection", payload: { business_connection_id: "connection-1" } },
    {
      method: "sendMessage",
      payload: {
        business_connection_id: "connection-1",
        chat_id: 200,
        text: "Salom!",
        reply_parameters: { message_id: 7 }
      }
    }
  ]);
});

test("does not reply when the business connection is disabled or cannot reply", async () => {
  for (const connection of [
    { is_enabled: false, can_reply: true },
    { is_enabled: true, can_reply: false }
  ]) {
    const methods = [];
    await handleBusinessMessage({
      business_connection_id: "connection-1",
      chat: { id: 200 },
      from: { id: 200 }
    }, async method => {
      methods.push(method);
      return connection;
    }, "Salom!");

    assert.deepEqual(methods, ["getBusinessConnection"]);
  }
});

test("does not auto-reply to messages sent by the business account or its bot", async () => {
  for (const message of [
    { from: { id: 100 } },
    { from: { id: 200 }, sender_business_bot: { id: 300 } }
  ]) {
    const methods = [];
    await handleBusinessMessage({
      business_connection_id: "connection-1",
      chat: { id: 200 },
      ...message
    }, async method => {
      methods.push(method);
      return { is_enabled: true, can_reply: true, user: { id: 100 } };
    }, "Salom!");

    assert.deepEqual(methods, ["getBusinessConnection"]);
  }
});

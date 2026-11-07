const webApp = window.Telegram?.WebApp;
const statusElement = document.querySelector("#status");
const profileElement = document.querySelector("#profile");
const sendButton = document.querySelector("#send-test");

webApp?.ready();
webApp?.expand();

if (!webApp?.initData) {
  statusElement.textContent = "Mini App’ni Telegram ichidan oching.";
} else {
  fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: webApp.initData })
  })
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result.user;
    })
    .then(user => {
      document.querySelector("#name").textContent = user.first_name || "foydalanuvchi";
      document.querySelector("#username").textContent = user.username ? `@${user.username}` : "";
      profileElement.hidden = false;
      statusElement.textContent = "Telegram akkauntingiz tasdiqlandi.";
    })
    .catch(() => {
      statusElement.textContent = "Tasdiqlash amalga oshmadi. App’ni Telegram’dan qayta oching.";
    });
}

sendButton.addEventListener("click", async () => {
  sendButton.disabled = true;
  statusElement.textContent = "Xabar yuborilmoqda…";
  try {
    const response = await fetch("/api/send-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    statusElement.textContent = "Sinov xabari bot nomidan sizga yuborildi.";
  } catch (error) {
    statusElement.textContent = error.message || "Xabar yuborilmadi.";
  } finally {
    sendButton.disabled = false;
  }
});

const SESSION = chrome.storage.session;
const SKEY_UNLOCKED = "unlocked";
const SKEY_AESKEY   = "aesKeyB64";

async function relock() {
  await SESSION.set({ [SKEY_UNLOCKED]: false });
  await SESSION.remove(SKEY_AESKEY);
}

chrome.runtime.onInstalled.addListener(relock);
chrome.runtime.onStartup?.addListener(relock);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "SET_UNLOCKED":
        await SESSION.set({ [SKEY_UNLOCKED]: !!msg.value });
        if (!msg.value) await SESSION.remove(SKEY_AESKEY);
        return sendResponse({ ok: true });

      case "SET_SESSION_KEY":
        if (msg.keyB64) await SESSION.set({ [SKEY_AESKEY]: msg.keyB64 });
        else await SESSION.remove(SKEY_AESKEY);
        return sendResponse({ ok: true });

      case "GET_UNLOCKED":
        const s = await SESSION.get(SKEY_UNLOCKED);
        return sendResponse({ unlocked: !!s[SKEY_UNLOCKED] });

      case "GET_SESSION_KEY":
        const k = await SESSION.get(SKEY_AESKEY);
        return sendResponse({ keyB64: k[SKEY_AESKEY] || null });

      case "OPEN_AND_RELOCK":
        try {
          await chrome.tabs.create({ url: msg.url, active: true });
        } finally {
          await relock();
        }
        return sendResponse({ ok: true });

      case "POPUP_CLOSED":
        await relock();
        return sendResponse({ ok: true });
    }
  })();
  return true;
});

// ★追加：ポップアップと接続し、切断（=ポップアップ閉鎖）で確実にロック
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    port.onDisconnect.addListener(() => {
      // ポップアップが閉じられた
      relock();
    });
  }
});

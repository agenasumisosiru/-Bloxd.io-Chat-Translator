// background.js - Bloxd Translator (service worker)
// v1.4.0: translation cache, throttling, backoff, debug logs, startup update notifications

let DEBUG = false;
const TRANSLATION_CACHE_TTL = 1000 * 60 * 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 1000 * 60;
const REPO = "agenasumisosiru/-Bloxd.io-Chat-Translator";
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const UPDATE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const UPDATE_NOTIFICATION_ID = "bloxd-translator-update";

let lastRequestAt = 0;
let backoffUntil = 0;
let backoffMultiplier = 1;

async function initBadgeAndDebug() {
  try {
    const res = await chrome.storage.local.get(["enabled", "debugMode"]);
    const enabled = typeof res.enabled !== "undefined" ? res.enabled : true;
    DEBUG = !!res.debugMode;
    updateBadge(enabled);
  } catch (e) {
    console.error("initBadgeAndDebug error:", e);
    updateBadge(true);
  }
}

function updateBadge(state) {
  try {
    chrome.action.setBadgeText({ text: state ? "ON" : "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: state ? "#00C853" : "#D50000" });
    chrome.action.setTitle({ title: state ? "Bloxd Translator: ON" : "Bloxd Translator: OFF" });
  } catch (e) {
    console.error("updateBadge error:", e);
  }
}

function parseVersion(version) {
  const match = String(version || "").replace(/^v/i, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? match.slice(1).map(part => Number(part || 0)) : [0, 0, 0, 0];
}

function isNewerVersion(remote, local) {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  for (let i = 0; i < 4; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function checkForUpdates({ notify = true } = {}) {
  try {
    const localVersion = chrome.runtime.getManifest().version;
    const response = await fetch(UPDATE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

    const release = await response.json();
    const remoteVersion = String(release.tag_name || "").replace(/^v/i, "");
    if (!remoteVersion) throw new Error("Release has no tag_name");

    const updateAvailable = isNewerVersion(remoteVersion, localVersion);
    await chrome.storage.local.set({
      updateAvailable,
      currentVersion: localVersion,
      latestVersion: remoteVersion,
      latestReleaseUrl: release.html_url || RELEASES_URL,
      latestReleaseCheckedAt: Date.now()
    });

    if (!notify || !updateAvailable) return { ok: true, updateAvailable: false };

    const stored = await chrome.storage.local.get(["lastNotifiedVersion"]);
    if (stored.lastNotifiedVersion === remoteVersion) return { ok: true, updateAvailable: true };

    await chrome.notifications.create(UPDATE_NOTIFICATION_ID, {
      type: "basic",
      iconUrl: "png1.png",
      title: "Bloxd Translator の更新があります",
      message: `v${remoteVersion} が利用できます。クリックして更新方法を確認してください。`,
      priority: 2,
      requireInteraction: true
    });
    await chrome.storage.local.set({ lastNotifiedVersion: remoteVersion });
    return { ok: true, updateAvailable: true };
  } catch (error) {
    await appendDebugLog(`[update] check failed: ${error && error.message}`);
    return { ok: false, error: error && error.message };
  }
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== UPDATE_NOTIFICATION_ID) return;
  const stored = await chrome.storage.local.get(["latestReleaseUrl"]);
  chrome.tabs.create({ url: stored.latestReleaseUrl || RELEASES_URL });
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onClosed.addListener((notificationId) => {
  if (notificationId === UPDATE_NOTIFICATION_ID) chrome.notifications.clear(notificationId);
});

chrome.runtime.onInstalled.addListener(async () => {
  await initBadgeAndDebug();
  await checkForUpdates({ notify: false });
});

// Browser startup: check once whenever the browser starts.
chrome.runtime.onStartup.addListener(async () => {
  await initBadgeAndDebug();
  await checkForUpdates({ notify: true });
});

initBadgeAndDebug();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled) updateBadge(changes.enabled.newValue);
  if (changes.debugMode) DEBUG = !!changes.debugMode.newValue;
});

async function appendDebugLog(entry) {
  try {
    if (!DEBUG) return;
    const res = await chrome.storage.local.get(["debugLogs"]);
    const logs = Array.isArray(res.debugLogs) ? res.debugLogs : [];
    logs.push(`${new Date().toISOString()} ${entry}`);
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
    await chrome.storage.local.set({ debugLogs: logs });
  } catch (e) {
    console.error("appendDebugLog error:", e);
  }
}

async function getCache() {
  const res = await chrome.storage.local.get(["translationCache"]);
  return res.translationCache || {};
}

async function setCache(cache) {
  await chrome.storage.local.set({ translationCache: cache });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "checkForUpdates") {
    checkForUpdates({ notify: false }).then(sendResponse);
    return true;
  }

  if (msg.type === "appendDebugLog") {
    appendDebugLog(msg.text).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type !== "translate") return;

  (async () => {
    try {
      const now = Date.now();
      if (now < backoffUntil) {
        sendResponse({ ok: false, text: null, error: "backoff" });
        return;
      }

      const settings = await chrome.storage.local.get(["throttleMs", "targetLang"]);
      const minInterval = settings.throttleMs || 80;
      const since = now - lastRequestAt;
      if (since < minInterval) await new Promise(resolve => setTimeout(resolve, minInterval - since));
      lastRequestAt = Date.now();

      const cache = await getCache();
      const targetLang = settings.targetLang || "ja";
      const key = `${msg.text}||${targetLang}`;
      const entry = cache[key];
      if (entry && Date.now() - entry.ts < TRANSLATION_CACHE_TTL) {
        sendResponse({ ok: true, text: entry.text, cached: true });
        return;
      }

      const q = encodeURIComponent(msg.text || "");
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&dt=bd&dj=1&q=${q}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const contentType = response.headers.get("content-type") || "";

      if (!response.ok || contentType.includes("text/html")) {
        if (response.status === 429) {
          backoffMultiplier = Math.min(backoffMultiplier * 2, BACKOFF_MAX_MS / BACKOFF_BASE_MS);
          backoffUntil = Date.now() + BACKOFF_BASE_MS * backoffMultiplier;
        }
        sendResponse({ ok: false, text: null, status: response.status, contentType });
        return;
      }

      const data = await response.json();
      const translated = data && data.sentences ? data.sentences.map(sentence => sentence.trans || "").join("") : null;
      if (!translated) {
        sendResponse({ ok: false, text: null });
        return;
      }

      cache[key] = { text: translated, ts: Date.now() };
      await setCache(cache);
      backoffMultiplier = 1;
      backoffUntil = 0;
      await appendDebugLog(`[background] translated: ${translated}`);
      sendResponse({ ok: true, text: translated });
    } catch (error) {
      await appendDebugLog(`[background] translate error: ${error && error.message}`);
      sendResponse({ ok: false, text: null, error: error && error.message });
    }
  })();

  return true;
});

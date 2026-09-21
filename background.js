// background.js - Bloxd Translator (service worker)
// Updated: translation cache, throttle, exponential backoff, debug log append

let DEBUG = false;

// persistent-ish state (service worker may restart)
const TRANSLATION_CACHE_TTL = 1000 * 60 * 10; // 10 minutes
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 1000 * 60;

let lastRequestAt = 0;
let backoffUntil = 0;
let backoffMultiplier = 1;

async function initBadgeAndDebug() {
  try {
    const res = await chrome.storage.local.get(["enabled", "debugMode"]);
    const enabled = (res && typeof res.enabled !== "undefined") ? res.enabled : true;
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

chrome.runtime.onInstalled.addListener(initBadgeAndDebug);
chrome.runtime.onStartup.addListener(initBadgeAndDebug);
initBadgeAndDebug();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.enabled) updateBadge(changes.enabled.newValue);
    if (changes.debugMode) DEBUG = !!changes.debugMode.newValue;
  }
});

// debug log append (keeps last N entries)
async function appendDebugLog(entry) {
  try {
    if (!DEBUG) return;
    const res = await chrome.storage.local.get(["debugLogs"]);
    const logs = Array.isArray(res.debugLogs) ? res.debugLogs : [];
    const ts = new Date().toISOString();
    logs.push(`${ts} ${entry}`);
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

  if (msg.type === "appendDebugLog") {
    appendDebugLog(msg.text).then(() => sendResponse && sendResponse({ ok: true })).catch(() => sendResponse && sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "translate") {
    (async () => {
      try {
        const now = Date.now();
        if (now < backoffUntil) {
          sendResponse({ ok: false, text: null, error: "backoff" });
          return;
        }

        const MIN_INTERVAL = (await chrome.storage.local.get(["throttleMs"])).throttleMs || 80;
        const since = now - lastRequestAt;
        if (since < MIN_INTERVAL) {
          await new Promise(r => setTimeout(r, MIN_INTERVAL - since));
        }
        lastRequestAt = Date.now();

        const cache = await getCache();
        const targetLangRes = await chrome.storage.local.get(["targetLang"]);
        const tl = targetLangRes.targetLang || "ja";
        const key = `${msg.text}||${tl}`;
        const entry = cache[key];
        if (entry && (Date.now() - entry.ts) < TRANSLATION_CACHE_TTL) {
          sendResponse({ ok: true, text: entry.text, cached: true });
          return;
        }

        const sl = "auto";
        const q = encodeURIComponent(msg.text || "");
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=bd&dj=1&q=${q}`;

        const controller = new AbortController();
        const TIMEOUT_MS = 8000;
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const r = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        const contentType = r.headers.get("content-type") || "";
        if (!r.ok || contentType.includes("text/html")) {
          if (r.status === 429) {
            backoffMultiplier = Math.min((backoffMultiplier || 1) * 2, Math.floor(BACKOFF_MAX_MS / BACKOFF_BASE_MS));
            backoffUntil = Date.now() + BACKOFF_BASE_MS * backoffMultiplier;
            await appendDebugLog(`[background] 429 received, backoffUntil=${new Date(backoffUntil).toISOString()}`);
          } else {
            await appendDebugLog(`[background] translate fetch error: ${r.status} ${contentType}`);
          }
          sendResponse({ ok: false, text: null, status: r.status, contentType });
          return;
        }

        const data = await r.json();
        const translated = (data && data.sentences) ? data.sentences.map(s => s.trans || "").join("") : null;
        if (translated) {
          cache[key] = { text: translated, ts: Date.now() };
          await setCache(cache);
          backoffMultiplier = 1;
          backoffUntil = 0;
          await appendDebugLog(`[background] translated: ${translated}`);
          sendResponse({ ok: true, text: translated });
        } else {
          sendResponse({ ok: false, text: null });
        }
      } catch (e) {
        await appendDebugLog(`[background] translate error: ${e && e.message}`);
        sendResponse({ ok: false, text: null, error: e && e.message });
      }
    })();
    return true;
  }
});

// content.js - Bloxd Translator (stable, debug-aware)
// Updated: pause flag, throttling, duplicate suppression, idle init, left-click fixed (no reload)

const FLOAT_ID = "bloxd-translator-floating-ui";
const TRANSLATED_ATTR = "data-bloxd-translated";
const DEBOUNCE_MS = 150;

let translateEnabled = true;
let uiCreating = false;
let uiInitialized = false;
let ensureDebounce = null;
let btnProcessing = false;
let DEBUG = false;
let stopProcessing = false; // pause flag (from options)

//
// Safe storage helpers
//
async function safeGetStorage(keys) {
  try {
    return await new Promise((resolve) => {
      if (!window.chrome || !chrome.storage || !chrome.storage.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get(keys, (res) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn("storage.get error:", chrome.runtime.lastError);
          resolve({});
        } else {
          resolve(res || {});
        }
      });
    });
  } catch (e) {
    console.error("safeGetStorage error:", e);
    return {};
  }
}

async function safeSetStorage(obj) {
  try {
    if (!window.chrome || !chrome.storage || !chrome.storage.local) return;
    await new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve());
    });
  } catch (e) {
    console.error("safeSetStorage error:", e);
  }
}

//
// Append debug log via background helper (preferred) or local storage fallback
//
async function appendDebugLog(text) {
  try {
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "appendDebugLog", text }, () => {});
      return;
    }
    const res = await safeGetStorage(["debugLogs"]);
    const logs = Array.isArray(res.debugLogs) ? res.debugLogs : [];
    const ts = new Date().toISOString();
    logs.push(`${ts} ${text}`);
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
    await safeSetStorage({ debugLogs: logs });
  } catch (e) {}
}

//
// Safe sendMessage with timeout and lastError handling
//
async function safeSendMessage(msg, timeout = 8000) {
  return new Promise((resolve) => {
    try {
      if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({ ok: false, text: null, error: "no_runtime" });
        return;
      }
      let called = false;
      const timer = setTimeout(() => {
        if (!called) {
          called = true;
          resolve({ ok: false, text: null, error: "timeout" });
        }
      }, timeout);

      chrome.runtime.sendMessage(msg, (res) => {
        if (called) return;
        called = true;
        clearTimeout(timer);
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({ ok: false, text: null, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { ok: false, text: null });
        }
      });
    } catch (e) {
      resolve({ ok: false, text: null, error: e && e.message });
    }
  });
}

//
// Debug helper
//
function dbg(...args) {
  try {
    if (DEBUG) {
      console.debug("[BloxdDebug]", ...args);
      appendDebugLog(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    }
  } catch (e) {}
}

//
// Temporary message helper (near the floating UI)
//
function showTempMessage(text, duration = 1200, isError = false) {
  try {
    const id = "bloxd-translator-temp-msg";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.position = "fixed";
      el.style.right = "16px";
      el.style.bottom = "72px";
      el.style.zIndex = 2147483647;
      el.style.padding = "8px 12px";
      el.style.borderRadius = "10px";
      el.style.fontSize = "13px";
      el.style.color = "#fff";
      el.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
      el.style.transition = "opacity 0.25s ease";
      document.body.appendChild(el);
    }
    el.style.background = isError ? "rgba(213,0,0,0.92)" : "rgba(0,0,0,0.72)";
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
      try { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); } catch(e) {}
    }, duration);
  } catch (e) {
    console.warn("showTempMessage error:", e);
  }
}

//
// Floating UI (create once, update state)
//
function createFloatingUIOnce() {
  if (uiInitialized || uiCreating) return;
  uiCreating = true;

  try {
    if (document.getElementById(FLOAT_ID)) {
      uiInitialized = true;
      uiCreating = false;
      return;
    }

    const container = document.createElement("div");
    container.id = FLOAT_ID;
    const shadow = container.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      .wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; font-family: Arial, sans-serif; user-select: none; }
      .btn { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:12px; background:rgba(0,0,0,0.6); color:#fff; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-size:13px; }
      .dot { width:12px; height:12px; border-radius:50%; background:#00C853; box-shadow:0 0 6px rgba(0,200,83,0.6); }
      .dot.off { background:#D50000; box-shadow:0 0 6px rgba(213,0,0,0.6); }
      .label { white-space:nowrap; }
      .mini { font-size:11px; opacity:0.9; color:#eee; }
    `;

    const wrap = document.createElement("div");
    wrap.className = "wrap";

    const btn = document.createElement("div");
    btn.className = "btn";
    btn.title = "Bloxd Translator: ON/OFF";

    const dot = document.createElement("div");
    dot.className = "dot";

    const label = document.createElement("div");
    label.className = "label";
    label.innerText = "Translator";

    const mini = document.createElement("div");
    mini.className = "mini";
    mini.innerText = translateEnabled ? "ON" : "OFF";

    btn.appendChild(dot);
    btn.appendChild(label);
    btn.appendChild(mini);
    wrap.appendChild(btn);
    shadow.appendChild(style);
    shadow.appendChild(wrap);

    // Left click: toggle ON/OFF (no reload)
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (btnProcessing) return;
      btnProcessing = true;
      try {
        const res = await safeGetStorage(["enabled"]);
        const enabledNow = (res && typeof res.enabled !== "undefined") ? res.enabled : true;
        const newState = !enabledNow;
        await safeSetStorage({ enabled: newState });

        // light feedback only
        try {
          const chatEl = findChatBox();
          if (chatEl) showTempMessage("チャットを検出しました", 900);
          else showTempMessage("チャットが見つかりませんでした", 1200, true);
        } catch (e) {
          dbg("chat detect error on toggle:", e);
        }

        updateFloatingUI(newState);
      } catch (err) {
        console.error("Floating UI toggle error:", err);
        dbg("Floating UI toggle error:", err);
      } finally {
        btnProcessing = false;
      }
    });

    // Right click: re-detect chat (lightweight, no scroll/highlight)
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btnProcessing) return;
      btnProcessing = true;

      try {
        const newChat = findChatBox();
        if (newChat) {
          try {
            chatBox = newChat;
            if (observer) {
              try { observer.disconnect(); } catch (er) {}
              observer = null;
            }
            startObserver();
          } catch (err) {
            console.warn("observer restart failed:", err);
            dbg("observer restart failed:", err);
          }
          showTempMessage("チャットを再検出しました", 900);
        } else {
          showTempMessage("チャットが見つかりませんでした", 1200, true);
        }
      } catch (err) {
        console.error("contextmenu reload error:", err);
        dbg("contextmenu reload error:", err);
        showTempMessage("再検出中にエラーが発生しました", 1200, true);
      } finally {
        setTimeout(() => { btnProcessing = false; }, 600);
      }
    });

    (document.body || document.documentElement).appendChild(container);
    uiInitialized = true;
  } catch (e) {
    console.error("createFloatingUIOnce error:", e);
    dbg("createFloatingUIOnce error:", e);
  } finally {
    uiCreating = false;
  }
}

function updateFloatingUI(enabled) {
  const container = document.getElementById(FLOAT_ID);
  if (!container) return;
  const shadow = container.shadowRoot;
  if (!shadow) return;
  const dot = shadow.querySelector(".dot");
  const mini = shadow.querySelector(".mini");
  if (dot) {
    if (enabled) dot.classList.remove("off");
    else dot.classList.add("off");
  }
  if (mini) mini.innerText = enabled ? "ON" : "OFF";
  translateEnabled = enabled;
}

function ensureFloatingUI() {
  if (ensureDebounce) clearTimeout(ensureDebounce);
  ensureDebounce = setTimeout(() => {
    try {
      if (!document.body) return;
      if (!document.getElementById(FLOAT_ID)) createFloatingUIOnce();
      updateFloatingUI(translateEnabled);
    } catch (e) {
      console.error("ensureFloatingUI error:", e);
      dbg("ensureFloatingUI error:", e);
    }
  }, 200);
}

//
// Initialization: delay until idle to avoid blocking page dynamic imports
//
function initWhenIdle() {
  try {
    if (document.readyState !== "complete") {
      window.addEventListener("load", () => {
        if ("requestIdleCallback" in window) {
          requestIdleCallback(() => { ensureFloatingUI(); watchChatBox(); }, { timeout: 2000 });
        } else {
          setTimeout(() => { ensureFloatingUI(); watchChatBox(); }, 1200);
        }
      }, { once: true });
    } else {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => { ensureFloatingUI(); watchChatBox(); }, { timeout: 2000 });
      } else {
        setTimeout(() => { ensureFloatingUI(); watchChatBox(); }, 600);
      }
    }
  } catch (e) {
    console.error("initWhenIdle error:", e);
  }
}

//
// storage initial load and change listener (also debugMode and pause)
//
(async () => {
  const res = await safeGetStorage(["enabled", "debugMode", "paused", "minLength", "throttleMs"]);
  translateEnabled = (res && typeof res.enabled !== "undefined") ? res.enabled : true;
  DEBUG = !!res.debugMode;
  stopProcessing = !!res.paused;
  // optional settings (not required)
  window.__BLOXD_MIN_LENGTH = (res && res.minLength) ? res.minLength : 3;
  window.__BLOXD_THROTTLE_MS = (res && res.throttleMs) ? res.throttleMs : 80;
  initWhenIdle();
})();

if (window.chrome && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.enabled) {
        try { updateFloatingUI(changes.enabled.newValue); } catch (e) { console.error("storage.onChanged handler error:", e); }
      }
      if (changes.debugMode) {
        DEBUG = !!changes.debugMode.newValue;
        dbg("debugMode changed:", DEBUG);
      }
      if (changes.paused) {
        stopProcessing = !!changes.paused.newValue;
        dbg("paused changed:", stopProcessing);
      }
      if (changes.minLength) window.__BLOXD_MIN_LENGTH = changes.minLength.newValue;
      if (changes.throttleMs) window.__BLOXD_THROTTLE_MS = changes.throttleMs.newValue;
    }
  });
}

//
// lightweight body observer to ensure UI exists
//
let bodyObserver = null;
function startBodyObserver() {
  if (bodyObserver) return;
  bodyObserver = new MutationObserver((mutations) => {
    if (!document.getElementById(FLOAT_ID)) ensureFloatingUI();
  });
  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    const t = setInterval(() => {
      if (document.body) {
        clearInterval(t);
        bodyObserver.observe(document.body, { childList: true, subtree: true });
        ensureFloatingUI();
      }
    }, 300);
  }
}
startBodyObserver();

//
// history hooks for SPA route changes
//
(function() {
  const pushState = history.pushState;
  const replaceState = history.replaceState;
  history.pushState = function() { const ret = pushState.apply(this, arguments); window.dispatchEvent(new Event("bloxd-route-change")); return ret; };
  history.replaceState = function() { const ret = replaceState.apply(this, arguments); window.dispatchEvent(new Event("bloxd-route-change")); return ret; };
  window.addEventListener("popstate", () => window.dispatchEvent(new Event("bloxd-route-change")));
})();
window.addEventListener("bloxd-route-change", () => { ensureFloatingUI(); });

window.addEventListener("beforeunload", () => {
  const el = document.getElementById(FLOAT_ID);
  if (el) el.remove();
});

//
// Translation monitoring logic (optimized)
//
function findChatBox() {
  return document.querySelector(".ChatMessages") || document.querySelector(".Chat .ChatMessages") || null;
}

let chatBox = null;
let observer = null;
let pendingNodes = [];
let translateDebounce = null;

function shouldTranslateText(text) {
  if (!text) return false;
  const s = text.trim();
  const minLen = window.__BLOXD_MIN_LENGTH || 3;
  if (s.length < minLen) return false;
  const shortIgnore = ["hi", "hey", "ok", "gg", "ty", "thx"];
  if (shortIgnore.includes(s.toLowerCase())) return false;
  return true;
}

function processPendingNodes() {
  if (stopProcessing) {
    dbg("processing paused by options");
    return;
  }
  if (document.hidden) {
    dbg("page hidden — skipping processPendingNodes");
    return;
  }

  const nodes = pendingNodes.splice(0, pendingNodes.length);
  if (!translateEnabled || nodes.length === 0) return;

  if (nodes.length > 400) {
    nodes.splice(200);
    if (pendingNodes.length > 1000) pendingNodes.splice(0, 500);
  }

  for (const node of nodes) {
    try {
      if (!node || node.nodeType !== 1) continue;
      if (node.hasAttribute && node.hasAttribute(TRANSLATED_ATTR)) continue;

      const texts = node.matches && node.matches(".IndividualText") ? [node] : Array.from(node.querySelectorAll(".IndividualText"));
      for (const tEl of texts) {
        if (!tEl || (tEl.hasAttribute && tEl.hasAttribute(TRANSLATED_ATTR))) continue;
        const original = tEl.textContent;
        if (!shouldTranslateText(original)) continue;

        // duplicate suppression per element
        const lastSent = tEl.getAttribute("data-last-sent");
        if (lastSent && lastSent === original) continue;
        tEl.setAttribute("data-last-sent", original);

        // throttle based on option
        const throttleMs = window.__BLOXD_THROTTLE_MS || 80;
        setTimeout(() => {
          safeSendMessage({ type: "translate", text: original }, 8000).then((res) => {
            try {
              if (res && res.ok && res.text) {
                tEl.textContent = res.text;
                tEl.setAttribute(TRANSLATED_ATTR, "1");
                dbg("translated applied:", res.text);
              } else {
                setTimeout(() => {
                  try {
                    if (pendingNodes.length < 500) queueNodeForTranslation(node);
                  } catch (e) {}
                }, 800);
              }
            } catch (e) {
              console.error("Translation apply error:", e);
              dbg("Translation apply error:", e);
            }
          }).catch((e) => {
            console.warn("safeSendMessage promise rejected:", e);
            dbg("safeSendMessage promise rejected:", e);
          });
        }, throttleMs);
      }
    } catch (e) {
      console.error("processPendingNodes loop error:", e);
      dbg("processPendingNodes loop error:", e);
    }
  }
}

function queueNodeForTranslation(node) {
  try {
    if (!node) return;
    if (pendingNodes.length > 0 && pendingNodes[pendingNodes.length - 1] === node) return;
    if (pendingNodes.length > 1200) pendingNodes.splice(0, 400);
    pendingNodes.push(node);
    if (translateDebounce) clearTimeout(translateDebounce);
    translateDebounce = setTimeout(() => {
      processPendingNodes();
      translateDebounce = null;
    }, DEBOUNCE_MS);
  } catch (e) {
    console.error("queueNodeForTranslation error:", e);
    dbg("queueNodeForTranslation error:", e);
  }
}

function startObserver() {
  if (!chatBox) return;
  try {
    if (observer) {
      try { observer.disconnect(); } catch (e) {}
      observer = null;
    }

    observer = new MutationObserver((mutations) => {
      try {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (!node) continue;
            if (node.nodeType === 1) {
              const cls = node.classList;
              if (cls && (cls.contains("MessageWrapper") || cls.contains("TextFromServer") || cls.contains("IndividualText"))) {
                queueNodeForTranslation(node);
                continue;
              }
              if (node.querySelectorAll) {
                const inner = node.querySelectorAll(".IndividualText");
                if (inner && inner.length) inner.forEach(el => queueNodeForTranslation(el));
              }
            } else if (node.nodeType === 3 && node.parentElement) {
              queueNodeForTranslation(node.parentElement);
            }
          }
          if (m.type === "characterData" && m.target && m.target.parentElement) {
            queueNodeForTranslation(m.target.parentElement);
          }
        }
      } catch (e) {
        console.error("Observer callback error:", e);
        dbg("Observer callback error:", e);
        try { observer.disconnect(); } catch (er) {}
        observer = null;
        setTimeout(() => {
          try { if (chatBox) startObserver(); } catch (er) { console.error("observer restart failed:", er); dbg("observer restart failed:", er); }
        }, 1000);
      }
    });

    observer.observe(chatBox, { childList: true, subtree: true, characterData: true });
    dbg("observer started on chatBox", chatBox);
  } catch (e) {
    console.error("startObserver error:", e);
    dbg("startObserver error:", e);
    setTimeout(() => { try { if (chatBox) startObserver(); } catch (er) {} }, 1500);
  }
}

function watchChatBox() {
  try {
    const newChatBox = findChatBox();
    if (newChatBox && newChatBox !== chatBox) {
      chatBox = newChatBox;
      startObserver();
    }
  } catch (e) {
    console.error("watchChatBox error:", e);
    dbg("watchChatBox error:", e);
  }
}

// initial start is done via initWhenIdle()

// watchdog to ensure observer/chatBox remain active (30s)
let watchdogTimer = setInterval(() => {
  try {
    if (document.hidden) return;
    const newChat = findChatBox();
    if (!newChat) return;
    if (newChat !== chatBox) {
      chatBox = newChat;
      if (observer) {
        try { observer.disconnect(); } catch (e) {}
        observer = null;
      }
      startObserver();
    } else {
      if (!observer) startObserver();
    }
  } catch (e) {
    console.error("watchdog error:", e);
    dbg("watchdog error:", e);
  }
}, 30000);

window.addEventListener("beforeunload", () => {
  try { clearInterval(watchdogTimer); } catch (e) {}
});

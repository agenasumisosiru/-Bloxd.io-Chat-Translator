// options.js - updated: minLength, throttleMs, pause, debug logs controls
document.addEventListener("DOMContentLoaded", async () => {
  const langSelect = document.getElementById("langSelect");
  const debugChk = document.getElementById("debugMode");
  const pauseChk = document.getElementById("pauseProcessing");
  const refreshBtn = document.getElementById("refreshLogs");
  const downloadBtn = document.getElementById("downloadLogs");
  const clearBtn = document.getElementById("clearLogs");
  const logsEl = document.getElementById("logs");

  // additional controls
  const minLenEl = document.getElementById("minLength");
  const throttleEl = document.getElementById("throttleMs");

  chrome.storage.local.get(["targetLang", "debugMode", "paused", "debugLogs", "minLength", "throttleMs"], (res) => {
    if (res && res.targetLang) {
      try { langSelect.value = res.targetLang; } catch (e) {}
    }
    debugChk.checked = !!(res && res.debugMode);
    pauseChk.checked = !!(res && res.paused);
    if (minLenEl) minLenEl.value = (res && res.minLength) ? res.minLength : 3;
    if (throttleEl) throttleEl.value = (res && res.throttleMs) ? res.throttleMs : 80;
    renderLogs(res && res.debugLogs ? res.debugLogs : []);
  });

  langSelect.addEventListener("change", () => {
    chrome.storage.local.set({ targetLang: langSelect.value });
  });

  debugChk.addEventListener("change", () => {
    chrome.storage.local.set({ debugMode: debugChk.checked });
  });

  pauseChk.addEventListener("change", () => {
    chrome.storage.local.set({ paused: pauseChk.checked });
  });

  if (minLenEl) {
    minLenEl.addEventListener("change", () => {
      const v = parseInt(minLenEl.value, 10) || 3;
      chrome.storage.local.set({ minLength: v });
    });
  }

  if (throttleEl) {
    throttleEl.addEventListener("change", () => {
      const v = parseInt(throttleEl.value, 10) || 80;
      chrome.storage.local.set({ throttleMs: v });
    });
  }

  refreshBtn.addEventListener("click", () => {
    chrome.storage.local.get(["debugLogs"], (res) => {
      renderLogs(res && res.debugLogs ? res.debugLogs : []);
    });
  });

  clearBtn.addEventListener("click", () => {
    chrome.storage.local.remove(["debugLogs"], () => {
      renderLogs([]);
      alert("ログをクリアしました");
    });
  });

  downloadBtn.addEventListener("click", () => {
    chrome.storage.local.get(["debugLogs"], (res) => {
      const logs = res && res.debugLogs ? res.debugLogs : [];
      const blob = new Blob([logs.join("\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bloxd_translator_logs_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  });

  function renderLogs(logs) {
    if (!Array.isArray(logs) || logs.length === 0) {
      logsEl.textContent = "(ログは空です)";
      return;
    }
    logsEl.textContent = logs.join("\n");
    logsEl.scrollTop = logsEl.scrollHeight;
  }
});

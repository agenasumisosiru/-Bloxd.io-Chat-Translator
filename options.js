// options.js - 翻訳設定、デバッグログ、アップデート確認

const RELEASES_URL = "https://github.com/agenasumisosiru/-Bloxd.io-Chat-Translator/releases/latest";

function getStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result || {});
    });
  });
}

function setStorage(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function removeStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response || {});
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const langSelect = document.getElementById("langSelect");
  const debugChk = document.getElementById("debugMode");
  const pauseChk = document.getElementById("pauseProcessing");
  const refreshBtn = document.getElementById("refreshLogs");
  const downloadBtn = document.getElementById("downloadLogs");
  const clearBtn = document.getElementById("clearLogs");
  const logsEl = document.getElementById("logs");
  const minLenEl = document.getElementById("minLength");
  const throttleEl = document.getElementById("throttleMs");

  // options.html に追加したアップデートUI。古いHTMLでも動くようにnullを許容する。
  const updateStatus = document.getElementById("updateStatus");
  const checkUpdateBtn = document.getElementById("checkUpdate");
  const openReleaseBtn = document.getElementById("openRelease");
  const currentVersion = chrome.runtime.getManifest().version;
  let latestReleaseUrl = RELEASES_URL;

  function setUpdateStatus(message, state = "") {
    if (!updateStatus) return;
    updateStatus.textContent = message;
    updateStatus.dataset.state = state;
  }

  function renderUpdateStatus(data = {}) {
    latestReleaseUrl = data.latestReleaseUrl || latestReleaseUrl;

    if (data.updateAvailable && data.latestVersion) {
      setUpdateStatus(`更新があります: v${data.latestVersion}（現在 v${currentVersion}）`, "available");
      if (openReleaseBtn) openReleaseBtn.hidden = false;
      return;
    }

    if (data.latestVersion) {
      setUpdateStatus(`最新版です（v${currentVersion}）`, "latest");
    } else {
      setUpdateStatus(`現在のバージョン: v${currentVersion}`, "unknown");
    }
    if (openReleaseBtn) openReleaseBtn.hidden = true;
  }

  async function checkForUpdates() {
    if (checkUpdateBtn) checkUpdateBtn.disabled = true;
    setUpdateStatus("バージョンを確認中...", "checking");

    try {
      const result = await sendMessage({ type: "checkForUpdates" });
      if (!result.ok) throw new Error(result.error || "update check failed");
      renderUpdateStatus(result);

      // background.js の戻り値が簡略形式でも、保存済みの詳細情報を読み直す。
      const stored = await getStorage(["updateAvailable", "latestVersion", "latestReleaseUrl"]);
      renderUpdateStatus(stored);
    } catch (error) {
      console.warn("Update check failed:", error);
      setUpdateStatus("更新確認に失敗しました。ネットワーク接続を確認してください。", "error");
      if (openReleaseBtn) openReleaseBtn.hidden = true;
    } finally {
      if (checkUpdateBtn) checkUpdateBtn.disabled = false;
    }
  }

  function renderLogs(logs) {
    if (!Array.isArray(logs) || logs.length === 0) {
      logsEl.textContent = "(ログは空です)";
      return;
    }
    logsEl.textContent = logs.join("\n");
    logsEl.scrollTop = logsEl.scrollHeight;
  }

  // 保存済み設定を読み込む
  try {
    const res = await getStorage([
      "targetLang", "debugMode", "paused", "debugLogs", "minLength", "throttleMs",
      "updateAvailable", "latestVersion", "latestReleaseUrl"
    ]);

    if (res.targetLang && langSelect) langSelect.value = res.targetLang;
    if (debugChk) debugChk.checked = !!res.debugMode;
    if (pauseChk) pauseChk.checked = !!res.paused;
    if (minLenEl) minLenEl.value = res.minLength || 3;
    if (throttleEl) throttleEl.value = res.throttleMs || 80;
    renderLogs(res.debugLogs || []);
    renderUpdateStatus(res);
  } catch (error) {
    console.warn("Settings load failed:", error);
    renderLogs([]);
    setUpdateStatus(`現在のバージョン: v${currentVersion}`, "unknown");
  }

  langSelect?.addEventListener("change", () => {
    setStorage({ targetLang: langSelect.value }).catch(console.warn);
  });

  debugChk?.addEventListener("change", () => {
    setStorage({ debugMode: debugChk.checked }).catch(console.warn);
  });

  pauseChk?.addEventListener("change", () => {
    setStorage({ paused: pauseChk.checked }).catch(console.warn);
  });

  minLenEl?.addEventListener("change", () => {
    const value = Math.min(20, Math.max(1, Number.parseInt(minLenEl.value, 10) || 3));
    minLenEl.value = value;
    setStorage({ minLength: value }).catch(console.warn);
  });

  throttleEl?.addEventListener("change", () => {
    const value = Math.min(500, Math.max(10, Number.parseInt(throttleEl.value, 10) || 80));
    throttleEl.value = value;
    setStorage({ throttleMs: value }).catch(console.warn);
  });

  refreshBtn?.addEventListener("click", async () => {
    try {
      const res = await getStorage(["debugLogs"]);
      renderLogs(res.debugLogs || []);
    } catch (error) {
      console.warn("Log refresh failed:", error);
    }
  });

  clearBtn?.addEventListener("click", async () => {
    try {
      await removeStorage(["debugLogs"]);
      renderLogs([]);
      alert("ログをクリアしました");
    } catch (error) {
      console.warn("Log clear failed:", error);
      alert("ログの削除に失敗しました");
    }
  });

  downloadBtn?.addEventListener("click", async () => {
    try {
      const res = await getStorage(["debugLogs"]);
      const logs = Array.isArray(res.debugLogs) ? res.debugLogs : [];
      const blob = new Blob([logs.join("\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bloxd_translator_logs_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn("Log download failed:", error);
    }
  });

  checkUpdateBtn?.addEventListener("click", checkForUpdates);

  openReleaseBtn?.addEventListener("click", () => {
    chrome.tabs.create({ url: latestReleaseUrl || RELEASES_URL });
  });
});

let translateEnabled = true;

// ON/OFF 状態読み込み
chrome.storage.local.get("enabled", ({ enabled }) => {
    translateEnabled = enabled ?? true;
});

// ON/OFF が変わったら反映
chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
        translateEnabled = changes.enabled.newValue;
    }
});

// bloxd.io のチャット欄を探す
function findChatBox() {
    return document.querySelector(".Chat .ChatMessages");
}

let chatBox = null;
let observer = null;

// チャット欄を監視開始
function startObserver() {
    if (!chatBox) return;

    // 既存 observer があれば停止
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {

                if (node.nodeType === 1 && node.innerText) {
                    const original = node.innerText;

                    // ★ ON/OFF チェック（return ではなく continue）
                    if (!translateEnabled) continue;

                    // ★ 翻訳言語は background.js が自動で選ぶ
                    chrome.runtime.sendMessage(
                        { type: "translate", text: original },
                        (translated) => {
                            if (translated) {
                                node.innerText = translated;
                            }
                        }
                    );
                }

            }
        }
    });

    observer.observe(chatBox, { childList: true });
}

// チャット欄が変わったら自動で再監視
function watchChatBox() {
    const newChatBox = findChatBox();

    // チャット欄が変わった場合のみ再監視
    if (newChatBox && newChatBox !== chatBox) {
        chatBox = newChatBox;
        startObserver();
    }
}

// 500ms ごとにチャット欄の変化をチェック
setInterval(watchChatBox, 500);

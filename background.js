// 拡張アイコンで ON/OFF 切り替え
chrome.action.onClicked.addListener(async () => {
    const { enabled } = await chrome.storage.local.get("enabled");
    const newState = !enabled;

    await chrome.storage.local.set({ enabled: newState });

    chrome.action.setBadgeText({ text: newState ? "ON" : "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: newState ? "#00C853" : "#D50000" });
});

// 翻訳API
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    if (msg.type === "translate") {

        // ★ オプションで選んだ言語を読み込む
        const { targetLang } = await chrome.storage.local.get("targetLang");
        const tl = targetLang ?? "ja";

        const sl = "auto";
        const q = encodeURIComponent(msg.text);

        const url =
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=bd&dj=1&q=${q}`;

        const res = await fetch(url);
        const data = await res.json();

        const translated = data.sentences.map(s => s.trans).join("");

        sendResponse(translated);
    }
    return true;
});

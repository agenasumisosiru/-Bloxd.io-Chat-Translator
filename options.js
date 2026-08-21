const select = document.getElementById("langSelect");

// 保存されている言語を読み込む
chrome.storage.local.get("targetLang", ({ targetLang }) => {
    select.value = targetLang ?? "ja";
});

// 言語が変更されたら保存
select.addEventListener("change", () => {
    chrome.storage.local.set({ targetLang: select.value });
});

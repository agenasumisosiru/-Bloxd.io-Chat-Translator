# -Bloxd.io-Chat-Translator
仕様変更で動かなくなる場合があります。
Bloxd.io のチャットを 自動で日本語に翻訳する Chrome 拡張機能です。

ON/OFF の切り替えも可能で、アイコンに ON（緑） / OFF（赤 が表示されます。

対応ブラウザ:chromeなどのchronium系ブラウザ
動作確認はchrome、brave、vivaldiでしております。

 主な機能



　Bloxd.io のチャットメッセージを自動で日本語に翻訳

- Google 翻訳apiを使用しているため上限に達することがあります。ご了承ください。

- 拡張アイコンをクリックして \*\*ON/OFF 切り替え\*\*

- ON は緑、OFF は赤でアイコンに表示

- bloxd.io の DOM を壊さない安全設計



---


  インストール方法（開発者モード）



1. このリポジトリのリリースをおしてそこからzipをダウンロード 

2. Chrome で `chrome://extensions/` を開く  

3. 右上の デベロッパーモード を ON  

4. そこにファイルをドラッグします  

5. そうすると読み込まれます。



  使用している技術

 Manifest V3

 Chrome Extensions API  

; - `chrome.action`

; - `chrome.storage`

; - `chrome.runtime`

- Google Translate API

- MutationObserver によるチャット監視


 🔐 ON/OFF の仕組み



\- `chrome.action.onClicked` で状態を切り替え

\- `chrome.storage.local` に保存

\- content.js が状態を読み取って翻訳処理を実行/停止

\## 📜 ライセンス
MIT License

Copyright (c) 2026 agenasunomisosiru

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights  
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell  
copies of the Software, and to permit persons to whom the Software is  
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in  
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR  
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,  
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE  
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER  
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,  
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN  
THE SOFTWARE.






なお何か問題があった場合はgithubもしくはメールからご連絡ください



\---



\## 作者



あげなすのみそ汁

tokumei729@protonmail.com






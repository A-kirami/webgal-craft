<p align="right">
  <a href="./README.md">简体中文</a> | <b>繁體中文</b> | <a href="./README.en.md">English</a> | <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft">
    <br />
    <img src="./public/webgal-craft-logo.svg" alt="WebGAL Craft 標誌" width="160" />
    <br />
    <h1 align="center">WebGAL Craft</h1>
  </a>
</p>

<p align="center">
  <strong>為 WebGAL 創作者打造的跨平台視覺小說工作室</strong>
  <br />
  編寫劇情、編排演出、管理資源、即時預覽、一鍵匯出，在同一個視窗裡完成。
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft/actions/workflows/build.yml" target="__blank"
    ><img src="https://github.com/A-kirami/webgal-craft/actions/workflows/build.yml/badge.svg?branch=main&event=push" alt="建置"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/actions/workflows/test.yml" target="__blank"
    ><img src="https://github.com/A-kirami/webgal-craft/actions/workflows/test.yml/badge.svg?branch=main&event=push" alt="測試"
  /></a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MPL--2.0-blue" alt="授權條款 MPL-2.0" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-6f42c1" alt="支援平台：Windows、macOS、Linux、Android" />
  <br />
  <a href="https://github.com/A-kirami/webgal-craft/releases" target="__blank"
    ><img src="https://img.shields.io/github/v/release/A-kirami/webgal-craft?include_prereleases&&color=70aeff&style=social" alt="發行版本"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/stargazers" target="__blank"
    ><img alt="GitHub 星號數" src="https://img.shields.io/github/stars/A-kirami/webgal-craft?style=social"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/releases" target="__blank"
    ><img alt="GitHub 下載次數" src="https://img.shields.io/github/downloads/A-kirami/webgal-craft/total?style=social"
  /></a>
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft/releases/latest">下載最新版</a>
  ·
  <a href="https://webgalcraft.com">官方網站</a>
  ·
  <a href="https://github.com/A-kirami/webgal-craft/issues">回報問題</a>
  ·
  <a href="https://qm.qq.com/q/W2Dt9V2F66">加入交流群組</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/readme-hero-dark.webp" />
    <img src="./.github/assets/readme-hero.webp" alt="WebGAL Craft 編輯頁面總覽" width="100%" />
  </picture>
</p>

## 簡介

WebGAL Craft 是一款為 [WebGAL](https://github.com/OpenWebGAL/WebGAL) 遊戲創作者打造的第三方視覺小說編輯器。它將遊戲管理、腳本編輯、資源管理、演出除錯和匯出發佈整合進同一個工作流程：你可以透過視覺化表單組織劇情，也可以隨時切回腳本細緻調整；每一處修改都能在預覽中立即看到效果。

- **所見即所得**：視覺化編輯與腳本編輯雙向同步，預覽隨編輯即時更新。
- **穩妥可靠**：自動記錄場景歷史版本，外部程式的修改可比對合併，刪除的遊戲與檔案移到資源回收桶。
- **跨平台**：支援 Windows、macOS、Linux 與 Android 平板，介面支援多種語言。

## 功能特色

### 視覺化場景編輯

以卡片形式呈現每一條語句，透過表單編輯對話、立繪、背景、音訊、分支等指令參數，無需記憶語法，也能隨時切回腳本編輯同一份場景。

- 從指令面板拖放插入語句，拖曳調整語句順序
- 欄位自動完成，常用指令可加入收藏、設定預設值或儲存為語句群組
- 統一診斷語法錯誤與缺失資源

### 劇情流程圖

在畫布上梳理主線與支線的場景走向，並用作遊戲內的流程圖展示。

- 從場景樹將場景拖曳到畫布上，產生節點並連線
- 主線之外可建立多條支線流程
- 在遊戲設定中指定未解鎖節點的顯示方式

### 即時預覽

編輯器內嵌 WebGAL 引擎預覽，邊寫邊看，不必在編輯器和遊戲視窗之間來回切換。

- 「執行到此句」：從任意語句直接跳轉預覽對應畫面
- 在預覽畫面中直接拖曳、縮放、旋轉立繪與背景，參數自動寫回語句
- 預覽畫面可自由縮放、平移，也能在瀏覽器中開啟並保持同步

### 效果與動畫編輯器

用圖形化面板調整變換、濾鏡等演出效果，並製作關鍵影格動畫。

- 關鍵影格動畫支援逐格預覽，並可在預覽畫面中拖曳調整
- 動畫可儲存為動畫檔案，並在 `setAnimation` 語句中就地編輯參照的動畫

### 資源管理

集中瀏覽立繪、背景、音訊、影片等遊戲資源，創作中隨取隨用。

- 游標停留即可預覽圖片、音訊與影片
- 顯示資源引用次數，重新命名或移動時自動更新引用
- 偵測缺失與損壞的資源，並提供還原流程
- 從系統檔案管理員拖放匯入場景與資源，或直接拖入編輯器使用

### 引擎與模板

依遊戲需求管理 WebGAL 引擎與介面模板，配合不同版本和製作風格。

- 在 WebGAL Craft 內下載、更新 WebGAL 官方引擎，多個版本可以並存
- 拖放壓縮檔匯入第三方引擎和模板
- 每個遊戲獨立綁定引擎與模板，隨時切換或重設

### 遊戲設定與匯出

從設定到發佈，不用離開編輯器。

- 透過表單編輯遊戲設定，不用手動修改設定檔
- 用圖示編輯器從一張圖片產生 Web、桌面與行動裝置所需的遊戲圖示
- 匯出為 Web 遊戲，或同時匯出 Windows、macOS、Linux 桌面遊戲
- Android 安裝套件匯出即將推出

## 下載安裝

前往 [Releases](https://github.com/A-kirami/webgal-craft/releases) 下載適合你系統的最新版本。

| 平台 | 架構 | 安裝套件 |
| --- | --- | --- |
| Windows | x64 | `.exe` |
| macOS | Intel / Apple Silicon | `.dmg` |
| Linux | x64 | `.AppImage` / `.deb` |
| Android（平板） | arm64 | `.apk` |

首次啟動時，新手引導會帶你完成安裝引擎、建立遊戲和認識編輯器；快捷鍵可在「設定 → 說明」中查看。

> [!IMPORTANT]
> WebGAL Craft 需要 WebGAL `4.6.2` 或以上版本的引擎。你可以在 WebGAL Craft 內直接下載官方引擎，也可以從 [WebGAL Releases](https://github.com/OpenWebGAL/WebGAL/releases) 取得後匯入。

## 貢獻

歡迎任何形式的貢獻，包括回報問題、提出建議、改善文件和提交程式碼。開始之前，先閱讀[貢獻指南](./.github/CONTRIBUTING.md)。

## 授權條款

- 程式碼：[MPL-2.0](./LICENSE)，© 2026 Akirami
- 標誌：CC-BY-NC-ND，Designs by Akirami

## 致謝

感謝 [WebGAL](https://github.com/OpenWebGAL/WebGAL) 團隊開發的視覺小說引擎。

### 貢獻者

感謝以下貢獻者對 WebGAL Craft 作出的貢獻：

<a href="https://github.com/A-kirami/webgal-craft/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=A-kirami/webgal-craft" alt="貢獻者" />
</a>

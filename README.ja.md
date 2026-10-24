<p align="right">
  <a href="./README.md">简体中文</a> | <a href="./README.zh-Hant.md">繁體中文</a> | <a href="./README.en.md">English</a> | <b>日本語</b>
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft">
    <br />
    <img src="./public/webgal-craft-logo.svg" alt="WebGAL Craft ロゴ" width="160" />
    <br />
    <h1 align="center">WebGAL Craft</h1>
  </a>
</p>

<p align="center">
  <strong>WebGAL クリエイターのためのクロスプラットフォーム・ビジュアルノベル制作環境</strong>
  <br />
  シナリオ執筆、演出調整、リソース管理、リアルタイムプレビュー、ワンクリックでのエクスポートまで、ひとつのウィンドウで完結します。
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft/actions/workflows/build.yml" target="__blank"
    ><img src="https://github.com/A-kirami/webgal-craft/actions/workflows/build.yml/badge.svg?branch=main&event=push" alt="ビルド"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/actions/workflows/test.yml" target="__blank"
    ><img src="https://github.com/A-kirami/webgal-craft/actions/workflows/test.yml/badge.svg?branch=main&event=push" alt="テスト"
  /></a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MPL--2.0-blue" alt="ライセンス MPL-2.0" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-6f42c1" alt="対応プラットフォーム：Windows、macOS、Linux、Android" />
  <br />
  <a href="https://github.com/A-kirami/webgal-craft/releases" target="__blank"
    ><img src="https://img.shields.io/github/v/release/A-kirami/webgal-craft?include_prereleases&&color=70aeff&style=social" alt="リリースバージョン"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/stargazers" target="__blank"
    ><img alt="GitHub スター数" src="https://img.shields.io/github/stars/A-kirami/webgal-craft?style=social"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/releases" target="__blank"
    ><img alt="GitHub ダウンロード数" src="https://img.shields.io/github/downloads/A-kirami/webgal-craft/total?style=social"
  /></a>
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft/releases/latest">最新版をダウンロード</a>
  ·
  <a href="https://webgalcraft.com">公式サイト</a>
  ·
  <a href="https://github.com/A-kirami/webgal-craft/issues">問題を報告</a>
  ·
  <a href="https://qm.qq.com/q/W2Dt9V2F66">QQ コミュニティに参加</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/readme-hero-dark.webp" />
    <img src="./.github/assets/readme-hero.webp" alt="WebGAL Craft 編集画面の全体像" width="100%" />
  </picture>
</p>

## 概要

WebGAL Craft は、[WebGAL](https://github.com/OpenWebGAL/WebGAL) でゲームを制作するクリエイター向けのサードパーティ製ビジュアルノベルエディターです。ゲーム管理、スクリプト編集、リソース管理、演出のデバッグ、エクスポートと公開をひとつのワークフローにまとめています。フォームで視覚的にシナリオを組み立てながら、いつでもスクリプトに切り替えて細かく調整でき、変更はすぐにプレビューで確認できます。

- **見たまま編集**：ビジュアル編集とスクリプト編集が双方向に同期し、プレビューもリアルタイムで更新されます。
- **安心して編集**：シーンの変更履歴を自動保存し、外部プログラムによる変更は比較してマージできます。削除したゲームやファイルはゴミ箱に移動します。
- **クロスプラットフォーム**：Windows、macOS、Linux、Android タブレットに対応し、インターフェースは複数の言語で利用できます。

## 主な機能

### ビジュアルシーン編集

各ステートメントをカード形式で表示し、セリフ、立ち絵、背景、音声、分岐などのコマンドパラメーターをフォームで編集できます。構文を覚える必要はなく、同じシーンをいつでもスクリプトで編集できます。

- コマンドパネルからステートメントをドラッグ＆ドロップで挿入し、ドラッグで並べ替え
- 入力項目の自動補完、よく使うコマンドのお気に入り登録、初期値の設定、ステートメントグループの保存
- 構文エラーと不足しているリソースをまとめて確認

### ストーリーのフローチャート

キャンバス上でメインストーリーと支線ストーリーのシーンの流れを整理し、ゲーム内のフローチャート表示にも利用できます。

- シーンツリーからキャンバスにシーンをドラッグしてノードを作成し、ノード同士を接続
- メインストーリーに加えて複数の支線フローを作成
- 未解放ノードの表示方法をゲーム設定で指定

### リアルタイムプレビュー

エディターに WebGAL エンジンのプレビューを内蔵し、書きながら画面を確認できます。エディターとゲームウィンドウを行き来する必要はありません。

- 「この行まで実行」で任意のステートメントの画面に直接ジャンプ
- プレビュー上で立ち絵や背景を直接ドラッグ、拡大縮小、回転し、パラメーターをステートメントに自動反映
- プレビューを自由に拡大縮小・移動でき、ブラウザーで開いて同期を維持することも可能

### エフェクト・アニメーションエディター

グラフィカルなパネルで変形やフィルターなどの演出効果を調整し、キーフレームアニメーションを作成できます。

- キーフレームアニメーションをコマ送りでプレビューし、プレビュー上のドラッグで調整
- アニメーションをファイルに保存し、`setAnimation` ステートメントから参照先のアニメーションをその場で編集

### リソース管理

立ち絵、背景、音声、動画などのゲームリソースをまとめて閲覧し、制作中にすぐ利用できます。

- カーソルを重ねて画像・音声・動画をプレビュー
- リソースの参照数を表示し、名前変更や移動時に参照を自動更新
- 不足・破損したリソースを検出し、復元手順を案内
- システムのファイルマネージャーからシーンやリソースをドラッグ＆ドロップでインポート、またはエディターに直接ドロップして使用

### エンジンとテンプレート

ゲームごとに WebGAL エンジンと UI テンプレートを管理し、異なるバージョンや制作スタイルに対応できます。

- WebGAL Craft 内で公式 WebGAL エンジンをダウンロード・更新し、複数のバージョンを併存
- 圧縮ファイルをドラッグ＆ドロップしてサードパーティ製のエンジンやテンプレートをインポート
- ゲームごとにエンジンとテンプレートを個別に割り当て、いつでも切り替え・リセット

### ゲーム設定とエクスポート

設定から公開まで、エディター内で完結します。

- 設定ファイルを直接書き換えず、フォームでゲーム設定を編集
- アイコンエディターで 1 枚の画像から Web・デスクトップ・モバイル向けのゲームアイコンを生成
- Web ゲームとしてエクスポート、または Windows・macOS・Linux 向けデスクトップゲームをまとめてエクスポート
- Android パッケージのエクスポートは近日対応予定

## ダウンロードとインストール

[Releases](https://github.com/A-kirami/webgal-craft/releases) から、使用するシステムに合った最新版をダウンロードできます。

| プラットフォーム | アーキテクチャ | パッケージ |
| --- | --- | --- |
| Windows | x64 | `.exe` |
| macOS | Intel / Apple Silicon | `.dmg` |
| Linux | x64 | `.AppImage` / `.deb` |
| Android（タブレット） | arm64 | `.apk` |

初回起動時のガイドで、エンジンのインストール、ゲームの作成、エディターの使い方を確認できます。キーボードショートカットは「設定 → ヘルプ」で確認できます。

> [!IMPORTANT]
> WebGAL Craft には WebGAL `4.6.2` 以降のエンジンが必要です。WebGAL Craft 内で公式エンジンを直接ダウンロードするか、[WebGAL Releases](https://github.com/OpenWebGAL/WebGAL/releases) から取得してインポートできます。

## コントリビューション

不具合報告、提案、ドキュメントの改善、コードの提供など、さまざまな形での貢献を歓迎します。始める前に[コントリビューションガイド](./.github/CONTRIBUTING.md)を確認してください。

## ライセンス

- コード：[MPL-2.0](./LICENSE)、© 2026 Akirami
- ロゴ：CC-BY-NC-ND、Designs by Akirami

## 謝辞

ビジュアルノベルエンジンを開発した [WebGAL](https://github.com/OpenWebGAL/WebGAL) チームに感謝します。

### コントリビューター

WebGAL Craft に貢献してくださった皆さんに感謝します。

<a href="https://github.com/A-kirami/webgal-craft/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=A-kirami/webgal-craft" alt="コントリビューター" />
</a>

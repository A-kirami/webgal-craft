<p align="right">
  <a href="./README.md">简体中文</a> | <a href="./README.zh-Hant.md">繁體中文</a> | <b>English</b> | <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft">
    <br />
    <img src="./public/webgal-craft-logo.svg" alt="WebGAL Craft Logo" width="160" />
    <br />
    <h1 align="center">WebGAL Craft</h1>
  </a>
</p>

<p align="center">
  <strong>A cross-platform visual novel studio for WebGAL creators</strong>
  <br />
  Write stories, direct scenes, manage assets, preview in real time, and export with one click—all in one window.
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft/actions/workflows/build.yml" target="__blank"
    ><img src="https://github.com/A-kirami/webgal-craft/actions/workflows/build.yml/badge.svg?branch=main&event=push" alt="Build"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/actions/workflows/test.yml" target="__blank"
    ><img src="https://github.com/A-kirami/webgal-craft/actions/workflows/test.yml/badge.svg?branch=main&event=push" alt="Test"
  /></a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MPL--2.0-blue" alt="License MPL-2.0" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android-6f42c1" alt="Supported platforms: Windows, macOS, Linux, Android" />
  <br />
  <a href="https://github.com/A-kirami/webgal-craft/releases" target="__blank"
    ><img src="https://img.shields.io/github/v/release/A-kirami/webgal-craft?include_prereleases&&color=70aeff&style=social" alt="Release Version"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/stargazers" target="__blank"
    ><img alt="GitHub stars" src="https://img.shields.io/github/stars/A-kirami/webgal-craft?style=social"
  /></a>
  <a href="https://github.com/A-kirami/webgal-craft/releases" target="__blank"
    ><img alt="GitHub downloads" src="https://img.shields.io/github/downloads/A-kirami/webgal-craft/total?style=social"
  /></a>
</p>

<p align="center">
  <a href="https://github.com/A-kirami/webgal-craft/releases/latest">Download the latest release</a>
  ·
  <a href="https://webgalcraft.com">Official website</a>
  ·
  <a href="https://github.com/A-kirami/webgal-craft/issues">Report an issue</a>
  ·
  <a href="https://qm.qq.com/q/W2Dt9V2F66">Join the QQ community</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/readme-hero-dark.webp" />
    <img src="./.github/assets/readme-hero.webp" alt="WebGAL Craft editor overview" width="100%" />
  </picture>
</p>

## Introduction

WebGAL Craft is a third-party visual novel editor for creators using [WebGAL](https://github.com/OpenWebGAL/WebGAL). It brings game management, script editing, asset management, scene debugging, and publishing into one workflow. Build your story with visual forms or switch to the script for fine-tuning, and see every change immediately in the preview.

- **What you see is what you get**: Visual and script editing stay in sync, with the preview updating in real time.
- **Reliable editing**: Scene history is saved automatically, changes made by external programs can be compared and merged, and deleted games and files are moved to the recycle bin.
- **Cross-platform**: Supports Windows, macOS, Linux, and Android tablets, with a multilingual interface.

## Features

### Visual scene editing

Each statement appears as a card. Edit parameters for dialogue, character sprites, backgrounds, audio, branches, and more through forms without memorizing syntax, and switch to script editing for the same scene at any time.

- Drag and drop statements from the command panel, and drag to reorder them
- Use field autocompletion, favorite frequently used commands, set default values, or save statement groups
- Check syntax errors and missing assets in one place

### Story flowchart

Map out scenes in the main and branch stories on a canvas, and use the flowchart in your game.

- Drag scenes from the scene tree onto the canvas to create nodes and connect them
- Create multiple branch flows alongside the main story
- Configure how locked nodes appear in the game settings

### Real-time preview

The editor embeds a WebGAL engine preview so you can see your work as you write, without switching between the editor and a game window.

- Use "Play to this line" to jump directly to the preview for any statement
- Drag, scale, and rotate character sprites and backgrounds directly in the preview, with parameters automatically written back to the statement
- Zoom and pan the preview freely, or open it in a browser and keep it in sync

### Effects and animation editors

Adjust transforms, filters, and other scene effects with graphical controls, and create keyframe animations.

- Preview keyframe animations frame by frame and adjust them by dragging in the preview
- Save animations as files and edit referenced animations directly within `setAnimation` statements

### Asset management

Browse character sprites, backgrounds, audio, video, and other game assets in one place, ready to use as you create.

- Hover to preview images, audio, and video
- View asset reference counts and automatically update references when renaming or moving assets
- Detect missing or corrupted assets and follow a recovery workflow
- Drag and drop scenes and assets from your system file manager to import them, or drop them directly into the editor to use them

### Engines and templates

Manage WebGAL engines and UI templates to suit each game's version requirements and visual style.

- Download and update official WebGAL engines within WebGAL Craft, with multiple versions installed side by side
- Import third-party engines and templates by dragging and dropping archives
- Assign an engine and template to each game independently, and switch or reset them at any time

### Game settings and export

Go from configuration to publishing without leaving the editor.

- Edit game settings through forms without manually changing configuration files
- Generate game icons for web, desktop, and mobile from a single image with the icon editor
- Export as a web game, or export desktop games for Windows, macOS, and Linux together
- Android package export is coming soon

## Download and installation

Get the latest version for your system from [Releases](https://github.com/A-kirami/webgal-craft/releases).

| Platform | Architecture | Package |
| --- | --- | --- |
| Windows | x64 | `.exe` |
| macOS | Intel / Apple Silicon | `.dmg` |
| Linux | x64 | `.AppImage` / `.deb` |
| Android (tablets) | arm64 | `.apk` |

On first launch, the onboarding guide walks you through installing an engine, creating a game, and getting to know the editor. Keyboard shortcuts are available under "Settings → Help".

> [!IMPORTANT]
> WebGAL Craft requires WebGAL engine version `4.6.2` or later. Download the official engine directly within WebGAL Craft, or get it from [WebGAL Releases](https://github.com/OpenWebGAL/WebGAL/releases) and import it.

## Contributing

Contributions of all kinds are welcome, including bug reports, suggestions, documentation improvements, and code. Read the [contributing guide](./.github/CONTRIBUTING.md) before getting started.

## License

- Code: [MPL-2.0](./LICENSE), © 2026 Akirami
- Logo: CC-BY-NC-ND, Designs by Akirami

## Acknowledgments

Thanks to the [WebGAL](https://github.com/OpenWebGAL/WebGAL) team for developing the visual novel engine.

### Contributors

Thanks to everyone who has contributed to WebGAL Craft:

<a href="https://github.com/A-kirami/webgal-craft/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=A-kirami/webgal-craft" alt="Contributors" />
</a>

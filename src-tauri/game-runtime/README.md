# 导出游戏运行时

此 crate 是独立的 Tauri 2 游戏壳，与编辑器共享 Rust workspace 和依赖锁文件。它读取可执行文件旁的 `webgal-runtime.json`，通过 Tauri 的 `asset` 协议加载 `resources/index.html`，不启动 HTTP 服务器。

`Game_key` 的完整 SHA-256 决定 applicationId 和系统用户数据目录。窗口标题、可执行文件名和安装路径不参与存储身份。Windows/Linux 显式指定 WebView 数据目录，macOS 使用同一标识派生的 WebKit data store identifier（该 API 在 macOS 14 起可用），导出的 macOS bundle identifier 同样必须保持稳定。

资源访问范围只包含游戏的 `resources` 目录。页面只获得退出与窗口全屏两个命令；外部 HTTP(S) 导航与新窗口请求交给系统浏览器，其他协议不允许打开。根元素全屏适配原生窗口并等待状态通知，其他元素保留 WebView 自带的全屏实现。Steam 不在本运行时的能力范围内。

构建与验证：

```sh
cargo build --manifest-path src-tauri/Cargo.toml -p webgal-game-runtime
cargo test --locked --manifest-path src-tauri/Cargo.toml -p webgal-game-runtime
bun run test:browser -- src/features/export/__tests__/game-window-bridge.browser.test.ts
node scripts/verify-game-runtime.mjs
```

最后一项在 Windows 实际启动 WebView2，验证资源范围、Range 响应、JSON 下载与 FileReader、全屏、退出、存储隔离，以及改名和移动后的存档持久化。测试只清理自身创建的临时游戏、下载文件和随机游戏标识对应的数据目录。

## 构建与分发

`bun run dev` 先构建当前宿主目标的游戏运行时，`bun run build` 构建对应 release 版本。单独构建用 `bun run build:game-runtime --target <Rust triple> --release`，产物写入 `src-tauri/resources/game-runtimes/`，不提交二进制。

Build 和 Release 工作流先构建 Windows x64、macOS x64/arm64、Linux x64 四个运行时，再将全部产物内置到每份桌面编辑器发行包。Linux 使用 Ubuntu 22.04 构建以约束 glibc 基线，运行仍需目标系统的 WebKitGTK 4.1。Windows 需要 WebView2 Runtime。Android 不携带这些桌面二进制。本地开发默认只有宿主目标；导出其他目标之前需提供该目标的构建产物，缺失时明确报错。

导出目录内为游戏可执行文件、`webgal-runtime.json` 和完整的 `resources/` 目录；三者必须一起分发。macOS 位于 `.app/Contents/MacOS/`，图标位于 `.app/Contents/Resources/`。资源目录可正常读取和修改，不提供资源加密。开发者发行前仍需在相应系统执行签名、公证与原生验收。

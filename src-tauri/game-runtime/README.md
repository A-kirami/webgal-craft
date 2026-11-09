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

# 导出游戏运行时

此 crate 是独立的 Tauri 2 游戏壳，与编辑器共享 Rust workspace 和依赖锁文件。Windows/Linux 便携版读取可执行文件旁的 `webgal-runtime.json`；macOS 从 `.app/Contents/Resources/` 读取；Linux DEB 从 `/usr/lib/<applicationId>/` 读取。运行时通过 Tauri 的 `asset` 协议加载 `resources/index.html`，不启动 HTTP 服务器。

`Game_key` 的完整 SHA-256 决定 applicationId 和系统用户数据目录。窗口标题、可执行文件名和安装路径不参与存储身份。Windows/Linux 显式指定 WebView 数据目录，macOS 使用同一标识派生的 WebKit data store identifier（该 API 在 macOS 14 起可用），导出的 macOS bundle identifier 同样必须保持稳定。

资源访问范围只包含游戏的 `resources` 目录。页面只获得退出与窗口全屏两个命令；外部 HTTP(S) 导航与新窗口请求交给系统浏览器，其他协议不允许打开。根元素全屏适配原生窗口并等待状态通知，其他元素保留 WebView 自带的全屏实现。Steam 不在本运行时的能力范围内。

构建与验证：

```sh
bun run build:game-runtime
cargo test --locked --manifest-path src-tauri/Cargo.toml -p webgal-game-runtime
bun run test:browser -- src/features/export/__tests__/game-window-bridge.browser.test.ts
node scripts/verify-game-runtime.mjs src-tauri/resources/game-runtimes/webgal-game-runtime-windows-x64.exe
```

最后一项在 Windows 实际启动 WebView2，验证资源范围、Range 响应、JSON 下载与 FileReader、全屏、退出、存储隔离，以及改名和移动后的存档持久化。测试只清理自身创建的临时游戏、下载文件和随机游戏标识对应的数据目录。

## 构建与分发

`bun run dev` 先构建当前宿主目标的游戏运行时，`bun run build` 构建对应 release 版本。单独构建用 `bun run build:game-runtime --target <Rust triple> --release`，产物写入 `src-tauri/resources/game-runtimes/`，不提交二进制。

Build 和 Release 工作流先构建 Windows x64、macOS x64/arm64、Linux x64 四个运行时，再将全部产物内置到每份桌面编辑器发行包。Linux 使用 Ubuntu 22.04 构建以约束 glibc 基线，运行仍需目标系统的 WebKitGTK 4.1。Windows 需要 WebView2 Runtime。Android 不携带这些桌面二进制。本地开发默认只有宿主目标；导出其他目标之前需提供该目标的构建产物，缺失时明确报错。

导出目录内为游戏可执行文件、`webgal-runtime.json` 和完整的 `resources/` 目录；三者必须一起分发。macOS 的可执行文件位于 `.app/Contents/MacOS/`，配置、游戏资源和图标位于 `.app/Contents/Resources/`。资源目录可正常读取和修改，不提供资源加密。开发者发行前仍需在相应系统执行签名、公证与原生验收。

验证真实引擎时可传入已构建的 WebGAL dist：`node scripts/verify-game-runtime.mjs <runtime.exe> <WebGAL dist>`。脚本仅复制该目录到临时游戏，检查引擎加载、localforage 数据重启保留，以及从引擎退出确认弹窗关闭进程，不修改源引擎。

生产构建由脚本显式启用 `custom-protocol`，workspace 测试默认只启用 `desktop`。Clippy 分别检查编辑器和游戏壳，避免 Cargo 合并 Tauri 生产特性后让编辑器的 Rust 检查隐式依赖前端 `dist`。

## 安装包

导出配置区分便携版与安装包。便携版保留跨目标导出；安装包必须在对应操作系统生成：Windows x64 为 `setup.exe`，macOS x64/arm64 为 `game.dmg`，Linux x64 为 `game.deb`。安装包输出在 `<目标>-installer/`，便携版仍在 `<目标>/`，两种格式不会互相覆盖。DMG 是供拖放安装的磁盘映像；DEB 面向 Debian/Ubuntu 系发行版，其他 Linux 发行版使用便携版。

安装包需要发行者和 `major.minor.patch` 版本号，各段必须为 0–65535 的整数且不带前导零。macOS 还要求第一段不超过 9999、后两段不超过 99。这些字段只影响发行信息，`Game_key` 仍是存档和安装身份的唯一来源。

编辑器复用自身可执行文件的工作进程调用固定版本的官方 `tauri-bundler`，终端用户无需 Rust/Node。工作进程独立设置 cwd，使用相对资源模式，支持 Windows 跨盘导出，不改变编辑器 cwd。打包工具放在系统 cache 下的 `webgalcraft/installer-tools/tauri-bundler-2.10.4/`，与编辑器 CLI 工具缓存隔离；进程间文件锁串行访问工具缓存。

Windows 首次打包从官方源下载并校验 NSIS 和 Tauri 插件；失败时明确报错。生成的安装程序按当前用户安装，无需管理员权限；在缺少 WebView2 时使用官方默认的下载引导安装策略，因此该场景要求联网。默认安装位置为 `%LOCALAPPDATA%/Programs/<applicationId>`，与玩家数据目录分离。升级清理旧版本登记的资源和快捷方式，拒绝静默降级，卸载保留玩家数据。NSIS 模板的来源与有限定制见 [模板说明](../installer/README.md)。

macOS 打包依赖宿主系统工具，最低运行系统为 macOS 14；DMG 按系统惯例拖放 `.app` 安装或替换。修改 `.app` 文件名后需要自行移除旧副本；稳定 bundle identifier 保持存档身份。Linux DEB 通过包管理器升级和卸载，声明 GTK/WebKitGTK 4.1 与 xdg-utils 依赖。安装资源与系统用户数据目录分离。

未配置发行证书或公证；发行者需对最终产物完成相应签名与平台验收。Steam 仍明确不支持。

Windows 安装生命周期验收：

```sh
node scripts/verify-game-installer.mjs <release-runtime.exe> [editor.exe]
```

脚本调用真实导出函数生成两版安装程序，验证带空格安装路径、启动与退出、改名和更换发行者后的升级、过时资源清理、拒绝静默降级、卸载后重新安装的存档保留。不传编辑器路径时自动构建 debug 编辑器；传入 release 编辑器可验收生产工作进程。测试使用随机游戏身份和独占临时目录，安装时不创建快捷方式。

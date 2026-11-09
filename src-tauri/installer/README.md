# Game installer templates

`windows.nsi` derives from the official `tauri-bundler` **2.10.4** template at
`crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi` in
[tauri-apps/tauri](https://github.com/tauri-apps/tauri).
The upstream code is dual licensed under MIT or Apache-2.0.

Local policy changes are deliberately confined to:

- Use the bundle identifier derived from `Game_key` for registry identity and the
  default per-user installation directory, independently of title and publisher.
  Install in `%LOCALAPPDATA%/Programs/<identifier>`; player data stays outside it.
- Remove the app-data deletion checkbox and deletion commands. Uninstall only
  removes registered program files, shortcuts, and installer registry entries.
- Run the previous registered uninstaller before copying a replacement, including
  silent/update/reinstall paths. Its file list removes retired resources and old
  shortcuts without recursively deleting unknown files or player data.
- Remove WiX/MSI discovery by title/publisher, old binary/shortcut migrations,
  and the maintenance choice page. All installs replace the previous registered
  version through one path; downgrades are rejected in every mode. Uninstall
  remains available through Windows Settings and the registered uninstaller.
- Recreate shortcuts after replacement, including `/UPDATE`, unless `/NS` was
  explicitly requested. The old uninstaller has already removed old shortcuts.

Retain the rest of the upstream template so refreshes remain small and auditable.
When upgrading `tauri-bundler`, update its exact dependency pin, the versioned
tool-cache directory, and this template together, then run
`node scripts/verify-game-installer.mjs <release-runtime.exe>` on Windows.
The official bundler manages downloads and checksums; no second downloader or
fallback installer implementation is maintained here.

// 此文件由 `bun run generate:protocol` 自动生成。不要手动编辑。

pub const EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL: &str = "webgal-editor-preview-sync.v1";
pub const SESSION_REGISTER_PREVIEW_TYPE: &str = "session.register-preview";

pub const PREVIEW_COMMAND_TYPES: [&str; 8] = [
    "preview.command.sync-scene",
    "preview.command.run-scene-content",
    "preview.command.run-snippet",
    "preview.command.reload-templates",
    "preview.command.set-effect",
    "preview.command.set-component-visibility",
    "preview.command.set-font-optimization",
    "preview.command.set-text-read-mode",
];

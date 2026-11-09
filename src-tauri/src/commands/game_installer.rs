use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

use tauri_bundler::{
    bundle_project, AppCategory, BundleBinary, BundleSettings, DebianSettings, MacOsSettings,
    NsisSettings, PackageSettings, PackageType, SettingsBuilder, WindowsSettings,
};
use webgal_game_runtime::{GameConfig, CONFIG_FILE, RESOURCE_DIRECTORY};

use super::{export::export_error, AppResult};

const WORKER_ARGUMENT: &str = "--webgalcraft-build-game-installer";

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct BuildRequest {
    os: String,
    arch: String,
    game: GameConfig,
    version: String,
    publisher: String,
}

struct WorkerLogger;
impl log::Log for WorkerLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.level() <= log::Level::Info
    }
    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) {
            eprintln!("{}", record.args());
        }
    }
    fn flush(&self) {}
}

pub(crate) fn run_worker_if_requested() -> Option<AppResult<()>> {
    if std::env::args_os().nth(1).as_deref() != Some(std::ffi::OsStr::new(WORKER_ARGUMENT)) {
        return None;
    }
    log::set_logger(&WorkerLogger).expect("fresh installer worker logger");
    log::set_max_level(log::LevelFilter::Info);
    Some((|| {
        let request: BuildRequest = serde_json::from_reader(std::io::stdin().lock())
            .map_err(|error| export_error(format!("安装包请求无效: {error}")))?;
        validate(
            &request.os,
            &request.arch,
            &request.version,
            &request.publisher,
        )?;
        request.game.validate()?;
        build_in_worker(&request)
    })())
}

pub(super) fn validate(os: &str, arch: &str, version: &str, publisher: &str) -> AppResult<()> {
    if os != std::env::consts::OS
        || !matches!(
            (os, arch),
            ("windows" | "linux" | "macos", "x64") | ("macos", "arm64")
        )
    {
        return Err(export_error("安装包必须在对应的桌面操作系统上生成"));
    }
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() != 3
        || parts.iter().any(|part| {
            part.is_empty()
                || (part.len() > 1 && part.starts_with('0'))
                || !part.bytes().all(|byte| byte.is_ascii_digit())
                || part.parse::<u16>().is_err()
        })
    {
        return Err(export_error(
            "安装包版本必须为 major.minor.patch，每段为 0–65535 的整数",
        ));
    }
    if os == "macos"
        && (parts[0].parse::<u16>().unwrap() > 9999
            || parts[1].parse::<u16>().unwrap() > 99
            || parts[2].parse::<u16>().unwrap() > 99)
    {
        return Err(export_error(
            "macOS 版本号第一段不能超过 9999，后两段不能超过 99",
        ));
    }
    if publisher.trim().is_empty() || publisher.chars().any(char::is_control) {
        return Err(export_error("发行者不能为空或包含控制字符"));
    }
    Ok(())
}

pub(super) fn build(
    portable: &Path,
    os: &str,
    arch: &str,
    game: &GameConfig,
    version: &str,
    publisher: &str,
) -> AppResult<()> {
    #[cfg(not(test))]
    let executable = std::env::current_exe()?;
    #[cfg(test)]
    let executable = std::env::var_os("WEBGAL_INSTALLER_SMOKE_PACKAGER")
        .expect("installer smoke test must supply the built editor executable");
    let mut command = Command::new(executable);
    // Tauri resource patterns are relative to cwd. Isolate that contract in a worker,
    // so exports on another drive never change the editor's process-global cwd.
    command
        .arg(WORKER_ARGUMENT)
        .current_dir(portable)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let request = BuildRequest {
        os: os.into(),
        arch: arch.into(),
        game: game.clone(),
        version: version.into(),
        publisher: publisher.into(),
    };
    let bytes = serde_json::to_vec(&request).map_err(|error| export_error(error.to_string()))?;
    let mut worker = command.spawn()?;
    let write_result = worker
        .stdin
        .take()
        .expect("piped worker stdin")
        .write_all(&bytes);
    let result = worker.wait_with_output()?;
    write_result?;
    if !result.status.success() {
        return Err(export_error(format!(
            "生成安装包失败: {}",
            String::from_utf8_lossy(&result.stderr)
        )));
    }
    Ok(())
}

fn build_in_worker(request: &BuildRequest) -> AppResult<()> {
    let BuildRequest {
        os,
        arch,
        game,
        version,
        publisher,
    } = request;
    let os = os.as_str();
    let arch = arch.as_str();
    let portable = Path::new(".");
    let output = Path::new("../next");
    // Do not let this bundler replace tools used by another Tauri CLI version.
    let tools = dirs::cache_dir()
        .ok_or_else(|| export_error("无法定位安装包工具缓存目录"))?
        .join("webgalcraft/installer-tools/tauri-bundler-2.10.4");
    fs::create_dir_all(&tools)?;
    let cache_lock = fs::File::create(tools.join("build.lock"))?;
    cache_lock.lock()?;
    let (package_type, target, filename) = match (os, arch) {
        ("windows", "x64") => (PackageType::Nsis, "x86_64-pc-windows-msvc", "setup.exe"),
        ("linux", "x64") => (PackageType::Deb, "x86_64-unknown-linux-gnu", "game.deb"),
        ("macos", "x64") => (PackageType::Dmg, "x86_64-apple-darwin", "game.dmg"),
        ("macos", "arm64") => (PackageType::Dmg, "aarch64-apple-darwin", "game.dmg"),
        _ => unreachable!("validated installer target"),
    };
    let identity = game.application_id();
    let stem = super::export::sanitize_desktop_name(&game.title);
    let app = portable.join(format!("{stem}.app/Contents"));
    let source_root = if os == "macos" {
        app.join("Resources")
    } else {
        portable.to_path_buf()
    };
    let source_binary = if os == "macos" {
        app.join("MacOS").join(&stem)
    } else {
        portable.join(format!(
            "{stem}{}",
            if os == "windows" { ".exe" } else { "" }
        ))
    };
    // Linux package/resource paths and Windows executable names must survive title changes.
    let binary_name = if os == "macos" {
        stem.clone()
    } else {
        identity.clone()
    };
    let binary = portable.join(format!(
        "{binary_name}{}",
        if os == "windows" { ".exe" } else { "" }
    ));
    if source_binary != binary {
        fs::rename(source_binary, &binary)?;
    }
    let resources = HashMap::from([
        (
            source_root.join(CONFIG_FILE).to_string_lossy().into_owned(),
            CONFIG_FILE.into(),
        ),
        (
            source_root
                .join(RESOURCE_DIRECTORY)
                .to_string_lossy()
                .into_owned(),
            RESOURCE_DIRECTORY.into(),
        ),
    ]);
    let icon = source_root.join("resources/icon.png");
    let mut icons = Vec::new();
    let mut installer_icon = None;
    if icon.is_file() {
        icons.push(icon.to_string_lossy().into_owned());
        if os == "windows" {
            let ico = portable.join("installer.ico");
            image::open(&icon)
                .map_err(|error| export_error(error.to_string()))?
                .resize(256, 256, image::imageops::FilterType::Lanczos3)
                .save_with_format(&ico, image::ImageFormat::Ico)
                .map_err(|error| export_error(error.to_string()))?;
            icons.push(ico.to_string_lossy().into_owned());
            installer_icon = Some(ico);
        }
    }
    if os == "macos" && app.join("Resources/icon.icns").is_file() {
        icons.push(
            app.join("Resources/icon.icns")
                .to_string_lossy()
                .into_owned(),
        );
    }
    let nsis = if os == "windows" {
        let template = portable.join("installer.nsi");
        fs::write(&template, include_str!("../../installer/windows.nsi"))?;
        Some(NsisSettings {
            installer_icon: installer_icon.clone(),
            uninstaller_icon: installer_icon,
            template: Some(template),
            languages: Some(vec![
                "English".into(),
                "SimpChinese".into(),
                "TradChinese".into(),
                "Japanese".into(),
            ]),
            ..Default::default()
        })
    } else {
        None
    };
    let (desktop_template, desktop_title) = if os == "linux" {
        let desktop = portable.join("game.desktop");
        // Keep untrusted title text in a template value, never in template source.
        fs::write(&desktop, "[Desktop Entry]\nType=Application\nName={{long_description}}\nExec={{exec}}\nIcon={{icon}}\nCategories=Game;\nTerminal=false\n")?;
        let title = game
            .title
            .replace('\\', "\\\\")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t");
        (Some(desktop), Some(title))
    } else {
        (None, None)
    };
    let settings = SettingsBuilder::new()
        .project_out_directory(std::env::current_dir()?)
        .local_tools_directory(tools)
        .target(target.into())
        .package_types(vec![package_type])
        .package_settings(PackageSettings {
            product_name: if os == "linux" {
                identity.clone()
            } else {
                stem
            },
            version: version.into(),
            description: game.title.clone(),
            authors: Some(vec![publisher.into()]),
            homepage: None,
            default_run: None,
        })
        .bundle_settings(BundleSettings {
            identifier: Some(identity),
            publisher: Some(publisher.into()),
            category: Some(AppCategory::Game),
            icon: Some(icons),
            resources_map: Some(resources),
            long_description: desktop_title,
            windows: WindowsSettings {
                allow_downgrades: false,
                nsis,
                ..Default::default()
            },
            deb: DebianSettings {
                depends: Some(vec![
                    "libwebkit2gtk-4.1-0".into(),
                    "libgtk-3-0".into(),
                    "xdg-utils".into(),
                ]),
                section: Some("games".into()),
                desktop_template,
                ..Default::default()
            },
            macos: MacOsSettings {
                minimum_system_version: Some("14.0".into()),
                ..Default::default()
            },
            ..Default::default()
        })
        .binaries(vec![BundleBinary::new(binary_name, true)])
        .log_level(log::Level::Info)
        .build()
        .map_err(|error| export_error(format!("安装包配置无效: {error}")))?;
    let bundles = bundle_project(&settings)
        .map_err(|error| export_error(format!("生成安装包失败: {error}")))?;
    let artifact = bundles
        .iter()
        .find(|bundle| bundle.package_type == package_type)
        .and_then(|bundle| bundle.bundle_paths.first())
        .ok_or_else(|| export_error("打包工具未生成安装包"))?;
    fs::create_dir(output)?;
    // Publish a stable filename inside a separate atomic export directory.
    fs::copy(artifact, output.join(filename))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_metadata_and_cross_os_installers() {
        for version in ["", "1.0", "01.0.0", "1.0.0-beta", "65536.0.0", "1.+2.3"] {
            assert!(validate(std::env::consts::OS, "x64", version, "Studio").is_err());
        }
        assert!(validate(std::env::consts::OS, "x64", "1.2.3", "Studio").is_ok());
        assert!(validate(std::env::consts::OS, "x64", "1.2.3", " ").is_err());
        assert!(validate(std::env::consts::OS, "x64", "1.2.3", "Studio\nInjected").is_err());
        let other = if cfg!(windows) { "macos" } else { "windows" };
        assert!(validate(other, "x64", "1.2.3", "Studio").is_err());
    }
}

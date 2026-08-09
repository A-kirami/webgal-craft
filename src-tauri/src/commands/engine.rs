use std::{
    collections::HashMap,
    fs::{self, File},
    io,
    path::{Path, PathBuf},
    time::Duration,
};

use futures_util::StreamExt;
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;
use tokio::{fs as tokio_fs, io::AsyncWriteExt};
use zip::ZipArchive;

use super::{AppError, AppResult};

/// 支持的 manifest schemaVersion 主版本号。
/// 超出此主版本视为破坏性变更，导入流程应拒绝并提示用户升级宿主。
const SUPPORTED_SCHEMA_MAJOR: u32 = 1;
const OFFICIAL_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/OpenWebGAL/WebGAL/releases/latest";
const OFFICIAL_RELEASES_API: &str =
    "https://api.github.com/repos/OpenWebGAL/WebGAL/releases?per_page=100";
const OFFICIAL_ENGINE_ID: &str = "open-webgal.webgal";
const OFFICIAL_ENGINE_NAME: &str = "WebGAL";
const MAX_OFFICIAL_ENGINE_BYTES: u64 = 200 * 1024 * 1024;
const MAX_OFFICIAL_ENGINE_ENTRIES: usize = 100_000;
const MAX_OFFICIAL_ENGINE_UNCOMPRESSED_BYTES: u64 = 1024 * 1024 * 1024;
const OFFICIAL_ENGINE_NETWORK_TIMEOUT: Duration = Duration::from_secs(30);
const OFFICIAL_GITHUB_HOST: &str = "github.com";
const OFFICIAL_GITHUB_PATH_PREFIX: &str = "/OpenWebGAL/WebGAL/releases/";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EngineManifest {
    pub schema_version: String,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(rename = "type")]
    pub engine_type: String,
    pub webgal_version: String,
    pub description: Option<String>,
    pub descriptions: Option<HashMap<String, String>>,
    #[serde(default, deserialize_with = "deserialize_maintainer")]
    pub maintainer: Option<String>,
    pub license: Option<String>,
    pub icon: Option<String>,
    pub urls: Option<HashMap<String, String>>,
    pub live2d_support: Option<bool>,
    pub spine_support: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ManifestMaintainer {
    Text(String),
    Object { name: Option<String> },
}

fn deserialize_maintainer<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(
        match Option::<ManifestMaintainer>::deserialize(deserializer)? {
            Some(ManifestMaintainer::Text(text)) => Some(text),
            Some(ManifestMaintainer::Object { name }) => name,
            None => None,
        },
    )
}

impl EngineManifest {
    fn has_required_fields(&self) -> bool {
        !self.schema_version.is_empty()
            && !self.id.is_empty()
            && !self.name.is_empty()
            && !self.version.is_empty()
            && !self.engine_type.is_empty()
            && !self.webgal_version.is_empty()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialEngineRelease {
    pub asset_name: String,
    pub asset_url: String,
    pub engine_id: String,
    pub name: String,
    pub release_url: String,
    pub sha256: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    assets: Vec<GithubReleaseAsset>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

#[derive(Debug, Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialEngineDownloadProgress {
    pub downloaded_bytes: u64,
    pub entry: Option<String>,
    pub extracted_files: Option<usize>,
    pub phase: String,
    pub total_bytes: Option<u64>,
}

fn parse_official_release(release: GithubRelease) -> AppResult<OfficialEngineRelease> {
    let tag_name = release.tag_name.trim();
    let version = tag_name
        .strip_prefix('v')
        .unwrap_or(tag_name)
        .trim()
        .to_owned();
    if version.is_empty() {
        return Err(AppError::Server("官方引擎版本号为空".into()));
    }

    let expected_asset_name = format!("WebGAL-{version}-web.zip");
    let asset = release
        .assets
        .into_iter()
        .find(|asset| asset.name == expected_asset_name)
        .ok_or_else(|| AppError::Server(format!("官方版本缺少引擎资产: {expected_asset_name}")))?;
    let asset_url = parse_official_github_url(
        &asset.browser_download_url,
        &format!("/OpenWebGAL/WebGAL/releases/download/{tag_name}/{expected_asset_name}"),
        "官方引擎资产地址",
    )?;
    let release_url = parse_official_github_url(
        &release.html_url,
        OFFICIAL_GITHUB_PATH_PREFIX,
        "官方引擎发布页地址",
    )?;
    let sha256 = asset
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .filter(|digest| digest.len() == 64 && digest.chars().all(|char| char.is_ascii_hexdigit()))
        .ok_or_else(|| AppError::Server("官方引擎资产缺少有效的 SHA-256 摘要".into()))?
        .to_ascii_lowercase();

    Ok(OfficialEngineRelease {
        asset_name: asset.name,
        asset_url,
        engine_id: OFFICIAL_ENGINE_ID.into(),
        name: OFFICIAL_ENGINE_NAME.into(),
        release_url,
        sha256,
        version,
    })
}

fn parse_official_github_url(raw_url: &str, expected_path: &str, label: &str) -> AppResult<String> {
    let url = reqwest::Url::parse(raw_url)
        .map_err(|error| AppError::Server(format!("{label}无效: {error}")))?;
    let path_matches = if expected_path.ends_with('/') {
        url.path().starts_with(expected_path)
    } else {
        url.path() == expected_path
    };
    if url.scheme() != "https"
        || url.host_str() != Some(OFFICIAL_GITHUB_HOST)
        || !path_matches
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::Server(format!("{label}不是官方 WebGAL 发布地址")));
    }
    Ok(url.to_string())
}

fn resolve_official_asset_url(
    release: &OfficialEngineRelease,
    proxy_prefix: Option<&str>,
) -> AppResult<String> {
    let Some(raw_prefix) = proxy_prefix
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(release.asset_url.clone());
    };
    let prefix_url = reqwest::Url::parse(raw_prefix)
        .map_err(|error| AppError::Server(format!("官方引擎下载代理地址无效: {error}")))?;
    if prefix_url.scheme() != "https"
        || prefix_url.host_str().is_none()
        || !prefix_url.username().is_empty()
        || prefix_url.password().is_some()
        || prefix_url.query().is_some()
        || prefix_url.fragment().is_some()
    {
        return Err(AppError::Server(
            "官方引擎下载代理必须是无凭据的 HTTPS 地址".into(),
        ));
    }

    let prefix = if raw_prefix.ends_with('/') {
        raw_prefix.to_owned()
    } else {
        format!("{raw_prefix}/")
    };
    let proxied_url = format!("{prefix}{}", release.asset_url);
    let parsed_url = reqwest::Url::parse(&proxied_url)
        .map_err(|error| AppError::Server(format!("官方引擎代理下载地址无效: {error}")))?;
    if parsed_url.scheme() != "https" || parsed_url.host_str().is_none() {
        return Err(AppError::Server(
            "官方引擎代理下载地址必须使用 HTTPS".into(),
        ));
    }
    Ok(proxied_url)
}

async fn request_official_release_endpoint(endpoint: &str) -> AppResult<reqwest::Response> {
    let client = reqwest::Client::builder()
        .user_agent("WebGALCraft engine manager")
        .timeout(OFFICIAL_ENGINE_NETWORK_TIMEOUT)
        .build()
        .map_err(|error| AppError::Server(format!("无法初始化官方引擎服务: {error}")))?;
    let response = client
        .get(endpoint)
        .send()
        .await
        .map_err(|error| AppError::Server(format!("无法获取官方引擎版本: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::Server(format!(
            "官方引擎版本服务返回 HTTP {}",
            response.status()
        )));
    }
    Ok(response)
}

async fn fetch_official_releases() -> AppResult<Vec<OfficialEngineRelease>> {
    let releases = request_official_release_endpoint(OFFICIAL_RELEASES_API)
        .await?
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| AppError::Server(format!("官方引擎版本信息无效: {error}")))?;
    let releases = releases
        .into_iter()
        .filter(|release| !release.draft && !release.prerelease)
        .filter_map(|release| parse_official_release(release).ok())
        .collect::<Vec<_>>();
    if releases.is_empty() {
        return Err(AppError::Server("官方引擎版本列表为空".into()));
    }
    Ok(releases)
}

async fn fetch_latest_official_release() -> AppResult<OfficialEngineRelease> {
    let release = request_official_release_endpoint(OFFICIAL_LATEST_RELEASE_API)
        .await?
        .json::<GithubRelease>()
        .await
        .map_err(|error| AppError::Server(format!("官方引擎版本信息无效: {error}")))?;
    if release.draft || release.prerelease {
        return Err(AppError::Server("官方最新引擎版本不是稳定发布".into()));
    }
    parse_official_release(release)
}

async fn fetch_official_release(version: &str) -> AppResult<OfficialEngineRelease> {
    fetch_official_releases()
        .await?
        .into_iter()
        .find(|release| release.version == version)
        .ok_or_else(|| AppError::Server(format!("未找到官方引擎版本: {version}")))
}

fn emit_download_progress(
    on_progress: &Channel<OfficialEngineDownloadProgress>,
    phase: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    entry: Option<String>,
    extracted_files: Option<usize>,
) {
    let _ = on_progress.send(OfficialEngineDownloadProgress {
        downloaded_bytes,
        entry,
        extracted_files,
        phase: phase.into(),
        total_bytes,
    });
}

fn extract_archive(
    archive_path: &Path,
    destination: &Path,
    on_progress: &Channel<OfficialEngineDownloadProgress>,
) -> AppResult<()> {
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| AppError::Server(format!("官方引擎压缩包无法读取: {error}")))?;
    if archive.len() > MAX_OFFICIAL_ENGINE_ENTRIES {
        return Err(AppError::Server("官方引擎压缩包包含过多文件".into()));
    }
    let payload = destination.join(".payload");
    fs::create_dir_all(&payload)?;
    let mut extracted_bytes = 0u64;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| AppError::Server(format!("官方引擎压缩包条目无效: {error}")))?;
        let enclosed_name = entry
            .enclosed_name()
            .ok_or_else(|| AppError::Server("官方引擎压缩包包含不安全路径".into()))?
            .to_owned();
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(AppError::Server(
                "官方引擎压缩包包含不支持的符号链接".into(),
            ));
        }
        extracted_bytes = extracted_bytes
            .checked_add(entry.size())
            .filter(|size| *size <= MAX_OFFICIAL_ENGINE_UNCOMPRESSED_BYTES)
            .ok_or_else(|| AppError::Server("官方引擎解压内容超过允许大小".into()))?;

        let output_path = payload.join(&enclosed_name);
        if entry.is_dir() {
            fs::create_dir_all(&output_path)?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = File::create(&output_path)?;
            io::copy(&mut entry, &mut output)?;
        }
        emit_download_progress(
            on_progress,
            "extracting",
            0,
            None,
            Some(enclosed_name.to_string_lossy().into_owned()),
            Some(index + 1),
        );
    }

    flatten_archive_root(&payload, destination)
}

fn flatten_archive_root(payload: &Path, destination: &Path) -> AppResult<()> {
    let root = if payload.join("index.html").is_file() {
        payload.to_owned()
    } else {
        let children = fs::read_dir(payload)?.collect::<Result<Vec<_>, _>>()?;
        if children.len() != 1 || !children[0].file_type()?.is_dir() {
            return Err(AppError::Server(
                "官方引擎压缩包缺少有效的引擎根目录".into(),
            ));
        }
        children[0].path()
    };

    if !root.join("game").join("config.txt").is_file() {
        return Err(AppError::Server(
            "官方引擎压缩包缺少 game/config.txt".into(),
        ));
    }

    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if target.exists() {
            return Err(AppError::Server("官方引擎解压目标出现路径冲突".into()));
        }
        fs::rename(entry.path(), target)?;
    }
    fs::remove_dir_all(payload)?;
    Ok(())
}

async fn download_official_engine_inner(
    release: &OfficialEngineRelease,
    asset_url: &str,
    destination: &Path,
    on_progress: &Channel<OfficialEngineDownloadProgress>,
) -> AppResult<()> {
    if destination.exists() {
        return Err(AppError::TargetConflict(destination.display().to_string()));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::create_dir_all(destination)?;
    let archive_path = destination.join(".engine-download.zip");
    let result =
        download_official_engine_into(release, asset_url, destination, &archive_path, on_progress)
            .await;
    if result.is_err() {
        let _ = fs::remove_dir_all(destination);
    }
    result
}

async fn download_official_engine_into(
    release: &OfficialEngineRelease,
    asset_url: &str,
    destination: &Path,
    archive_path: &Path,
    on_progress: &Channel<OfficialEngineDownloadProgress>,
) -> AppResult<()> {
    let client = reqwest::Client::builder()
        .user_agent("WebGALCraft engine manager")
        .connect_timeout(OFFICIAL_ENGINE_NETWORK_TIMEOUT)
        .read_timeout(OFFICIAL_ENGINE_NETWORK_TIMEOUT)
        .build()
        .map_err(|error| AppError::Server(format!("无法初始化官方引擎下载: {error}")))?;
    let response = client
        .get(asset_url)
        .send()
        .await
        .map_err(|error| AppError::Server(format!("官方引擎下载失败: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::Server(format!(
            "官方引擎下载返回 HTTP {}",
            response.status()
        )));
    }
    let total_bytes = response.content_length();
    if total_bytes.is_some_and(|size| size > MAX_OFFICIAL_ENGINE_BYTES) {
        return Err(AppError::Server("官方引擎压缩包超过允许大小".into()));
    }

    let mut output = tokio_fs::File::create(&archive_path).await?;
    let mut stream = response.bytes_stream();
    let mut downloaded_bytes = 0u64;
    let mut hasher = Sha256::new();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|error| AppError::Server(format!("官方引擎下载中断: {error}")))?;
        downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
        if downloaded_bytes > MAX_OFFICIAL_ENGINE_BYTES {
            return Err(AppError::Server("官方引擎压缩包超过允许大小".into()));
        }
        hasher.update(&chunk);
        output.write_all(&chunk).await?;
        emit_download_progress(
            on_progress,
            "downloading",
            downloaded_bytes,
            total_bytes,
            None,
            None,
        );
    }
    output.flush().await?;
    let actual_sha256 = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual_sha256 != release.sha256 {
        return Err(AppError::Server(
            "官方引擎校验失败，文件可能已被篡改".into(),
        ));
    }

    let result = extract_archive(archive_path, destination, on_progress);
    let _ = fs::remove_file(archive_path);
    result
}

#[tauri::command]
pub async fn get_official_engine_releases() -> AppResult<Vec<OfficialEngineRelease>> {
    fetch_official_releases().await
}

#[tauri::command]
pub async fn get_latest_official_engine_release() -> AppResult<OfficialEngineRelease> {
    fetch_latest_official_release().await
}

#[tauri::command]
pub async fn download_official_engine(
    version: String,
    destination: String,
    on_progress: Channel<OfficialEngineDownloadProgress>,
    proxy_prefix: Option<String>,
) -> AppResult<OfficialEngineRelease> {
    let release = fetch_official_release(&version).await?;

    let destination_path = PathBuf::from(&destination);
    let download_url = resolve_official_asset_url(&release, proxy_prefix.as_deref())?;
    download_official_engine_inner(&release, &download_url, &destination_path, &on_progress)
        .await
        .map(|()| release)
}

/// 解析 schemaVersion 的主版本号。
/// 接受 `MAJOR`、`MAJOR.MINOR`、`MAJOR.MINOR.PATCH` 等格式，
/// 仅取第一段并要求其为非负整数。
fn parse_schema_major(schema_version: &str) -> Option<u32> {
    schema_version.split('.').next()?.parse::<u32>().ok()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum EngineManifestResult {
    #[serde(rename = "ok")]
    Ok { manifest: Box<EngineManifest> },
    #[serde(rename = "missing")]
    Missing,
    #[serde(rename = "invalid", rename_all = "camelCase")]
    Invalid { reason: String },
    #[serde(rename = "unsupportedSchema", rename_all = "camelCase")]
    UnsupportedSchema {
        schema_version: String,
        supported_major: u32,
    },
}

#[tauri::command]
pub async fn read_engine_manifest(engine_path: String) -> AppResult<EngineManifestResult> {
    let manifest_path = Path::new(&engine_path).join("webgal-engine.json");

    if !manifest_path.is_file() {
        return Ok(EngineManifestResult::Missing);
    }

    let content = tokio::fs::read_to_string(&manifest_path).await?;
    let manifest = match serde_json::from_str::<EngineManifest>(&content) {
        Ok(m) => m,
        Err(e) => {
            return Ok(EngineManifestResult::Invalid {
                reason: format!("解析失败: {e}"),
            });
        }
    };

    if !manifest.has_required_fields() {
        return Ok(EngineManifestResult::Invalid {
            reason: "缺少必填字段".to_owned(),
        });
    }

    match parse_schema_major(&manifest.schema_version) {
        Some(major) if major == SUPPORTED_SCHEMA_MAJOR => Ok(EngineManifestResult::Ok {
            manifest: Box::new(manifest),
        }),
        Some(_) => Ok(EngineManifestResult::UnsupportedSchema {
            schema_version: manifest.schema_version,
            supported_major: SUPPORTED_SCHEMA_MAJOR,
        }),
        None => Ok(EngineManifestResult::Invalid {
            reason: format!("schemaVersion 格式无效: {}", manifest.schema_version),
        }),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        parse_official_release, parse_schema_major, resolve_official_asset_url, EngineManifest,
        EngineManifestResult, GithubRelease, GithubReleaseAsset, OfficialEngineRelease,
    };

    fn official_release_for_url_tests() -> OfficialEngineRelease {
        OfficialEngineRelease {
            asset_name: "WebGAL-4.6.4-web.zip".into(),
            asset_url:
                "https://github.com/OpenWebGAL/WebGAL/releases/download/4.6.4/WebGAL-4.6.4-web.zip"
                    .into(),
            engine_id: "open-webgal.webgal".into(),
            name: "WebGAL".into(),
            release_url: "https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.4".into(),
            sha256: "a".repeat(64),
            version: "4.6.4".into(),
        }
    }

    #[test]
    fn parses_manifest_with_string_maintainer() {
        let manifest: EngineManifest = serde_json::from_str(
            r#"{
              "schemaVersion":"1.0.0",
              "id":"open-webgal.webgal",
              "name":"WebGAL",
              "version":"4.5.0",
              "type":"official",
              "webgalVersion":"4.5.0",
              "maintainer":"MakinoharaShoko"
            }"#,
        )
        .expect("manifest should parse");

        assert_eq!(manifest.maintainer.as_deref(), Some("MakinoharaShoko"));
    }

    #[test]
    fn parses_manifest_with_object_maintainer() {
        let manifest: EngineManifest = serde_json::from_str(
            r#"{
              "schemaVersion":"1.0.0",
              "id":"open-webgal.webgal",
              "name":"WebGAL",
              "version":"4.5.0",
              "type":"official",
              "webgalVersion":"4.5.0",
              "maintainer":{"name":"MakinoharaShoko","email":"demo@example.com"}
            }"#,
        )
        .expect("manifest should parse");

        assert_eq!(manifest.maintainer.as_deref(), Some("MakinoharaShoko"));
    }

    #[test]
    fn parse_schema_major_accepts_common_formats() {
        assert_eq!(parse_schema_major("1"), Some(1));
        assert_eq!(parse_schema_major("1.0"), Some(1));
        assert_eq!(parse_schema_major("1.2.3"), Some(1));
        assert_eq!(parse_schema_major("2.0.0"), Some(2));
        assert_eq!(parse_schema_major("v1.0.0"), None);
        assert_eq!(parse_schema_major(""), None);
        assert_eq!(parse_schema_major("abc"), None);
    }

    #[test]
    fn engine_manifest_result_ok_serializes_with_status_tag() {
        let manifest: EngineManifest = serde_json::from_str(
            r#"{
              "schemaVersion":"1.0.0",
              "id":"open-webgal.webgal",
              "name":"WebGAL",
              "version":"4.5.0",
              "type":"official",
              "webgalVersion":"4.5.0"
            }"#,
        )
        .expect("manifest should parse");

        let serialized = serde_json::to_value(EngineManifestResult::Ok {
            manifest: Box::new(manifest),
        })
        .expect("ok variant should serialize");
        assert_eq!(serialized["status"], json!("ok"));
        assert_eq!(serialized["manifest"]["schemaVersion"], json!("1.0.0"));
    }

    #[test]
    fn engine_manifest_result_unsupported_schema_serializes_with_camel_case_fields() {
        let serialized = serde_json::to_value(EngineManifestResult::UnsupportedSchema {
            schema_version: "2.0.0".to_owned(),
            supported_major: 1,
        })
        .expect("unsupported variant should serialize");

        assert_eq!(
            serialized,
            json!({
                "status": "unsupportedSchema",
                "schemaVersion": "2.0.0",
                "supportedMajor": 1,
            })
        );
    }

    #[test]
    fn engine_manifest_result_invalid_serializes_reason() {
        let serialized = serde_json::to_value(EngineManifestResult::Invalid {
            reason: "缺少必填字段".to_owned(),
        })
        .expect("invalid variant should serialize");

        assert_eq!(
            serialized,
            json!({
                "status": "invalid",
                "reason": "缺少必填字段",
            })
        );
    }

    #[test]
    fn engine_manifest_result_missing_serializes_status_only() {
        let serialized = serde_json::to_value(EngineManifestResult::Missing)
            .expect("missing variant should serialize");

        assert_eq!(serialized, json!({ "status": "missing" }));
    }

    #[test]
    fn parses_official_release_asset_and_normalizes_version() {
        let release = parse_official_release(GithubRelease {
            tag_name: "v4.6.4".into(),
            html_url: "https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.4".into(),
            draft: false,
            prerelease: false,
            assets: vec![GithubReleaseAsset {
                name: "WebGAL-4.6.4-web.zip".into(),
                browser_download_url:
                    "https://github.com/OpenWebGAL/WebGAL/releases/download/v4.6.4/WebGAL-4.6.4-web.zip"
                        .into(),
                digest: Some(format!("sha256:{}", "a".repeat(64))),
            }],
        })
        .expect("official release should parse");

        assert_eq!(release.version, "4.6.4");
        assert_eq!(release.engine_id, "open-webgal.webgal");
        assert_eq!(release.sha256, "a".repeat(64));
    }

    #[test]
    fn rejects_official_release_without_matching_asset_or_digest() {
        let error = parse_official_release(GithubRelease {
            tag_name: "4.6.4".into(),
            html_url: "https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.4".into(),
            draft: false,
            prerelease: false,
            assets: vec![GithubReleaseAsset {
                name: "source.zip".into(),
                browser_download_url: "https://example.com/source.zip".into(),
                digest: Some(format!("sha256:{}", "a".repeat(64))),
            }],
        })
        .expect_err("release without the official asset should be rejected");
        assert!(error.to_string().contains("缺少引擎资产"));

        let error = parse_official_release(GithubRelease {
            tag_name: "4.6.4".into(),
            html_url: "https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.4".into(),
            draft: false,
            prerelease: false,
            assets: vec![GithubReleaseAsset {
                name: "WebGAL-4.6.4-web.zip".into(),
                browser_download_url:
                    "https://github.com/OpenWebGAL/WebGAL/releases/download/4.6.4/WebGAL-4.6.4-web.zip"
                        .into(),
                digest: None,
            }],
        })
        .expect_err("release without a digest should be rejected");
        assert!(error.to_string().contains("SHA-256"));
    }

    #[test]
    fn rejects_official_release_with_external_asset_url() {
        let error = parse_official_release(GithubRelease {
            tag_name: "4.6.4".into(),
            html_url: "https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.4".into(),
            draft: false,
            prerelease: false,
            assets: vec![GithubReleaseAsset {
                name: "WebGAL-4.6.4-web.zip".into(),
                browser_download_url: "https://example.com/WebGAL-4.6.4-web.zip".into(),
                digest: Some(format!("sha256:{}", "a".repeat(64))),
            }],
        })
        .expect_err("external asset URLs should be rejected");
        assert!(error.to_string().contains("官方 WebGAL 发布地址"));
    }

    #[test]
    fn resolves_official_asset_url_through_an_https_proxy_prefix() {
        let release = official_release_for_url_tests();

        assert_eq!(
            resolve_official_asset_url(&release, Some("https://proxy.example/"))
                .expect("proxy URL should be accepted"),
            "https://proxy.example/https://github.com/OpenWebGAL/WebGAL/releases/download/4.6.4/WebGAL-4.6.4-web.zip"
        );
        assert_eq!(
            resolve_official_asset_url(&release, Some("https://proxy.example"))
                .expect("proxy URL without a trailing slash should be accepted"),
            "https://proxy.example/https://github.com/OpenWebGAL/WebGAL/releases/download/4.6.4/WebGAL-4.6.4-web.zip"
        );
    }

    #[test]
    fn rejects_insecure_or_credentialed_official_asset_proxy_urls() {
        let release = official_release_for_url_tests();

        for proxy in [
            "http://proxy.example/",
            "https://user:password@proxy.example/",
            "https://proxy.example/?token=secret",
        ] {
            let error = resolve_official_asset_url(&release, Some(proxy))
                .expect_err("unsafe proxy URL should be rejected");
            assert!(error.to_string().contains("HTTPS"));
        }
    }
}

use std::{collections::HashMap, path::Path};

use serde::{Deserialize, Deserializer, Serialize};

use super::AppResult;

/// 支持的 manifest schemaVersion 主版本号。
/// 超出此主版本视为破坏性变更，导入流程应拒绝并提示用户升级宿主。
const SUPPORTED_SCHEMA_MAJOR: u32 = 1;

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
            log::error!("引擎清单解析失败 {}: {e}", manifest_path.display());
            return Ok(EngineManifestResult::Invalid {
                reason: format!("解析失败: {e}"),
            });
        }
    };

    if !manifest.has_required_fields() {
        log::error!("引擎清单缺少必填字段: {}", manifest_path.display());
        return Ok(EngineManifestResult::Invalid {
            reason: "缺少必填字段".to_owned(),
        });
    }

    match parse_schema_major(&manifest.schema_version) {
        Some(major) if major == SUPPORTED_SCHEMA_MAJOR => Ok(EngineManifestResult::Ok {
            manifest: Box::new(manifest),
        }),
        Some(major) => {
            log::error!(
                "引擎清单 schemaVersion 不受支持 {}: 发现主版本 {major}，最高支持 {SUPPORTED_SCHEMA_MAJOR}",
                manifest_path.display()
            );
            Ok(EngineManifestResult::UnsupportedSchema {
                schema_version: manifest.schema_version,
                supported_major: SUPPORTED_SCHEMA_MAJOR,
            })
        }
        None => {
            log::error!(
                "引擎清单 schemaVersion 格式无效 {}: {}",
                manifest_path.display(),
                manifest.schema_version
            );
            Ok(EngineManifestResult::Invalid {
                reason: format!("schemaVersion 格式无效: {}", manifest.schema_version),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{parse_schema_major, EngineManifest, EngineManifestResult};

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
}

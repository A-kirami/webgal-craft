use std::{collections::BTreeMap, net::SocketAddr};

use crate::generated::editor_preview_protocol::PREVIEW_COMMAND_TYPES;
pub use crate::generated::editor_preview_protocol::{
    EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL, SESSION_REGISTER_PREVIEW_TYPE,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPreviewRequestPayload {
    pub game_id: Option<String>,
    pub embedded_launch_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IncomingRequestEnvelope<TPayload = Value> {
    kind: String,
    #[serde(rename = "type")]
    message_type: String,
    #[serde(rename = "requestId")]
    request_id: String,
    payload: TPayload,
}

#[derive(Debug, Deserialize)]
struct IncomingEventEnvelope {
    kind: String,
    #[serde(rename = "type")]
    message_type: String,
}

#[derive(Debug, Serialize)]
struct OutgoingEmptyResponseEnvelope<'a> {
    kind: &'static str,
    #[serde(rename = "type")]
    message_type: &'a str,
    #[serde(rename = "requestId")]
    request_id: &'a str,
    payload: EmptyPayload,
}

#[derive(Debug, Serialize, Default)]
struct EmptyPayload {}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_register_payload(
    payload: RegisterPreviewRequestPayload,
) -> RegisterPreviewRequestPayload {
    RegisterPreviewRequestPayload {
        game_id: normalize_optional_string(payload.game_id),
        embedded_launch_id: normalize_optional_string(payload.embedded_launch_id),
    }
}

pub fn requests_v1_subprotocol(header_value: Option<&str>) -> bool {
    let Some(header_value) = header_value else {
        return false;
    };

    header_value
        .split(',')
        .any(|protocol| protocol.trim() == EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL)
}

pub fn parse_register_preview_request(
    message: &str,
) -> Option<(String, RegisterPreviewRequestPayload)> {
    let envelope =
        serde_json::from_str::<IncomingRequestEnvelope<RegisterPreviewRequestPayload>>(message)
            .ok()?;

    if envelope.kind != "request" || envelope.message_type != SESSION_REGISTER_PREVIEW_TYPE {
        return None;
    }

    Some((
        envelope.request_id,
        normalize_register_payload(envelope.payload),
    ))
}

pub fn is_preview_command_request(message: &str) -> bool {
    let Ok(envelope) = serde_json::from_str::<IncomingRequestEnvelope<Value>>(message) else {
        return false;
    };

    envelope.kind == "request" && PREVIEW_COMMAND_TYPES.contains(&envelope.message_type.as_str())
}

pub fn is_event_message(message: &str) -> bool {
    let envelope = serde_json::from_str::<IncomingEventEnvelope>(message);
    matches!(envelope, Ok(envelope) if envelope.kind == "event" && !envelope.message_type.is_empty())
}

pub fn build_empty_response(
    message_type: &str,
    request_id: &str,
) -> Result<String, serde_json::Error> {
    serde_json::to_string(&OutgoingEmptyResponseEnvelope {
        kind: "response",
        message_type,
        request_id,
        payload: EmptyPayload::default(),
    })
}

#[derive(Debug, Default)]
pub struct PreviewSessionRegistry {
    active_game_id: Option<String>,
    embedded_launch_id: Option<String>,
    registrations: BTreeMap<SocketAddr, RegisterPreviewRequestPayload>,
}

impl PreviewSessionRegistry {
    pub fn set_active_game_id(&mut self, active_game_id: Option<String>) {
        self.active_game_id = normalize_optional_string(active_game_id);
    }

    pub fn set_embedded_launch_id(&mut self, embedded_launch_id: Option<String>) {
        self.embedded_launch_id = normalize_optional_string(embedded_launch_id);
    }

    pub fn unregister(&mut self, addr: SocketAddr) {
        self.registrations.remove(&addr);
    }

    pub fn register(&mut self, addr: SocketAddr, payload: RegisterPreviewRequestPayload) -> bool {
        let payload = normalize_register_payload(payload);
        if !self.accepts_preview_game_id(payload.game_id.as_deref()) {
            self.registrations.remove(&addr);
            return false;
        }

        self.registrations.insert(addr, payload);
        true
    }

    pub fn session_members(&self) -> Vec<SocketAddr> {
        self.session_registrations().map(|(addr, _)| addr).collect()
    }

    pub fn embedded_preview_addr(&self) -> Option<SocketAddr> {
        let embedded_launch_id = self.embedded_launch_id.as_deref()?;
        self.session_registrations().find_map(|(addr, payload)| {
            (payload.embedded_launch_id.as_deref() == Some(embedded_launch_id)).then_some(addr)
        })
    }

    pub fn preferred_event_source(&self) -> Option<SocketAddr> {
        self.embedded_preview_addr()
            .or_else(|| self.session_registrations().map(|(addr, _)| addr).next())
    }

    fn accepts_preview_game_id(&self, preview_game_id: Option<&str>) -> bool {
        match (self.active_game_id.as_deref(), preview_game_id) {
            (_, None) => true,
            (None, Some(_)) => true,
            (Some(active_game_id), Some(preview_game_id)) => active_game_id == preview_game_id,
        }
    }

    fn session_registrations(
        &self,
    ) -> impl Iterator<Item = (SocketAddr, &RegisterPreviewRequestPayload)> {
        self.registrations.iter().filter_map(|(addr, payload)| {
            self.accepts_preview_game_id(payload.game_id.as_deref())
                .then_some((*addr, payload))
        })
    }
}

#[cfg(test)]
mod tests {
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};

    use crate::generated::editor_preview_protocol::PREVIEW_COMMAND_TYPES;

    use super::{
        is_preview_command_request, parse_register_preview_request, requests_v1_subprotocol,
        PreviewSessionRegistry, RegisterPreviewRequestPayload,
    };

    fn socket_addr(last_octet: u8, port: u16) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, last_octet)), port)
    }

    #[test]
    fn requests_v1_subprotocol_accepts_exact_token_from_header_list() {
        assert!(requests_v1_subprotocol(Some(
            "graphql-ws, webgal-editor-preview-sync.v1"
        )));
        assert!(requests_v1_subprotocol(Some(
            "webgal-editor-preview-sync.v1"
        )));

        assert!(!requests_v1_subprotocol(Some(
            "graphql-ws, preview-sync.v0"
        )));
        assert!(!requests_v1_subprotocol(None));
    }

    #[test]
    fn parse_register_preview_request_reads_request_id_and_payload() {
        let parsed = parse_register_preview_request(
            r#"{
                "kind": "request",
                "type": "session.register-preview",
                "requestId": "req-register-1",
                "payload": {
                    "gameId": "demo-game",
                    "embeddedLaunchId": "embedded-launch-1"
                }
            }"#,
        );

        assert_eq!(
            parsed,
            Some((
                "req-register-1".to_string(),
                RegisterPreviewRequestPayload {
                    game_id: Some("demo-game".to_string()),
                    embedded_launch_id: Some("embedded-launch-1".to_string()),
                },
            ))
        );
    }

    #[test]
    fn preview_command_request_accepts_every_generated_command_type() {
        for command_type in PREVIEW_COMMAND_TYPES {
            let message = format!(
                r#"{{
                "kind": "request",
                "type": "{command_type}",
                "requestId": "req-preview-command",
                "payload": {{}}
            }}"#
            );

            assert!(
                is_preview_command_request(&message),
                "command type {command_type} should be accepted",
            );
        }
    }

    #[test]
    fn preview_command_request_rejects_unknown_or_non_request_messages() {
        assert!(!is_preview_command_request(
            r#"{
                "kind": "request",
                "type": "preview.command.unknown",
                "requestId": "req-unknown-command",
                "payload": {}
            }"#,
        ));

        assert!(!is_preview_command_request(
            r#"{
                "kind": "event",
                "type": "preview.command.sync-scene",
                "payload": {}
            }"#,
        ));
    }

    #[test]
    fn session_members_accept_matching_or_unkeyed_preview_and_reject_stale_game() {
        let mut registry = PreviewSessionRegistry::default();
        registry.set_active_game_id(Some("game-a".to_string()));

        let matching_addr = socket_addr(1, 3001);
        let unkeyed_addr = socket_addr(2, 3002);
        let stale_addr = socket_addr(3, 3003);

        assert!(registry.register(
            matching_addr,
            RegisterPreviewRequestPayload {
                game_id: Some("game-a".to_string()),
                embedded_launch_id: None,
            },
        ));
        assert!(registry.register(
            unkeyed_addr,
            RegisterPreviewRequestPayload {
                game_id: None,
                embedded_launch_id: None,
            },
        ));
        assert!(!registry.register(
            stale_addr,
            RegisterPreviewRequestPayload {
                game_id: Some("game-b".to_string()),
                embedded_launch_id: None,
            },
        ));

        assert_eq!(
            registry.session_members(),
            vec![matching_addr, unkeyed_addr]
        );
    }

    #[test]
    fn preferred_event_source_uses_bound_embedded_preview_when_present() {
        let mut registry = PreviewSessionRegistry::default();
        registry.set_active_game_id(Some("game-a".to_string()));
        registry.set_embedded_launch_id(Some("embedded-launch-1".to_string()));

        let external_addr = socket_addr(1, 3001);
        let embedded_addr = socket_addr(2, 3002);

        assert!(registry.register(
            external_addr,
            RegisterPreviewRequestPayload {
                game_id: Some("game-a".to_string()),
                embedded_launch_id: None,
            },
        ));
        assert!(registry.register(
            embedded_addr,
            RegisterPreviewRequestPayload {
                game_id: Some("game-a".to_string()),
                embedded_launch_id: Some("embedded-launch-1".to_string()),
            },
        ));

        assert_eq!(registry.preferred_event_source(), Some(embedded_addr));
    }
}

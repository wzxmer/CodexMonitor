use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use chrono::DateTime;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParsedSessionMetadata {
    pub(crate) thread_id: String,
    pub(crate) cwd: Option<String>,
    pub(crate) created_at: Option<i64>,
    pub(crate) source_kind: Option<String>,
    pub(crate) parent_thread_id: Option<String>,
    pub(crate) is_subagent: bool,
    pub(crate) subagent_nickname: Option<String>,
    pub(crate) subagent_role: Option<String>,
}

pub(crate) fn parse_session_metadata(path: &Path) -> Result<ParsedSessionMetadata, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let reader = BufReader::new(file);
    let mut parse_error = None;
    for line in reader.lines().take(16) {
        let line = line.map_err(|error| error.to_string())?;
        let value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(error) => {
                parse_error = Some(error.to_string());
                continue;
            }
        };
        if value.get("type").and_then(Value::as_str) != Some("session_meta") {
            continue;
        }
        return parse_session_meta_value(&value);
    }
    Err(parse_error.unwrap_or_else(|| "Session metadata record not found".to_string()))
}

fn parse_session_meta_value(value: &Value) -> Result<ParsedSessionMetadata, String> {
    let payload = value
        .get("payload")
        .and_then(Value::as_object)
        .ok_or_else(|| "Session metadata payload is missing".to_string())?;
    let thread_id = payload
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Session metadata id is missing".to_string())?
        .to_string();
    let source = payload.get("source");
    let thread_source = payload.get("thread_source").and_then(Value::as_str);
    let subagent = source
        .and_then(Value::as_object)
        .and_then(|value| value.get("subagent"));
    let thread_spawn = subagent
        .and_then(Value::as_object)
        .and_then(|value| value.get("thread_spawn"))
        .and_then(Value::as_object);
    let other_role = subagent
        .and_then(Value::as_object)
        .and_then(|value| value.get("other"))
        .and_then(Value::as_str);
    let is_subagent = thread_source.is_some_and(|value| value.eq_ignore_ascii_case("subagent"))
        || subagent.is_some();

    Ok(ParsedSessionMetadata {
        thread_id,
        cwd: optional_string(payload.get("cwd")),
        created_at: parse_timestamp_ms(
            payload
                .get("timestamp")
                .and_then(Value::as_str)
                .or_else(|| value.get("timestamp").and_then(Value::as_str)),
        ),
        source_kind: parse_source_kind(source, thread_source),
        parent_thread_id: thread_spawn
            .and_then(|value| optional_string(value.get("parent_thread_id"))),
        is_subagent,
        subagent_nickname: thread_spawn
            .and_then(|value| optional_string(value.get("agent_nickname"))),
        subagent_role: thread_spawn
            .and_then(|value| optional_string(value.get("agent_role")))
            .or_else(|| other_role.map(str::to_string)),
    })
}

fn parse_source_kind(source: Option<&Value>, thread_source: Option<&str>) -> Option<String> {
    if let Some(source) = source.and_then(Value::as_str) {
        return non_empty(source);
    }
    if source.and_then(Value::as_object).is_some() {
        return Some("subagent".to_string());
    }
    thread_source.and_then(non_empty)
}

pub(crate) fn parse_timestamp_ms(value: Option<&str>) -> Option<i64> {
    value
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.timestamp_millis())
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).and_then(non_empty)
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{parse_session_meta_value, parse_timestamp_ms};

    #[test]
    fn parses_regular_session_metadata() {
        let parsed = parse_session_meta_value(&json!({
            "timestamp": "2026-07-10T08:00:00Z",
            "type": "session_meta",
            "payload": {
                "id": "thread-a",
                "timestamp": "2026-07-10T08:00:00Z",
                "cwd": "D:\\Project\\Alpha",
                "source": "vscode",
                "thread_source": "user"
            }
        }))
        .unwrap();

        assert_eq!(parsed.thread_id, "thread-a");
        assert_eq!(parsed.source_kind.as_deref(), Some("vscode"));
        assert!(!parsed.is_subagent);
        assert_eq!(
            parsed.created_at,
            parse_timestamp_ms(Some("2026-07-10T08:00:00Z"))
        );
    }

    #[test]
    fn parses_thread_spawn_subagent_metadata() {
        let parsed = parse_session_meta_value(&json!({
            "type": "session_meta",
            "payload": {
                "id": "thread-child",
                "thread_source": "subagent",
                "source": {
                    "subagent": {
                        "thread_spawn": {
                            "parent_thread_id": "thread-parent",
                            "agent_nickname": "Gauss",
                            "agent_role": "explorer"
                        }
                    }
                }
            }
        }))
        .unwrap();

        assert!(parsed.is_subagent);
        assert_eq!(parsed.parent_thread_id.as_deref(), Some("thread-parent"));
        assert_eq!(parsed.subagent_nickname.as_deref(), Some("Gauss"));
        assert_eq!(parsed.subagent_role.as_deref(), Some("explorer"));
    }

    #[test]
    fn metadata_parser_can_skip_a_malformed_prefix_line() {
        let root =
            std::env::temp_dir().join(format!("codex-monitor-parser-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("rollout-thread-a.jsonl");
        std::fs::write(
            &path,
            "not-json\n{\"type\":\"session_meta\",\"payload\":{\"id\":\"thread-a\"}}\n",
        )
        .unwrap();

        let parsed = super::parse_session_metadata(&path).unwrap();
        assert_eq!(parsed.thread_id, "thread-a");
        std::fs::remove_dir_all(root).unwrap();
    }
}

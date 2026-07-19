use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use serde_json::Value;

use crate::types::{ManagedSessionPreviewItem, ManagedSessionPreviewRole};

const HEAD_PREVIEW_BYTES: u64 = 2 * 1024 * 1024;
const TAIL_PREVIEW_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SessionConversationPreview {
    pub(crate) opening_message: Option<String>,
    pub(crate) items: Vec<ManagedSessionPreviewItem>,
    pub(crate) incomplete: bool,
}

pub(crate) fn read_session_conversation_preview(
    path: &Path,
    limit: usize,
) -> Result<SessionConversationPreview, String> {
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    let opening_message = read_opening_message(path)?;
    let file_len = metadata.len();
    let tail_start = file_len.saturating_sub(TAIL_PREVIEW_BYTES);
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    file.seek(SeekFrom::Start(tail_start))
        .map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(file);
    if tail_start > 0 {
        let mut partial = Vec::new();
        reader
            .read_until(b'\n', &mut partial)
            .map_err(|error| error.to_string())?;
    }

    let mut items = VecDeque::with_capacity(limit.max(1));
    let mut incomplete = tail_start > 0;
    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(_) => {
                incomplete = true;
                break;
            }
        };
        let value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => {
                incomplete = true;
                continue;
            }
        };
        if let Some(item) = extract_preview_item(&value) {
            if items.back() == Some(&item) {
                continue;
            }
            items.push_back(item);
            while items.len() > limit.max(1) {
                items.pop_front();
            }
        }
    }

    Ok(SessionConversationPreview {
        opening_message,
        items: items.into_iter().collect(),
        incomplete,
    })
}

pub(crate) fn read_session_conversation(path: &Path) -> Result<SessionConversationPreview, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let reader = BufReader::new(file);
    let mut opening_message = None;
    let mut items = Vec::new();
    let mut incomplete = false;

    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(_) => {
                incomplete = true;
                continue;
            }
        };
        let value: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => {
                incomplete = true;
                continue;
            }
        };
        let Some(item) = extract_preview_item(&value) else {
            continue;
        };
        if opening_message.is_none() && item.role == ManagedSessionPreviewRole::User {
            opening_message = Some(item.text.clone());
        }
        if items.last() != Some(&item) {
            items.push(item);
        }
    }

    Ok(SessionConversationPreview {
        opening_message,
        items,
        incomplete,
    })
}

fn read_opening_message(path: &Path) -> Result<Option<String>, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let reader = BufReader::new(file.take(HEAD_PREVIEW_BYTES));
    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(_) => return Ok(None),
        };
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(item) = extract_preview_item(&value) {
            if item.role == ManagedSessionPreviewRole::User {
                return Ok(Some(item.text));
            }
        }
    }
    Ok(None)
}

fn extract_preview_item(value: &Value) -> Option<ManagedSessionPreviewItem> {
    let record_type = value.get("type").and_then(Value::as_str)?;
    let payload = value.get("payload")?;
    match record_type {
        "event_msg" => match payload.get("type").and_then(Value::as_str) {
            Some("user_message") => preview_item(
                ManagedSessionPreviewRole::User,
                payload.get("message").and_then(Value::as_str),
            ),
            Some("agent_message")
                if payload.get("phase").and_then(Value::as_str) == Some("final_answer") =>
            {
                preview_item(
                    ManagedSessionPreviewRole::Assistant,
                    payload.get("message").and_then(Value::as_str),
                )
            }
            _ => None,
        },
        "response_item" if payload.get("type").and_then(Value::as_str) == Some("message") => {
            let role = match payload.get("role").and_then(Value::as_str) {
                Some("user") => ManagedSessionPreviewRole::User,
                Some("assistant")
                    if payload.get("phase").and_then(Value::as_str) == Some("final_answer") =>
                {
                    ManagedSessionPreviewRole::Assistant
                }
                _ => return None,
            };
            let text = payload
                .get("content")
                .and_then(Value::as_array)?
                .iter()
                .filter(|item| {
                    matches!(
                        item.get("type").and_then(Value::as_str),
                        Some("input_text" | "output_text" | "text")
                    )
                })
                .filter_map(|item| item.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n");
            preview_item(role, Some(&text))
        }
        _ => None,
    }
}

fn preview_item(
    role: ManagedSessionPreviewRole,
    text: Option<&str>,
) -> Option<ManagedSessionPreviewItem> {
    let text = text?.trim();
    if text.is_empty() {
        return None;
    }
    Some(ManagedSessionPreviewItem {
        role,
        text: text.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::{json, Value};
    use uuid::Uuid;

    use super::{read_session_conversation, read_session_conversation_preview};
    use crate::types::ManagedSessionPreviewRole;

    #[test]
    fn keeps_opening_user_message_and_latest_effective_turns() {
        let path = std::env::temp_dir().join(format!("session-preview-{}.jsonl", Uuid::new_v4()));
        let records = [
            json!({"type":"event_msg","payload":{"type":"user_message","message":"first request"}}),
            json!({"type":"event_msg","payload":{"type":"agent_reasoning","message":"hidden"}}),
            json!({"type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"rules"}]}}),
            json!({"type":"event_msg","payload":{"type":"agent_message","message":"first final","phase":"final_answer"}}),
            json!({"type":"event_msg","payload":{"type":"user_message","message":"second request"}}),
            json!({"type":"response_item","payload":{"type":"function_call_output","output":"tool noise"}}),
            json!({"type":"response_item","payload":{"type":"message","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"second final"}]}}),
        ];
        fs::write(
            &path,
            records
                .iter()
                .map(Value::to_string)
                .collect::<Vec<_>>()
                .join("\n"),
        )
        .unwrap();

        let preview = read_session_conversation_preview(&path, 3).unwrap();
        assert_eq!(preview.opening_message.as_deref(), Some("first request"));
        assert_eq!(preview.items.len(), 3);
        assert_eq!(preview.items[0].text, "first final");
        assert_eq!(preview.items[1].role, ManagedSessionPreviewRole::User);
        assert_eq!(preview.items[2].text, "second final");
        assert!(!preview
            .items
            .iter()
            .any(|item| item.text.contains("hidden")));
        assert!(!preview.items.iter().any(|item| item.text.contains("rules")));
        assert!(!preview
            .items
            .iter()
            .any(|item| item.text.contains("tool noise")));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn reads_long_utf8_sessions_when_tail_starts_inside_a_character() {
        let path =
            std::env::temp_dir().join(format!("session-preview-utf8-{}.jsonl", Uuid::new_v4()));
        let prefix = "中".repeat(3_000_000);
        let final_record = json!({"type":"event_msg","payload":{"type":"agent_message","message":"latest utf8 result","phase":"final_answer"}});
        fs::write(&path, format!("{prefix}\n{final_record}\n")).unwrap();

        let preview = read_session_conversation_preview(&path, 6).unwrap();
        assert!(preview.incomplete);
        assert_eq!(
            preview.items.last().map(|item| item.text.as_str()),
            Some("latest utf8 result")
        );
        let _ = fs::remove_file(path);
    }

    #[test]
    fn reads_all_visible_messages_for_one_selected_session() {
        let path = std::env::temp_dir().join(format!("session-full-{}.jsonl", Uuid::new_v4()));
        let mut records = (0..20)
            .map(|index| {
                if index % 2 == 0 {
                    json!({"type":"event_msg","payload":{"type":"user_message","message":format!("request {index}")}})
                } else {
                    json!({"type":"event_msg","payload":{"type":"agent_message","message":format!("answer {index}"),"phase":"final_answer"}})
                }
            })
            .collect::<Vec<_>>();
        records.insert(4, json!({"type":"response_item","payload":{"type":"function_call_output","output":"tool noise"}}));
        fs::write(
            &path,
            records
                .iter()
                .map(Value::to_string)
                .collect::<Vec<_>>()
                .join("\n"),
        )
        .unwrap();

        let conversation = read_session_conversation(&path).unwrap();

        assert_eq!(conversation.items.len(), 20);
        assert_eq!(conversation.opening_message.as_deref(), Some("request 0"));
        assert_eq!(
            conversation.items.first().map(|item| item.text.as_str()),
            Some("request 0")
        );
        assert_eq!(
            conversation.items.last().map(|item| item.text.as_str()),
            Some("answer 19")
        );
        assert!(!conversation.incomplete);
        assert!(!conversation
            .items
            .iter()
            .any(|item| item.text.contains("tool noise")));
        let _ = fs::remove_file(path);
    }
}

use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;

use serde_json::Value;

const MAX_DERIVATION_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SessionDerivationContent {
    pub(crate) handoff_content: String,
    pub(crate) user_message_count: usize,
    pub(crate) agent_reply_count: usize,
    pub(crate) incomplete: bool,
}

pub(crate) fn build_session_derivation_content(
    path: &Path,
    title: &str,
    source_session_key: &str,
    cwd: Option<&str>,
) -> Result<SessionDerivationContent, String> {
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    let file = File::open(path).map_err(|error| error.to_string())?;
    let reader = BufReader::new(file.take(MAX_DERIVATION_BYTES));
    let mut user_messages = Vec::new();
    let mut agent_replies = Vec::new();
    let mut incomplete = metadata.len() > MAX_DERIVATION_BYTES;
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
        extract_handoff_messages(&value, &mut user_messages, &mut agent_replies);
    }
    let handoff_content = format_handoff(
        title,
        source_session_key,
        cwd,
        &user_messages,
        &agent_replies,
        incomplete,
    );
    Ok(SessionDerivationContent {
        handoff_content,
        user_message_count: user_messages.len(),
        agent_reply_count: agent_replies.len(),
        incomplete,
    })
}

fn extract_handoff_messages(
    value: &Value,
    user_messages: &mut Vec<String>,
    agent_replies: &mut Vec<String>,
) {
    let record_type = value.get("type").and_then(Value::as_str);
    let Some(payload) = value.get("payload") else {
        return;
    };
    match record_type {
        Some("event_msg") => match payload.get("type").and_then(Value::as_str) {
            Some("user_message") => push_unique_text(user_messages, payload.get("message")),
            Some("agent_message")
                if payload.get("phase").and_then(Value::as_str) == Some("final_answer") =>
            {
                push_unique_text(agent_replies, payload.get("message"));
            }
            _ => {}
        },
        Some("response_item") if payload.get("type").and_then(Value::as_str) == Some("message") => {
            let target = match payload.get("role").and_then(Value::as_str) {
                Some("user") => Some(user_messages),
                Some("assistant")
                    if payload.get("phase").and_then(Value::as_str) == Some("final_answer") =>
                {
                    Some(agent_replies)
                }
                _ => None,
            };
            if let (Some(target), Some(content)) =
                (target, payload.get("content").and_then(Value::as_array))
            {
                for item in content {
                    if matches!(
                        item.get("type").and_then(Value::as_str),
                        Some("input_text" | "output_text" | "text")
                    ) {
                        push_unique_text(target, item.get("text"));
                    }
                }
            }
        }
        _ => {}
    }
}

fn push_unique_text(target: &mut Vec<String>, value: Option<&Value>) {
    let Some(text) = value.and_then(Value::as_str).map(str::trim) else {
        return;
    };
    if text.is_empty() || target.last().is_some_and(|previous| previous == text) {
        return;
    }
    target.push(text.to_string());
}

fn format_handoff(
    title: &str,
    source_session_key: &str,
    cwd: Option<&str>,
    user_messages: &[String],
    agent_replies: &[String],
    incomplete: bool,
) -> String {
    let mut output = vec![
        "# Session handoff".to_string(),
        String::new(),
        format!("- Source title: {}", title.trim()),
        format!("- Source session: {source_session_key}"),
        format!("- Original project: {}", cwd.unwrap_or("Unavailable")),
    ];
    if incomplete {
        output.push(
            "- Extraction: Incomplete because the source file was truncated or malformed"
                .to_string(),
        );
    }
    output.push(String::new());
    output.push("## User messages".to_string());
    if user_messages.is_empty() {
        output.push(String::new());
        output.push("No user messages extracted.".to_string());
    } else {
        for (index, message) in user_messages.iter().enumerate() {
            output.push(String::new());
            output.push(format!("### User {}", index + 1));
            output.push(String::new());
            output.push(message.clone());
        }
    }
    output.push(String::new());
    output.push("## Final agent replies".to_string());
    if agent_replies.is_empty() {
        output.push(String::new());
        output.push("No final agent replies extracted.".to_string());
    } else {
        for (index, reply) in agent_replies.iter().enumerate() {
            output.push(String::new());
            output.push(format!("### Final reply {}", index + 1));
            output.push(String::new());
            output.push(reply.clone());
        }
    }
    output.push(String::new());
    output.push("## Continuation instruction".to_string());
    output.push(String::new());
    output.push("Continue the task using this handoff. Verify current repository state before changing files.".to_string());
    output.join("\n")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::{json, Value};
    use uuid::Uuid;

    use super::build_session_derivation_content;

    #[test]
    fn extracts_only_user_messages_and_final_agent_replies() {
        let path = std::env::temp_dir().join(format!("derivation-{}.jsonl", Uuid::new_v4()));
        let records = [
            json!({"type":"event_msg","payload":{"type":"user_message","message":"first request"}}),
            json!({"type":"event_msg","payload":{"type":"agent_reasoning","message":"secret reasoning"}}),
            json!({"type":"event_msg","payload":{"type":"agent_message","message":"draft reply","phase":"commentary"}}),
            json!({"type":"event_msg","payload":{"type":"agent_message","message":"final reply","phase":"final_answer"}}),
            json!({"type":"response_item","payload":{"type":"function_call","name":"shell"}}),
            json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"second request"}]}}),
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
        let content = build_session_derivation_content(
            &path,
            "Original",
            "source-a:thread-a",
            Some(r"D:\Project\Original"),
        )
        .unwrap();
        assert_eq!(content.user_message_count, 2);
        assert_eq!(content.agent_reply_count, 2);
        assert!(content.handoff_content.contains("first request"));
        assert!(content.handoff_content.contains("second final"));
        assert!(!content.handoff_content.contains("secret reasoning"));
        assert!(!content.handoff_content.contains("draft reply"));
        assert!(!content.handoff_content.contains("shell"));
        let _ = fs::remove_file(path);
    }
}

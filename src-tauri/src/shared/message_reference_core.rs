use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const MESSAGE_REFERENCES_DIR: &str = "codex-monitor/references";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateMessageReferenceRequest {
    pub(crate) workspace_id: String,
    pub(crate) source_thread_id: String,
    pub(crate) source_message_id: String,
    pub(crate) source_role: String,
    pub(crate) source_title: String,
    pub(crate) content: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MessageReferenceResponse {
    pub(crate) reference_id: String,
    pub(crate) path: String,
    pub(crate) character_count: usize,
    pub(crate) estimated_tokens: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateContentReferenceRequest {
    pub(crate) workspace_id: String,
    pub(crate) source_kind: String,
    pub(crate) source_name: String,
    pub(crate) content: String,
}

pub(crate) type ContentReferenceResponse = MessageReferenceResponse;

pub(crate) fn create_message_reference_core(
    codex_home: &Path,
    request: CreateMessageReferenceRequest,
) -> Result<MessageReferenceResponse, String> {
    let content = request.content.trim();
    if content.is_empty() {
        return Err("Reference content is required".to_string());
    }
    if request.workspace_id.trim().is_empty()
        || request.source_thread_id.trim().is_empty()
        || request.source_message_id.trim().is_empty()
    {
        return Err("Reference source identifiers are required".to_string());
    }

    let reference_id = reference_id(&request, content);
    let directory = codex_home.join(MESSAGE_REFERENCES_DIR).join(&reference_id);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create message reference directory: {error}"))?;
    let path = directory.join("content.md");
    let markdown = render_reference_markdown(&request, content, &reference_id);
    write_immutable(&path, markdown.as_bytes())?;

    let character_count = content.chars().count();
    let estimated_tokens = estimate_tokens(content);
    Ok(MessageReferenceResponse {
        reference_id,
        path: path.to_string_lossy().to_string(),
        character_count,
        estimated_tokens,
    })
}

pub(crate) fn create_content_reference_core(
    codex_home: &Path,
    request: CreateContentReferenceRequest,
) -> Result<ContentReferenceResponse, String> {
    let content = request.content.trim();
    if content.is_empty() {
        return Err("Reference content is required".to_string());
    }
    if request.workspace_id.trim().is_empty() || request.source_name.trim().is_empty() {
        return Err("Reference source identifiers are required".to_string());
    }
    let source_kind = request.source_kind.trim();
    if !matches!(source_kind, "attachment" | "log" | "diff") {
        return Err("Unsupported content reference kind".to_string());
    }

    let reference_id = content_reference_id(&request, content);
    let directory = codex_home.join(MESSAGE_REFERENCES_DIR).join(&reference_id);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create content reference directory: {error}"))?;
    let path = directory.join("content.md");
    let markdown = render_content_reference_markdown(&request, content, &reference_id);
    write_immutable(&path, markdown.as_bytes())?;

    Ok(ContentReferenceResponse {
        reference_id,
        path: path.to_string_lossy().to_string(),
        character_count: content.chars().count(),
        estimated_tokens: estimate_tokens(content),
    })
}

fn reference_id(request: &CreateMessageReferenceRequest, content: &str) -> String {
    let mut hasher = Sha256::new();
    for value in [
        request.workspace_id.trim(),
        request.source_thread_id.trim(),
        request.source_message_id.trim(),
        request.source_role.trim(),
        content,
    ] {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    format!("{:x}", hasher.finalize())
}

fn content_reference_id(request: &CreateContentReferenceRequest, content: &str) -> String {
    let mut hasher = Sha256::new();
    for value in [
        request.workspace_id.trim(),
        request.source_kind.trim(),
        request.source_name.trim(),
        content,
    ] {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    format!("{:x}", hasher.finalize())
}

fn render_reference_markdown(
    request: &CreateMessageReferenceRequest,
    content: &str,
    reference_id: &str,
) -> String {
    format!(
        "---\nreference_id: {reference_id}\nworkspace_id: {}\nsource_thread_id: {}\nsource_message_id: {}\nsource_role: {}\nsource_title: {}\n---\n\n{}\n",
        yaml_scalar(&request.workspace_id),
        yaml_scalar(&request.source_thread_id),
        yaml_scalar(&request.source_message_id),
        yaml_scalar(&request.source_role),
        yaml_scalar(&request.source_title),
        content,
    )
}

fn render_content_reference_markdown(
    request: &CreateContentReferenceRequest,
    content: &str,
    reference_id: &str,
) -> String {
    format!(
        "---\nreference_id: {reference_id}\nworkspace_id: {}\nsource_kind: {}\nsource_name: {}\n---\n\n{}\n",
        yaml_scalar(&request.workspace_id),
        yaml_scalar(&request.source_kind),
        yaml_scalar(&request.source_name),
        content,
    )
}

fn yaml_scalar(value: &str) -> String {
    format!("{:?}", value.trim())
}

fn estimate_tokens(content: &str) -> usize {
    let characters = content.chars().count();
    let bytes = content.len();
    characters.max(bytes).div_ceil(4).max(1)
}

fn write_immutable(path: &PathBuf, content: &[u8]) -> Result<(), String> {
    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(mut file) => file
            .write_all(content)
            .map_err(|error| format!("Failed to write message reference: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let existing = fs::read(path).map_err(|read_error| {
                format!("Failed to read existing message reference: {read_error}")
            })?;
            if existing == content {
                Ok(())
            } else {
                Err("Message reference collision detected".to_string())
            }
        }
        Err(error) => Err(format!("Failed to create message reference: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn creates_stable_immutable_reference() {
        let codex_home = std::env::temp_dir().join(format!("message-reference-{}", Uuid::new_v4()));
        fs::create_dir_all(&codex_home).unwrap();
        let request = CreateMessageReferenceRequest {
            workspace_id: "workspace-1".to_string(),
            source_thread_id: "thread-1".to_string(),
            source_message_id: "message-1".to_string(),
            source_role: "assistant".to_string(),
            source_title: "Selected assistant message".to_string(),
            content: "alpha\nbeta".to_string(),
        };

        let first = create_message_reference_core(&codex_home, request.clone()).unwrap();
        let second = create_message_reference_core(&codex_home, request).unwrap();

        assert_eq!(first.reference_id, second.reference_id);
        assert_eq!(first.path, second.path);
        assert!(Path::new(&first.path).starts_with(codex_home.join(MESSAGE_REFERENCES_DIR)));
        assert!(fs::read_to_string(&first.path)
            .unwrap()
            .contains("alpha\nbeta"));
        let _ = fs::remove_dir_all(codex_home);
    }

    #[test]
    fn creates_content_addressed_attachment_reference() {
        let codex_home = std::env::temp_dir().join(format!("content-reference-{}", Uuid::new_v4()));
        fs::create_dir_all(&codex_home).unwrap();
        let request = CreateContentReferenceRequest {
            workspace_id: "workspace-1".to_string(),
            source_kind: "attachment".to_string(),
            source_name: "build.log".to_string(),
            content: "line one\nline two".to_string(),
        };

        let first = create_content_reference_core(&codex_home, request.clone()).unwrap();
        let second = create_content_reference_core(&codex_home, request).unwrap();

        assert_eq!(first.reference_id, second.reference_id);
        assert_eq!(first.path, second.path);
        let stored = fs::read_to_string(&first.path).unwrap();
        assert!(stored.contains("source_kind: \"attachment\""));
        assert!(stored.contains("line one\nline two"));
        let _ = fs::remove_dir_all(codex_home);
    }
}

use base64::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use uuid::Uuid;

use crate::state::AppState;

const ATTACHMENTS_DIR: &str = ".codex-monitor/attachments";
const MAX_ATTACHMENT_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const MAX_ATTACHMENT_BYTES: u64 = 300 * 1024 * 1024;

#[derive(Debug)]
struct AttachmentEntry {
    path: PathBuf,
    modified: SystemTime,
    size: u64,
}

fn image_extension_for_mime(mime: &str) -> Option<&'static str> {
    match mime.to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        "image/heic" => Some("heic"),
        "image/heif" => Some("heif"),
        _ => None,
    }
}

fn image_extension_for_path(path: &Path) -> Option<String> {
    let extension = path
        .extension()?
        .to_string_lossy()
        .trim()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tiff" | "tif" | "heic" | "heif" => {
            Some(extension)
        }
        _ => None,
    }
}

fn parse_data_url_image(input: &str) -> Result<Option<(&str, Vec<u8>)>, String> {
    let Some(rest) = input.strip_prefix("data:") else {
        return Ok(None);
    };
    let Some((meta, encoded)) = rest.split_once(',') else {
        return Err("Invalid image data URL".to_string());
    };
    let mut parts = meta.split(';');
    let mime = parts.next().unwrap_or_default();
    if !mime.starts_with("image/") {
        return Ok(None);
    }
    if !parts.any(|part| part.eq_ignore_ascii_case("base64")) {
        return Err("Image data URL must be base64 encoded".to_string());
    }
    let bytes = BASE64_STANDARD
        .decode(encoded.as_bytes())
        .map_err(|err| format!("Failed to decode pasted image: {err}"))?;
    Ok(Some((mime, bytes)))
}

fn attachments_dir(workspace_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(workspace_path.trim());
    if root.as_os_str().is_empty() {
        return Err("Workspace path is required".to_string());
    }
    Ok(root.join(ATTACHMENTS_DIR))
}

fn ensure_attachments_dir(workspace_path: &str) -> Result<PathBuf, String> {
    let dir = attachments_dir(workspace_path)?;
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Failed to create attachments directory: {err}"))?;
    let gitignore_path = dir.join(".gitignore");
    if !gitignore_path.exists() {
        fs::write(&gitignore_path, "*\n!.gitignore\n")
            .map_err(|err| format!("Failed to protect attachments from git: {err}"))?;
    }
    Ok(dir)
}

fn unique_attachment_path(dir: &Path, extension: &str) -> PathBuf {
    let ts = chrono::Utc::now().format("%Y%m%d-%H%M%S%.3f");
    dir.join(format!("image-{ts}-{}.{}", Uuid::new_v4(), extension))
}

fn collect_attachment_entries(dir: &Path) -> Vec<AttachmentEntry> {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return Vec::new();
    };
    read_dir
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if path.file_name().and_then(|name| name.to_str()) == Some(".gitignore") {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file() {
                return None;
            }
            Some(AttachmentEntry {
                path,
                modified: metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                size: metadata.len(),
            })
        })
        .collect()
}

fn cleanup_attachments_dir(dir: &Path) {
    let now = SystemTime::now();
    for entry in collect_attachment_entries(dir) {
        if now
            .duration_since(entry.modified)
            .map(|age| age > MAX_ATTACHMENT_AGE)
            .unwrap_or(false)
        {
            let _ = fs::remove_file(entry.path);
        }
    }

    let mut entries = collect_attachment_entries(dir);
    entries.sort_by_key(|entry| entry.modified);
    let mut total: u64 = entries.iter().map(|entry| entry.size).sum();
    for entry in entries {
        if total <= MAX_ATTACHMENT_BYTES {
            break;
        }
        if fs::remove_file(&entry.path).is_ok() {
            total = total.saturating_sub(entry.size);
        }
    }
}

pub(crate) fn cleanup_workspace_attachments(workspace_path: &str) {
    if let Ok(dir) = attachments_dir(workspace_path) {
        cleanup_attachments_dir(&dir);
    }
}

pub(crate) async fn cleanup_all_workspace_attachments(state: &AppState) {
    let paths: Vec<String> = state
        .workspaces
        .lock()
        .await
        .values()
        .map(|workspace| workspace.path.clone())
        .collect();
    for path in paths {
        cleanup_workspace_attachments(&path);
    }
}

pub(crate) async fn save_composer_images_impl(
    workspace_id: String,
    images: Vec<String>,
    state: &AppState,
) -> Result<Vec<String>, String> {
    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .map(|workspace| workspace.path.clone())
            .ok_or_else(|| format!("Workspace not found: {workspace_id}"))?
    };

    let dir = ensure_attachments_dir(&workspace_path)?;
    cleanup_attachments_dir(&dir);

    let mut saved = Vec::new();
    for image in images {
        let trimmed = image.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some((mime, bytes)) = parse_data_url_image(trimmed)? {
            let extension = image_extension_for_mime(mime)
                .ok_or_else(|| format!("Unsupported pasted image type: {mime}"))?;
            let target = unique_attachment_path(&dir, extension);
            fs::write(&target, bytes)
                .map_err(|err| format!("Failed to save pasted image: {err}"))?;
            saved.push(target.to_string_lossy().to_string());
            continue;
        }

        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            saved.push(trimmed.to_string());
            continue;
        }

        let source = PathBuf::from(trimmed);
        let extension = image_extension_for_path(&source)
            .ok_or_else(|| format!("Unsupported image extension: {trimmed}"))?;
        let target = unique_attachment_path(&dir, &extension);
        fs::copy(&source, &target)
            .map_err(|err| format!("Failed to copy image attachment {trimmed}: {err}"))?;
        saved.push(target.to_string_lossy().to_string());
    }

    cleanup_attachments_dir(&dir);
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_png_data_url() {
        let parsed = parse_data_url_image("data:image/png;base64,aGVsbG8=").expect("parse result");
        let (mime, bytes) = parsed.expect("image data");
        assert_eq!(mime, "image/png");
        assert_eq!(bytes, b"hello");
    }

    #[test]
    fn ignores_non_data_url() {
        let parsed = parse_data_url_image("/tmp/image.png").expect("parse result");
        assert!(parsed.is_none());
    }
}

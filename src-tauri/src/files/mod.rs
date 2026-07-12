use serde_json::json;
use std::path::PathBuf;
use tauri::{AppHandle, State};

pub(crate) mod attachments;
use self::io::TextFileResponse;
use self::policy::{FileKind, FileScope};
use crate::remote_backend;
use crate::shared::codex_core;
use crate::shared::files_core::{file_read_core, file_write_core};
use crate::shared::message_reference_core::{
    create_content_reference_core, create_message_reference_core, ContentReferenceResponse,
    CreateContentReferenceRequest, CreateMessageReferenceRequest, MessageReferenceResponse,
};
use crate::state::AppState;

pub(crate) mod io;
pub(crate) mod ops;
pub(crate) mod policy;

async fn file_read_impl(
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    state: &AppState,
    app: &AppHandle,
) -> Result<TextFileResponse, String> {
    if remote_backend::is_remote_mode(state).await {
        let response = remote_backend::call_remote(
            state,
            app.clone(),
            "file_read",
            json!({ "scope": scope, "kind": kind, "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    file_read_core(
        &state.workspaces,
        &state.app_settings,
        scope,
        kind,
        workspace_id,
    )
    .await
}

async fn file_write_impl(
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    content: String,
    state: &AppState,
    app: &AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(state).await {
        remote_backend::call_remote(
            state,
            app.clone(),
            "file_write",
            json!({
                "scope": scope,
                "kind": kind,
                "workspaceId": workspace_id,
                "content": content,
            }),
        )
        .await?;
        return Ok(());
    }

    file_write_core(
        &state.workspaces,
        &state.app_settings,
        scope,
        kind,
        workspace_id,
        content,
    )
    .await
}

#[tauri::command]
pub(crate) async fn file_read(
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<TextFileResponse, String> {
    file_read_impl(scope, kind, workspace_id, &*state, &app).await
}

#[tauri::command]
pub(crate) async fn file_write(
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    content: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    file_write_impl(scope, kind, workspace_id, content, &*state, &app).await
}

#[tauri::command]
pub(crate) async fn read_image_as_data_url(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let trimmed_path = path.trim();
    if trimmed_path.is_empty() {
        return Err("Image path is required".to_string());
    }

    let mobile_runtime = cfg!(any(target_os = "ios", target_os = "android"));
    let remote_mode = remote_backend::is_remote_mode(&*state).await;
    if !mobile_runtime && !remote_mode {
        return Err(
            "Image conversion is only supported in remote backend mode or on mobile runtimes"
                .to_string(),
        );
    }

    let normalized = codex_core::normalize_file_path(trimmed_path);
    if normalized.is_empty() {
        return Err("Image path is required".to_string());
    }

    let _ = app;
    codex_core::read_image_as_data_url_core(&normalized)
}

#[tauri::command]
pub(crate) async fn save_composer_images(
    workspace_id: String,
    owner_key: String,
    images: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    attachments::save_composer_images_impl(workspace_id, owner_key, images, &*state).await
}

#[tauri::command]
pub(crate) async fn promote_composer_images(
    workspace_id: String,
    thread_id: String,
    images: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return Ok(images);
    }
    attachments::promote_composer_images_impl(workspace_id, thread_id, images, &*state).await
}

#[tauri::command]
pub(crate) async fn create_message_reference(
    request: CreateMessageReferenceRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<MessageReferenceResponse, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "create_message_reference",
            serde_json::to_value(request).map_err(|error| error.to_string())?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|error| error.to_string());
    }
    let settings = state.app_settings.lock().await.clone();
    let codex_home = crate::codex::home::resolve_settings_codex_home(&settings)
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())?;
    create_message_reference_core(&codex_home, request)
}

#[tauri::command]
pub(crate) async fn create_content_reference(
    request: CreateContentReferenceRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ContentReferenceResponse, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "create_content_reference",
            serde_json::to_value(request).map_err(|error| error.to_string())?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|error| error.to_string());
    }
    let settings = state.app_settings.lock().await.clone();
    let codex_home = crate::codex::home::resolve_settings_codex_home(&settings)
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())?;
    create_content_reference_core(&codex_home, request)
}

#[tauri::command]
pub(crate) fn write_text_file(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(path.trim());
    if target.as_os_str().is_empty() {
        return Err("Path is required".to_string());
    }
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("Failed to create export directory: {err}"))?;
        }
    }
    std::fs::write(&target, content).map_err(|err| format!("Failed to write export file: {err}"))
}

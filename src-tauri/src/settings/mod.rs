use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};

use crate::shared::agents_config_core;
use crate::shared::codex_native_pet_core::{
    get_codex_native_pet_state_core, import_codex_native_pet_core,
    set_codex_native_pet_enabled_core, set_codex_native_pet_position_core,
    set_codex_native_pet_selected_core, wake_codex_native_pet_core, CodexNativePetState,
    CodexNativePetWindowPosition,
};
use crate::shared::settings_core::{
    get_app_settings_core, get_codex_config_path_core, get_codex_status_core,
    get_codex_sync_diagnostics_core, update_app_settings_core, CodexStatusDto,
    CodexSyncDiagnosticsDto,
};
use crate::state::AppState;
use crate::types::{AppSettings, BackendMode};
use crate::window;

#[tauri::command]
pub(crate) async fn get_app_settings(
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let settings = get_app_settings_core(&state.app_settings).await;
    let _ = window::apply_window_appearance(&window, settings.theme.as_str());
    Ok(settings)
}

#[tauri::command]
pub(crate) async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let previous = state.app_settings.lock().await.clone();
    let updated =
        update_app_settings_core(settings, &state.app_settings, &state.settings_path).await?;
    if let Err(error) =
        agents_config_core::remove_legacy_native_markdown_import_flag_for_settings(&updated)
    {
        eprintln!("update_app_settings: failed to remove legacy agent import marker: {error}");
    }
    if should_reset_remote_backend(&previous, &updated) {
        *state.remote_backend.lock().await = None;
    }
    ensure_remote_runtime_for_settings(&updated, state).await;
    sync_codex_pet_window_for_settings(window.app_handle(), &updated);
    let _ = window::apply_window_appearance(&window, updated.theme.as_str());
    Ok(updated)
}

#[tauri::command]
pub(crate) async fn get_codex_config_path(state: State<'_, AppState>) -> Result<String, String> {
    let settings = state.app_settings.lock().await.clone();
    get_codex_config_path_core(&settings)
}

#[tauri::command]
pub(crate) async fn get_codex_status(state: State<'_, AppState>) -> Result<CodexStatusDto, String> {
    let settings = state.app_settings.lock().await.clone();
    Ok(get_codex_status_core(&settings))
}

#[tauri::command]
pub(crate) async fn get_codex_sync_diagnostics(
    state: State<'_, AppState>,
) -> Result<CodexSyncDiagnosticsDto, String> {
    let settings = state.app_settings.lock().await.clone();
    Ok(get_codex_sync_diagnostics_core(&settings))
}

#[tauri::command]
pub(crate) async fn get_codex_native_pet_state(
    state: State<'_, AppState>,
) -> Result<CodexNativePetState, String> {
    let settings = state.app_settings.lock().await.clone();
    get_codex_native_pet_state_core(&settings)
}

#[tauri::command]
pub(crate) async fn set_codex_native_pet_enabled(
    enabled: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CodexNativePetState, String> {
    let settings = state.app_settings.lock().await.clone();
    let pet_state = set_codex_native_pet_enabled_core(&settings, enabled)?;
    sync_codex_pet_window(&app, &pet_state);
    Ok(pet_state)
}

#[tauri::command]
pub(crate) async fn set_codex_native_pet_selected(
    avatar_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CodexNativePetState, String> {
    let settings = state.app_settings.lock().await.clone();
    let pet_state = set_codex_native_pet_selected_core(&settings, &avatar_id)?;
    sync_codex_pet_window(&app, &pet_state);
    Ok(pet_state)
}

#[tauri::command]
pub(crate) async fn set_codex_native_pet_position(
    position: CodexNativePetWindowPosition,
    state: State<'_, AppState>,
) -> Result<CodexNativePetState, String> {
    let settings = state.app_settings.lock().await.clone();
    set_codex_native_pet_position_core(&settings, position)
}

#[tauri::command]
pub(crate) async fn wake_codex_native_pet(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CodexNativePetState, String> {
    let settings = state.app_settings.lock().await.clone();
    let pet_state = wake_codex_native_pet_core(&settings)?;
    sync_codex_pet_window(&app, &pet_state);
    Ok(pet_state)
}

#[tauri::command]
pub(crate) async fn import_codex_native_pet(
    source_dir: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CodexNativePetState, String> {
    let settings = state.app_settings.lock().await.clone();
    let pet_state = import_codex_native_pet_core(&settings, &source_dir)?;
    sync_codex_pet_window(&app, &pet_state);
    Ok(pet_state)
}

#[cfg(desktop)]
fn sync_codex_pet_window(app: &AppHandle, pet_state: &CodexNativePetState) {
    const PET_WINDOW_LABEL: &str = "codex-pet";
    if !pet_state.enabled {
        if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
            let _ = window.close();
        }
        return;
    }

    if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.emit("codex-pet-state-changed", ());
        return;
    }

    let mut builder =
        WebviewWindowBuilder::new(app, PET_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("Codex Pet")
            .decorations(false)
            .transparent(true)
            .resizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .inner_size(180.0, 180.0);
    if let Some(position) = &pet_state.window_position {
        builder = builder.position(position.x as f64, position.y as f64);
    }
    let _ = builder.build().map(|window| {
        let _ = window.set_always_on_top(true);
    });
}

#[cfg(not(desktop))]
fn sync_codex_pet_window(_app: &AppHandle, _pet_state: &CodexNativePetState) {}

pub(crate) fn sync_codex_pet_window_for_settings(app: &AppHandle, settings: &AppSettings) {
    if let Ok(pet_state) = get_codex_native_pet_state_core(settings) {
        sync_codex_pet_window(app, &pet_state);
    }
}

fn should_reset_remote_backend(previous: &AppSettings, updated: &AppSettings) -> bool {
    let backend_mode_changed = !matches!(
        (&previous.backend_mode, &updated.backend_mode),
        (
            crate::types::BackendMode::Local,
            crate::types::BackendMode::Local
        ) | (
            crate::types::BackendMode::Remote,
            crate::types::BackendMode::Remote
        )
    );
    backend_mode_changed
        || previous.remote_backend_provider != updated.remote_backend_provider
        || previous.remote_backend_host != updated.remote_backend_host
        || previous.remote_backend_token != updated.remote_backend_token
}

async fn ensure_remote_runtime_for_settings(settings: &AppSettings, state: State<'_, AppState>) {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return;
    }
    if !matches!(settings.backend_mode, BackendMode::Remote) {
        return;
    }

    let _ = crate::tailscale::tailscale_daemon_start(state).await;
}

#[cfg(test)]
mod tests {
    use super::should_reset_remote_backend;
    use crate::types::{AppSettings, BackendMode};

    #[test]
    fn should_reset_remote_backend_when_provider_changes() {
        let previous = AppSettings::default();
        let mut updated = previous.clone();
        updated.remote_backend_provider = crate::types::RemoteBackendProvider::Tcp;
        updated.remote_backend_host = "remote.example:4732".to_string();
        assert!(should_reset_remote_backend(&previous, &updated));
    }

    #[test]
    fn should_reset_remote_backend_when_transport_token_changes() {
        let previous = AppSettings::default();
        let mut updated = previous.clone();
        updated.remote_backend_token = Some("token-1".to_string());
        assert!(should_reset_remote_backend(&previous, &updated));
    }

    #[test]
    fn should_not_reset_remote_backend_for_non_transport_setting_changes() {
        let previous = AppSettings::default();
        let mut updated = previous.clone();
        updated.theme = "dark".to_string();
        updated.backend_mode = BackendMode::Local;
        assert!(!should_reset_remote_backend(&previous, &updated));
    }
}

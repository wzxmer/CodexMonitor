use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tokio::sync::Mutex;

use crate::codex::config as codex_config;
use crate::codex::home as codex_home;
use crate::storage::write_settings;
use crate::types::AppSettings;
use crate::utils::normalize_windows_namespace_path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexStatusDto {
    pub(crate) codex_home_path: Option<String>,
    pub(crate) codex_home_source: String,
    pub(crate) config_path: Option<String>,
    pub(crate) config_exists: bool,
    pub(crate) global_agents_path: Option<String>,
    pub(crate) global_agents_exists: bool,
    pub(crate) codex_skills_path: Option<String>,
    pub(crate) codex_skills_count: usize,
    pub(crate) agents_skills_path: Option<String>,
    pub(crate) agents_skills_count: usize,
    pub(crate) model: Option<String>,
    pub(crate) model_error: Option<String>,
}

fn normalize_personality(value: &str) -> Option<&'static str> {
    match value.trim() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

pub(crate) async fn get_app_settings_core(app_settings: &Mutex<AppSettings>) -> AppSettings {
    let mut settings = app_settings.lock().await.clone();
    if let Ok(Some(collaboration_modes_enabled)) = codex_config::read_collaboration_modes_enabled()
    {
        settings.collaboration_modes_enabled = collaboration_modes_enabled;
    }
    if let Ok(Some(steer_enabled)) = codex_config::read_steer_enabled() {
        settings.steer_enabled = steer_enabled;
    }
    if let Ok(Some(unified_exec_enabled)) = codex_config::read_unified_exec_enabled() {
        settings.unified_exec_enabled = unified_exec_enabled;
    }
    if let Ok(Some(apps_enabled)) = codex_config::read_apps_enabled() {
        settings.experimental_apps_enabled = apps_enabled;
    }
    if let Ok(personality) = codex_config::read_personality() {
        settings.personality = personality
            .as_deref()
            .and_then(normalize_personality)
            .unwrap_or("friendly")
            .to_string();
    }
    settings
}

pub(crate) async fn update_app_settings_core(
    mut settings: AppSettings,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<AppSettings, String> {
    settings.global_worktrees_folder = settings
        .global_worktrees_folder
        .map(|path| normalize_windows_namespace_path(&path));
    let _ = codex_config::write_collaboration_modes_enabled(settings.collaboration_modes_enabled);
    let _ = codex_config::write_steer_enabled(settings.steer_enabled);
    let _ = codex_config::write_unified_exec_enabled(settings.unified_exec_enabled);
    let _ = codex_config::write_apps_enabled(settings.experimental_apps_enabled);
    let _ = codex_config::write_personality(settings.personality.as_str());
    write_settings(settings_path, &settings)?;
    let mut current = app_settings.lock().await;
    *current = settings.clone();
    Ok(settings)
}

pub(crate) fn get_codex_config_path_core() -> Result<String, String> {
    codex_config::config_toml_path()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
        .and_then(|path| {
            path.to_str()
                .map(|value| value.to_string())
                .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
        })
}

pub(crate) fn get_codex_status_core() -> CodexStatusDto {
    let codex_home = codex_home::resolve_default_codex_home();
    let codex_home_source = match std::env::var("CODEX_HOME") {
        Ok(value) if !value.trim().is_empty() => "CODEX_HOME",
        _ => "默认路径",
    }
    .to_string();
    let config_path = codex_home.as_ref().map(|home| home.join("config.toml"));
    let global_agents_path = codex_home.as_ref().map(|home| home.join("AGENTS.md"));
    let codex_skills_path = codex_home.as_ref().map(|home| home.join("skills"));
    let agents_skills_path = codex_home::resolve_home_dir()
        .map(|home| home.join(".agents").join("skills"));
    let (model, model_error) = match codex_config::read_config_model(codex_home.clone()) {
        Ok(model) => (model, None),
        Err(error) => (None, Some(error)),
    };

    CodexStatusDto {
        codex_home_path: path_to_string(codex_home.as_deref()),
        codex_home_source,
        config_exists: path_exists(config_path.as_deref()),
        config_path: path_to_string(config_path.as_deref()),
        global_agents_exists: path_exists(global_agents_path.as_deref()),
        global_agents_path: path_to_string(global_agents_path.as_deref()),
        codex_skills_count: count_skill_dirs(codex_skills_path.as_deref()),
        codex_skills_path: path_to_string(codex_skills_path.as_deref()),
        agents_skills_count: count_skill_dirs(agents_skills_path.as_deref()),
        agents_skills_path: path_to_string(agents_skills_path.as_deref()),
        model,
        model_error,
    }
}

fn path_exists(path: Option<&Path>) -> bool {
    path.is_some_and(|path| path.exists())
}

fn path_to_string(path: Option<&Path>) -> Option<String> {
    path.map(|path| path.to_string_lossy().to_string())
}

fn count_skill_dirs(path: Option<&Path>) -> usize {
    let Some(path) = path else {
        return 0;
    };
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|file_type| file_type.is_dir()).unwrap_or(false))
        .count()
}

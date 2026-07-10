use std::path::PathBuf;

use serde::Serialize;

use crate::shared::config_toml_core;
use crate::types::AppSettings;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexProviderStatus {
    pub(crate) provider_name: Option<String>,
    pub(crate) base_url: Option<String>,
    pub(crate) source: String,
    pub(crate) is_configured: bool,
    pub(crate) is_third_party: bool,
    pub(crate) auto_compact_token_limit: Option<u64>,
    pub(crate) model_context_window: Option<u64>,
    pub(crate) error: Option<String>,
}

pub(crate) fn read_steer_enabled(settings: &AppSettings) -> Result<Option<bool>, String> {
    read_feature_flag(settings, "steer")
}

pub(crate) fn read_collaboration_modes_enabled(
    settings: &AppSettings,
) -> Result<Option<bool>, String> {
    read_feature_flag(settings, "collaboration_modes")
}

pub(crate) fn read_unified_exec_enabled(settings: &AppSettings) -> Result<Option<bool>, String> {
    read_feature_flag(settings, "unified_exec")
}

pub(crate) fn read_apps_enabled(settings: &AppSettings) -> Result<Option<bool>, String> {
    read_feature_flag(settings, "apps")
}

pub(crate) fn read_personality(settings: &AppSettings) -> Result<Option<String>, String> {
    let Some(root) = resolve_settings_codex_home(settings) else {
        return Ok(None);
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(read_personality_from_document(&document))
}

pub(crate) fn write_steer_enabled(settings: &AppSettings, enabled: bool) -> Result<(), String> {
    write_feature_flag(settings, "steer", enabled)
}

pub(crate) fn write_collaboration_modes_enabled(
    settings: &AppSettings,
    enabled: bool,
) -> Result<(), String> {
    write_feature_flag(settings, "collaboration_modes", enabled)
}

pub(crate) fn write_unified_exec_enabled(
    settings: &AppSettings,
    enabled: bool,
) -> Result<(), String> {
    write_feature_flag(settings, "unified_exec", enabled)
}

pub(crate) fn write_apps_enabled(settings: &AppSettings, enabled: bool) -> Result<(), String> {
    write_feature_flag(settings, "apps", enabled)
}

pub(crate) fn write_feature_enabled(
    settings: &AppSettings,
    feature_key: &str,
    enabled: bool,
) -> Result<(), String> {
    let key = feature_key.trim();
    if key.is_empty() {
        return Err("feature key is empty".to_string());
    }
    if key.eq_ignore_ascii_case("collab") {
        return Err("feature key `collab` is no longer supported; use `multi_agent`".to_string());
    }
    write_feature_flag(settings, key, enabled)
}

pub(crate) fn write_personality(settings: &AppSettings, personality: &str) -> Result<(), String> {
    let Some(root) = resolve_settings_codex_home(settings) else {
        return Ok(());
    };
    let (_, mut document) = config_toml_core::load_global_config_document(&root)?;
    let normalized = normalize_personality_value(personality);
    config_toml_core::set_top_level_string(&mut document, "personality", normalized);
    config_toml_core::persist_global_config_document(&root, &document)
}

fn read_feature_flag(settings: &AppSettings, key: &str) -> Result<Option<bool>, String> {
    let Some(root) = resolve_settings_codex_home(settings) else {
        return Ok(None);
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(config_toml_core::read_feature_flag(&document, key))
}

fn write_feature_flag(settings: &AppSettings, key: &str, enabled: bool) -> Result<(), String> {
    let Some(root) = resolve_settings_codex_home(settings) else {
        return Ok(());
    };
    let (_, mut document) = config_toml_core::load_global_config_document(&root)?;
    config_toml_core::set_feature_flag(&mut document, key, enabled)?;
    config_toml_core::persist_global_config_document(&root, &document)
}

pub(crate) fn read_config_model(codex_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let root = codex_home.or_else(resolve_default_codex_home);
    let Some(root) = root else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    Ok(config_toml_core::read_top_level_string(&document, "model"))
}

pub(crate) fn read_provider_status(
    codex_home: Option<PathBuf>,
    active_profile_base_url: Option<&str>,
    active_profile_selected: bool,
) -> Result<CodexProviderStatus, String> {
    let root = codex_home.or_else(resolve_default_codex_home);
    let Some(root) = root else {
        if active_profile_selected {
            return Ok(build_provider_status(
                None,
                active_profile_base_url.map(str::to_string),
                "activeProfile".to_string(),
                None,
                None,
            ));
        }
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    let (_, document) = config_toml_core::load_global_config_document(&root)?;
    let auto_compact_token_limit = read_auto_compact_token_limit_from_document(&document);
    let model_context_window = read_model_context_window_from_document(&document);

    if active_profile_selected {
        return Ok(build_provider_status(
            None,
            active_profile_base_url.map(str::to_string),
            "activeProfile".to_string(),
            auto_compact_token_limit,
            model_context_window,
        ));
    }

    let provider_name = config_toml_core::read_top_level_string(&document, "model_provider");
    let base_url = provider_name.as_deref().and_then(|provider| {
        config_toml_core::read_nested_string(&document, &["model_providers", provider, "base_url"])
    });

    Ok(build_provider_status(
        provider_name,
        base_url,
        "configToml".to_string(),
        auto_compact_token_limit,
        model_context_window,
    ))
}

fn build_provider_status(
    provider_name: Option<String>,
    base_url: Option<String>,
    source: String,
    auto_compact_token_limit: Option<u64>,
    model_context_window: Option<u64>,
) -> CodexProviderStatus {
    let base_url = normalize_optional_string(base_url.as_deref());
    let is_configured = base_url.is_some();
    let is_third_party = base_url
        .as_deref()
        .map(|url| !is_official_openai_url(url))
        .unwrap_or(false);
    let error = if is_configured {
        None
    } else {
        Some("Codex provider base_url is not configured".to_string())
    };

    CodexProviderStatus {
        provider_name,
        base_url,
        source,
        is_configured,
        is_third_party,
        auto_compact_token_limit,
        model_context_window,
        error,
    }
}

fn read_auto_compact_token_limit_from_document(document: &toml_edit::Document) -> Option<u64> {
    config_toml_core::read_top_level_positive_integer(document, "model_auto_compact_token_limit")
}

fn read_model_context_window_from_document(document: &toml_edit::Document) -> Option<u64> {
    config_toml_core::read_top_level_positive_integer(document, "model_context_window")
}

fn normalize_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn is_official_openai_url(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return false;
    }
    let without_scheme = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed);
    let authority = without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
        .split('@')
        .next_back()
        .unwrap_or_default();
    let host = authority
        .split(':')
        .next()
        .unwrap_or_default()
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();

    matches!(
        host.as_str(),
        "api.openai.com" | "chatgpt.com" | "chat.openai.com"
    ) || host.ends_with(".openai.com")
}

fn resolve_default_codex_home() -> Option<PathBuf> {
    crate::codex::home::resolve_default_codex_home()
}

fn resolve_settings_codex_home(settings: &AppSettings) -> Option<PathBuf> {
    crate::codex::home::resolve_settings_codex_home(settings)
}

fn read_personality_from_document(document: &toml_edit::Document) -> Option<String> {
    config_toml_core::read_top_level_string(document, "personality")
        .as_deref()
        .and_then(normalize_personality_value)
        .map(|value| value.to_string())
}

fn normalize_personality_value(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_provider_status, is_official_openai_url, normalize_personality_value,
        read_auto_compact_token_limit_from_document, read_model_context_window_from_document,
        read_personality_from_document, read_provider_status,
    };
    use crate::shared::config_toml_core;

    #[test]
    fn parse_personality_reads_supported_values() {
        let friendly =
            config_toml_core::parse_document("personality = \"friendly\"\n").expect("parse");
        let pragmatic =
            config_toml_core::parse_document("personality = \"pragmatic\"\n").expect("parse");
        let unknown =
            config_toml_core::parse_document("personality = \"unknown\"\n").expect("parse");

        assert_eq!(
            read_personality_from_document(&friendly),
            Some("friendly".to_string())
        );
        assert_eq!(
            read_personality_from_document(&pragmatic),
            Some("pragmatic".to_string())
        );
        assert_eq!(read_personality_from_document(&unknown), None);
    }

    #[test]
    fn normalize_personality_is_case_insensitive() {
        assert_eq!(normalize_personality_value("Friendly"), Some("friendly"));
        assert_eq!(normalize_personality_value("PRAGMATIC"), Some("pragmatic"));
        assert_eq!(normalize_personality_value("unknown"), None);
    }

    #[test]
    fn provider_status_marks_non_official_base_url_as_third_party() {
        let status = build_provider_status(
            Some("custom".to_string()),
            Some("https://api.example.com/v1".to_string()),
            "configToml".to_string(),
            None,
            None,
        );

        assert!(status.is_configured);
        assert!(status.is_third_party);
        assert_eq!(status.error, None);
    }

    #[test]
    fn provider_status_requires_base_url_to_be_configured() {
        let status = build_provider_status(
            Some("openai".to_string()),
            None,
            "configToml".to_string(),
            None,
            None,
        );

        assert!(!status.is_configured);
        assert!(!status.is_third_party);
        assert_eq!(
            status.error,
            Some("Codex provider base_url is not configured".to_string())
        );
    }

    #[test]
    fn selected_active_profile_with_empty_base_url_does_not_fall_back_to_config() {
        let status = read_provider_status(None, Some("  "), true).expect("status");

        assert_eq!(status.source, "activeProfile");
        assert!(!status.is_configured);
        assert_eq!(status.base_url, None);
    }

    #[test]
    fn official_openai_url_detection_is_host_based() {
        assert!(is_official_openai_url("https://api.openai.com/v1"));
        assert!(is_official_openai_url("https://chatgpt.com/backend-api"));
        assert!(is_official_openai_url("https://gateway.openai.com"));
        assert!(!is_official_openai_url("https://openai.example.com/v1"));
        assert!(!is_official_openai_url(
            "https://api.openai.com.evil.test/v1"
        ));
    }

    #[test]
    fn context_settings_read_positive_top_level_values() {
        let document = config_toml_core::parse_document(
            "model_auto_compact_token_limit = 120000\nmodel_context_window = 200000\n",
        )
        .expect("parse");

        assert_eq!(
            read_auto_compact_token_limit_from_document(&document),
            Some(120_000)
        );
        assert_eq!(
            read_model_context_window_from_document(&document),
            Some(200_000)
        );
    }

    #[test]
    fn context_settings_ignore_missing_or_non_positive_values() {
        let document = config_toml_core::parse_document(
            "model_auto_compact_token_limit = 0\nmodel_context_window = -1\n",
        )
        .expect("parse");

        assert_eq!(read_auto_compact_token_limit_from_document(&document), None);
        assert_eq!(read_model_context_window_from_document(&document), None);
    }
}

#![allow(dead_code)]

use std::path::Path;

use toml_edit::{value, Document, Item, Table};

use crate::shared::{config_toml_core, provider_profiles_core};
use crate::types::AppSettings;

const CODEX_MONITOR_PROVIDER_ID: &str = "codex_monitor";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProviderConfigSyncOutcome {
    Disabled,
    NoActiveProfile,
    Updated,
}

pub(crate) fn apply_active_provider_profile(
    document: &mut Document,
    settings: &AppSettings,
) -> Result<ProviderConfigSyncOutcome, String> {
    if !settings.sync_provider_profile_to_local_config {
        return Ok(ProviderConfigSyncOutcome::Disabled);
    }
    let Some(active_id) = settings
        .active_codex_key_profile_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(ProviderConfigSyncOutcome::NoActiveProfile);
    };
    let profile = settings
        .codex_key_profiles
        .iter()
        .find(|profile| profile.id.trim() == active_id)
        .ok_or_else(|| format!("Active Provider profile `{active_id}` was not found"))?;
    if profile.key.trim().is_empty() {
        return Err("Active Provider profiles require a non-empty API key".to_string());
    }
    if provider_profiles_core::profile_uses_gateway(profile) {
        return Err(
            "Provider profiles that require the compatibility gateway cannot be written to config.toml"
                .to_string(),
        );
    }
    let base_url = provider_profiles_core::resolve_profile_base_url(profile)
        .ok_or_else(|| "Provider profiles require a provider base URL".to_string())?;
    let key_env_var = profile.key_env_var.trim();
    if key_env_var.is_empty() {
        return Err("Provider profiles require a non-empty key environment variable".to_string());
    }
    let model = profile
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let mut updated = document.clone();
    config_toml_core::set_top_level_string(
        &mut updated,
        "model_provider",
        Some(CODEX_MONITOR_PROVIDER_ID),
    );
    if let Some(model) = model {
        config_toml_core::set_top_level_string(&mut updated, "model", Some(model));
    }
    if let Some(context_window) = profile.context_window.filter(|value| *value > 0) {
        config_toml_core::set_top_level_positive_integer(
            &mut updated,
            "model_context_window",
            Some(context_window),
        )?;
    }

    let providers = config_toml_core::ensure_table(&mut updated, "model_providers")?;
    if providers.get(CODEX_MONITOR_PROVIDER_ID).is_none() {
        providers[CODEX_MONITOR_PROVIDER_ID] = Item::Table(Table::new());
    }
    let provider = providers[CODEX_MONITOR_PROVIDER_ID]
        .as_table_mut()
        .ok_or_else(|| {
            format!("`model_providers.{CODEX_MONITOR_PROVIDER_ID}` must be a table in config.toml")
        })?;
    provider["name"] = value("CodexMonitor");
    provider["base_url"] = value(base_url);
    provider["env_key"] = value(key_env_var);
    provider["wire_api"] = value("responses");
    provider["requires_openai_auth"] = value(false);
    provider["supports_websockets"] = value(false);

    *document = updated;
    Ok(ProviderConfigSyncOutcome::Updated)
}

pub(crate) fn sync_active_provider_profile_to_local_config(
    codex_home: &Path,
    settings: &AppSettings,
) -> Result<ProviderConfigSyncOutcome, String> {
    if !settings.sync_provider_profile_to_local_config {
        return Ok(ProviderConfigSyncOutcome::Disabled);
    }
    if settings
        .active_codex_key_profile_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        return Ok(ProviderConfigSyncOutcome::NoActiveProfile);
    }

    let snapshot = config_toml_core::load_global_config_snapshot(codex_home)?;
    let mut document = snapshot.document.clone();
    let outcome = apply_active_provider_profile(&mut document, settings)?;
    if outcome == ProviderConfigSyncOutcome::Updated {
        config_toml_core::persist_global_config_document_if_unchanged(
            codex_home, &snapshot, &document,
        )?;
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use toml_edit::Document;
    use uuid::Uuid;

    use super::*;
    use crate::shared::config_toml_core;
    use crate::types::CodexKeyProfile;

    fn temp_dir(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "codex-monitor-provider-config-{prefix}-{}",
            Uuid::new_v4()
        ));
        if dir.exists() {
            let _ = fs::remove_dir_all(&dir);
        }
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn profile(use_gateway: bool) -> CodexKeyProfile {
        CodexKeyProfile {
            id: "company".to_string(),
            name: "Company".to_string(),
            provider_kind: "custom".to_string(),
            key_env_var: "COMPANY_API_KEY".to_string(),
            key: "super-secret-provider-key".to_string(),
            base_url_env_var: "COMPANY_BASE_URL".to_string(),
            base_url: Some("https://api.example.com/v1".to_string()),
            model: Some("company-model".to_string()),
            context_window: Some(131_072),
            max_output_tokens: Some(8_192),
            use_gateway,
            supports_thinking: true,
            supports_reasoning_effort: true,
            last_model_refresh_at_ms: None,
            cached_models: Vec::new(),
            group_name: None,
        }
    }

    fn enabled_settings(use_gateway: bool) -> AppSettings {
        let mut settings = AppSettings::default();
        settings.sync_provider_profile_to_local_config = true;
        settings.codex_key_profiles = vec![profile(use_gateway)];
        settings.active_codex_key_profile_id = Some("company".to_string());
        settings
    }

    #[test]
    fn applies_owned_fields_without_losing_unrelated_toml_or_secrets() {
        let mut document: Document = r#"# keep this comment
approval_policy = "never"
model = "old-model"
model_context_window = 4096

[agents]
native_markdown_imported = true

[model_providers.other]
name = "Other"
base_url = "https://other.example/v1"

[model_providers.codex_monitor]
custom_field = "keep-me"
base_url = "https://old.example/v1"
"#
        .parse()
        .expect("parse fixture");

        let outcome = apply_active_provider_profile(&mut document, &enabled_settings(false))
            .expect("apply provider profile");
        let rendered = document.to_string();

        assert_eq!(outcome, ProviderConfigSyncOutcome::Updated);
        assert!(rendered.contains("# keep this comment"));
        assert!(rendered.contains("approval_policy = \"never\""));
        assert!(rendered.contains("native_markdown_imported = true"));
        assert!(rendered.contains("[model_providers.other]"));
        assert!(rendered.contains("custom_field = \"keep-me\""));
        assert!(rendered.contains("model_provider = \"codex_monitor\""));
        assert!(rendered.contains("model = \"company-model\""));
        assert!(rendered.contains("model_context_window = 131072"));
        assert!(rendered.contains("base_url = \"https://api.example.com/v1\""));
        assert!(rendered.contains("env_key = \"COMPANY_API_KEY\""));
        assert!(!rendered.contains("super-secret-provider-key"));
    }

    #[test]
    fn disabled_or_missing_active_profile_is_a_noop() {
        let original = "model = \"existing\"\n";
        let mut disabled = AppSettings::default();
        disabled.codex_key_profiles = vec![profile(false)];
        disabled.active_codex_key_profile_id = Some("company".to_string());
        let mut document = original.parse::<Document>().expect("parse");

        assert_eq!(
            apply_active_provider_profile(&mut document, &disabled).expect("disabled no-op"),
            ProviderConfigSyncOutcome::Disabled
        );
        assert_eq!(document.to_string(), original);

        let mut no_active = enabled_settings(false);
        no_active.active_codex_key_profile_id = None;
        assert_eq!(
            apply_active_provider_profile(&mut document, &no_active).expect("missing no-op"),
            ProviderConfigSyncOutcome::NoActiveProfile
        );
        assert_eq!(document.to_string(), original);
    }

    #[test]
    fn gateway_profile_is_rejected_without_mutating_document() {
        let original = "model = \"existing\"\n";
        let mut document = original.parse::<Document>().expect("parse");

        let error = apply_active_provider_profile(&mut document, &enabled_settings(true))
            .expect_err("gateway config must not be persisted");

        assert!(error.contains("gateway"));
        assert_eq!(document.to_string(), original);
    }

    #[test]
    fn opencode_profile_is_rejected_even_when_gateway_flag_is_false() {
        let original = "model = \"existing\"\n";
        let mut document = original.parse::<Document>().expect("parse");
        let mut settings = enabled_settings(false);
        settings.codex_key_profiles[0].provider_kind = "opencode".to_string();

        let error = apply_active_provider_profile(&mut document, &settings)
            .expect_err("OpenCode requires the compatibility gateway");

        assert!(error.contains("gateway"));
        assert_eq!(document.to_string(), original);
    }

    #[test]
    fn invalid_active_profile_is_rejected_without_mutating_document() {
        let original = "model = \"existing\"\n";
        for mutate in ["empty-key", "missing-base-url", "invalid-provider-table"] {
            let mut document = if mutate == "invalid-provider-table" {
                "model_providers = \"invalid\"\n"
                    .parse::<Document>()
                    .expect("parse invalid table fixture")
            } else {
                original.parse::<Document>().expect("parse")
            };
            let before = document.to_string();
            let mut settings = enabled_settings(false);
            match mutate {
                "empty-key" => settings.codex_key_profiles[0].key.clear(),
                "missing-base-url" => settings.codex_key_profiles[0].base_url = None,
                "invalid-provider-table" => {}
                _ => unreachable!(),
            }

            apply_active_provider_profile(&mut document, &settings)
                .expect_err("invalid profile or document must fail");
            assert_eq!(document.to_string(), before, "fixture: {mutate}");
        }
    }

    #[test]
    fn absent_optional_model_fields_preserve_existing_config_values() {
        let original = "model = \"user-model\"\nmodel_context_window = 65536\n";
        let mut document = original.parse::<Document>().expect("parse");
        let mut settings = enabled_settings(false);
        settings.codex_key_profiles[0].model = None;
        settings.codex_key_profiles[0].context_window = None;

        apply_active_provider_profile(&mut document, &settings).expect("apply profile");

        let rendered = document.to_string();
        assert!(rendered.contains("model = \"user-model\""));
        assert!(rendered.contains("model_context_window = 65536"));
    }

    #[test]
    fn concurrent_external_change_is_not_overwritten() {
        let codex_home = temp_dir("conflict");
        let config_path = codex_home.join("config.toml");
        fs::write(&config_path, "approval_policy = \"never\"\n").expect("seed config");
        let snapshot =
            config_toml_core::load_global_config_snapshot(&codex_home).expect("load snapshot");
        let mut document = snapshot.document.clone();
        apply_active_provider_profile(&mut document, &enabled_settings(false))
            .expect("apply provider profile");
        fs::write(&config_path, "approval_policy = \"on-request\"\n").expect("external edit");

        let error = config_toml_core::persist_global_config_document_if_unchanged(
            &codex_home,
            &snapshot,
            &document,
        )
        .expect_err("conflict must stop persistence");

        assert!(error.contains("changed since it was read"));
        assert_eq!(
            fs::read_to_string(&config_path).expect("read external config"),
            "approval_policy = \"on-request\"\n"
        );
        let _ = fs::remove_dir_all(codex_home);
    }

    #[test]
    fn successful_sync_uses_atomic_path_and_leaves_no_temp_file() {
        let codex_home = temp_dir("success");
        let config_path = codex_home.join("config.toml");
        fs::write(&config_path, "approval_policy = \"never\"\n").expect("seed config");

        let outcome =
            sync_active_provider_profile_to_local_config(&codex_home, &enabled_settings(false))
                .expect("sync config");

        assert_eq!(outcome, ProviderConfigSyncOutcome::Updated);
        let rendered = fs::read_to_string(&config_path).expect("read config");
        assert!(rendered.contains("approval_policy = \"never\""));
        assert!(rendered.contains("model_provider = \"codex_monitor\""));
        assert!(!rendered.contains("super-secret-provider-key"));
        let files = fs::read_dir(&codex_home)
            .expect("read config dir")
            .map(|entry| entry.expect("entry").file_name())
            .collect::<Vec<_>>();
        assert_eq!(files, vec![std::ffi::OsString::from("config.toml")]);
        let _ = fs::remove_dir_all(codex_home);
    }

    #[test]
    fn sync_creates_missing_config_and_is_idempotent() {
        let codex_home = temp_dir("missing");
        let settings = enabled_settings(false);

        sync_active_provider_profile_to_local_config(&codex_home, &settings)
            .expect("create config");
        let first = fs::read(codex_home.join("config.toml")).expect("read first config");
        sync_active_provider_profile_to_local_config(&codex_home, &settings).expect("repeat sync");
        let second = fs::read(codex_home.join("config.toml")).expect("read second config");

        assert_eq!(second, first);
        let _ = fs::remove_dir_all(codex_home);
    }
}

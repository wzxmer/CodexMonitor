use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::Duration;

use crate::shared::provider_gateway_core::{
    start_provider_gateway, ProviderGatewayConfig, ProviderGatewayShutdown,
};
use crate::types::AppSettings;

pub(crate) struct CodexKeyRuntime {
    pub(crate) env: Vec<(String, String)>,
    pub(crate) codex_args: Option<String>,
    pub(crate) provider_runtime_fingerprint: Option<String>,
    pub(crate) gateway_shutdown: Option<ProviderGatewayShutdown>,
}

fn normalize_http_url(
    raw_url: &str,
    invalid_message: &str,
    scheme_message: &str,
) -> Result<reqwest::Url, String> {
    let trimmed = raw_url.trim();
    let normalized = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = reqwest::Url::parse(&normalized).map_err(|_| invalid_message.to_string())?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err(scheme_message.to_string());
    }
    Ok(url)
}

fn append_url_path_segment(mut url: reqwest::Url, segment: &str) -> reqwest::Url {
    let base_path = url.path().trim_end_matches('/');
    let base_path = if base_path.is_empty() {
        "/v1"
    } else {
        base_path
    };
    url.set_path(&format!("{base_path}/{segment}"));
    url
}

pub(crate) fn build_provider_usage_url(base_url: &str) -> Result<reqwest::Url, String> {
    let parsed_base_url = normalize_http_url(
        base_url,
        "Invalid third-party provider base URL",
        "Third-party provider base URL must use HTTP or HTTPS",
    )?;
    let mut usage_url = append_url_path_segment(parsed_base_url, "usage");
    usage_url.set_query(None);
    usage_url.set_fragment(None);
    Ok(usage_url)
}

pub(crate) fn build_provider_models_url(base_url: &str) -> Result<reqwest::Url, String> {
    let parsed_base_url = normalize_http_url(
        base_url,
        "Invalid provider base URL",
        "Provider base URL must use HTTP or HTTPS",
    )?;
    let mut models_url = append_url_path_segment(parsed_base_url, "models");
    models_url.set_query(None);
    models_url.set_fragment(None);
    Ok(models_url)
}

pub(crate) async fn provider_model_list_core(
    base_url: String,
    api_key: String,
) -> Result<Value, String> {
    let base_url = base_url.trim();
    let api_key = api_key.trim();
    if base_url.is_empty() || api_key.is_empty() {
        return Err("Provider base URL and key are required".to_string());
    }

    let models_url = build_provider_models_url(base_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "Failed to initialize provider model client".to_string())?;
    let response = client
        .get(models_url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|_| "Failed to fetch provider models".to_string())?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Provider API key was rejected".to_string());
    }
    if !response.status().is_success() {
        return Err("Provider model list request was rejected".to_string());
    }
    let body = response
        .text()
        .await
        .map_err(|_| "Failed to read provider model response".to_string())?;
    serde_json::from_str(&body).map_err(|_| "Failed to parse provider model response".to_string())
}

pub(crate) async fn third_party_key_usage_core(
    base_url: String,
    api_key: String,
    timezone: Option<String>,
) -> Result<Value, String> {
    let base_url = base_url.trim();
    let api_key = api_key.trim();
    if base_url.is_empty() || api_key.is_empty() {
        return Err("Third-party provider base URL and key are required".to_string());
    }

    let mut usage_url = normalize_http_url(
        base_url,
        "Invalid third-party provider base URL",
        "Third-party provider base URL must use HTTP or HTTPS",
    )?;
    usage_url.set_query(None);
    usage_url.set_fragment(None);
    usage_url
        .query_pairs_mut()
        .append_pair("period", "today")
        .append_pair("days", "30")
        .append_pair("timezone", timezone.as_deref().unwrap_or("UTC"));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Failed to initialize third-party key usage client".to_string())?;
    let response = client
        .get(usage_url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|_| "Failed to fetch third-party key usage".to_string())?;
    if !response.status().is_success() {
        return Err("Third-party key usage request was rejected".to_string());
    }
    let body = response
        .text()
        .await
        .map_err(|_| "Failed to read third-party key usage response".to_string())?;
    serde_json::from_str(&body)
        .map_err(|_| "Failed to parse third-party key usage response".to_string())
}

pub(crate) async fn active_codex_key_runtime(
    settings: &AppSettings,
    codex_args: Option<String>,
) -> Result<CodexKeyRuntime, String> {
    let Some(active_id) = settings
        .active_codex_key_profile_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(CodexKeyRuntime {
            env: Vec::new(),
            codex_args,
            provider_runtime_fingerprint: None,
            gateway_shutdown: None,
        });
    };
    let Some(profile) = settings
        .codex_key_profiles
        .iter()
        .find(|profile| profile.id == active_id)
    else {
        return Ok(CodexKeyRuntime {
            env: Vec::new(),
            codex_args,
            provider_runtime_fingerprint: None,
            gateway_shutdown: None,
        });
    };
    let key = profile.key.trim();
    if key.is_empty() {
        return Ok(CodexKeyRuntime {
            env: Vec::new(),
            codex_args,
            provider_runtime_fingerprint: None,
            gateway_shutdown: None,
        });
    }
    let provider_runtime_fingerprint = Some(profile_runtime_fingerprint(profile));
    let codex_args = merge_profile_codex_args(codex_args, profile)?;
    let base_url = resolve_profile_base_url(profile);
    if profile.use_gateway && base_url.is_none() {
        return Err("Gateway profiles require a provider base URL".to_string());
    }
    if profile.use_gateway {
        let base_url = base_url.as_deref().unwrap_or_default();
        let gateway = start_provider_gateway(ProviderGatewayConfig {
            upstream_base_url: base_url.to_string(),
            upstream_api_key: key.to_string(),
            max_output_tokens: profile.max_output_tokens,
        })
        .await?;
        return Ok(CodexKeyRuntime {
            env: vec![
                ("OPENAI_API_KEY".to_string(), gateway.access_token),
                ("OPENAI_BASE_URL".to_string(), gateway.base_url),
            ],
            codex_args,
            provider_runtime_fingerprint,
            gateway_shutdown: Some(gateway.shutdown),
        });
    }
    let mut env = vec![(profile.key_env_var.trim().to_string(), key.to_string())];
    if let Some(base_url) = base_url {
        env.push((profile.base_url_env_var.trim().to_string(), base_url));
    }
    Ok(CodexKeyRuntime {
        env,
        codex_args,
        provider_runtime_fingerprint,
        gateway_shutdown: None,
    })
}

pub(crate) fn active_profile_runtime_fingerprint(settings: &AppSettings) -> Option<String> {
    let active_id = settings
        .active_codex_key_profile_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let profile = settings
        .codex_key_profiles
        .iter()
        .find(|profile| profile.id == active_id && !profile.key.trim().is_empty())?;
    Some(profile_runtime_fingerprint(profile))
}

pub(crate) fn active_profile_codex_args(
    settings: &AppSettings,
    codex_args: Option<String>,
) -> Result<Option<String>, String> {
    let Some(active_id) = settings
        .active_codex_key_profile_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(codex_args);
    };
    let Some(profile) = settings
        .codex_key_profiles
        .iter()
        .find(|profile| profile.id == active_id && !profile.key.trim().is_empty())
    else {
        return Ok(codex_args);
    };
    merge_profile_codex_args(codex_args, profile)
}

pub(crate) fn resolve_profile_base_url(profile: &crate::types::CodexKeyProfile) -> Option<String> {
    profile
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(
            || match profile.provider_kind.trim().to_ascii_lowercase().as_str() {
                "openai" => Some("https://api.openai.com/v1".to_string()),
                "deepseek" => Some("https://api.deepseek.com/v1".to_string()),
                "openrouter" => Some("https://openrouter.ai/api/v1".to_string()),
                _ => None,
            },
        )
}

fn profile_runtime_fingerprint(profile: &crate::types::CodexKeyProfile) -> String {
    fn update_field(hasher: &mut Sha256, value: &str) {
        hasher.update(value.len().to_le_bytes());
        hasher.update(value.as_bytes());
    }

    let mut hasher = Sha256::new();
    update_field(&mut hasher, profile.id.trim());
    update_field(&mut hasher, profile.provider_kind.trim());
    update_field(&mut hasher, profile.key_env_var.trim());
    update_field(&mut hasher, profile.key.trim());
    update_field(&mut hasher, profile.base_url_env_var.trim());
    update_field(
        &mut hasher,
        resolve_profile_base_url(profile)
            .as_deref()
            .unwrap_or_default(),
    );
    update_field(
        &mut hasher,
        profile.model.as_deref().map(str::trim).unwrap_or_default(),
    );
    update_field(
        &mut hasher,
        &profile.context_window.unwrap_or_default().to_string(),
    );
    update_field(
        &mut hasher,
        &profile.max_output_tokens.unwrap_or_default().to_string(),
    );
    update_field(&mut hasher, if profile.use_gateway { "1" } else { "0" });
    format!("{:x}", hasher.finalize())
}

fn merge_profile_codex_args(
    codex_args: Option<String>,
    profile: &crate::types::CodexKeyProfile,
) -> Result<Option<String>, String> {
    let mut args = crate::codex::args::parse_codex_args(codex_args.as_deref())?;
    if let Some(model) = profile
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        args.push("-c".to_string());
        args.push(format!("model={model}"));
    }
    if let Some(context_window) = profile.context_window.filter(|value| *value > 0) {
        args.push("-c".to_string());
        args.push(format!("model_context_window={context_window}"));
    }
    if args.is_empty() {
        Ok(None)
    } else {
        Ok(Some(shell_words::join(args)))
    }
}

#[cfg(test)]
mod tests {
    use super::{active_codex_key_runtime, build_provider_models_url, build_provider_usage_url};
    use crate::codex::args::parse_codex_args;
    use crate::types::{AppSettings, CodexKeyProfile};

    #[test]
    fn provider_models_url_preserves_explicit_api_path() {
        let url = build_provider_models_url("https://openrouter.ai/api/v1/")
            .expect("models url")
            .to_string();

        assert_eq!(url, "https://openrouter.ai/api/v1/models");
    }

    #[test]
    fn provider_models_url_defaults_bare_host_to_v1() {
        let url = build_provider_models_url("api.deepseek.com")
            .expect("models url")
            .to_string();

        assert_eq!(url, "https://api.deepseek.com/v1/models");
    }

    #[test]
    fn provider_usage_url_preserves_explicit_api_path() {
        let url = build_provider_usage_url("https://fcodex.top/v1/")
            .expect("usage url")
            .to_string();

        assert_eq!(url, "https://fcodex.top/v1/usage");
    }

    #[test]
    fn active_codex_key_runtime_env_uses_gateway_without_codex_home() {
        let mut settings = AppSettings::default();
        settings.codex_key_profiles = vec![CodexKeyProfile {
            id: "gateway".to_string(),
            name: "Gateway".to_string(),
            provider_kind: "deepseek".to_string(),
            key_env_var: "IGNORED_KEY_ENV".to_string(),
            key: "sk-provider".to_string(),
            base_url_env_var: "IGNORED_BASE_URL_ENV".to_string(),
            base_url: Some("https://api.deepseek.com/v1".to_string()),
            model: Some("deepseek-chat".to_string()),
            context_window: Some(128_000),
            max_output_tokens: None,
            use_gateway: true,
            last_model_refresh_at_ms: None,
            cached_models: Vec::new(),
            group_name: None,
            group_multiplier: None,
        }];
        settings.active_codex_key_profile_id = Some("gateway".to_string());

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_io()
            .enable_time()
            .build()
            .expect("runtime");
        let runtime_env = runtime
            .block_on(active_codex_key_runtime(
                &settings,
                Some("--profile inherited".to_string()),
            ))
            .expect("runtime env");
        let env = runtime_env.env;

        assert!(env.iter().all(|(name, _)| name != "CODEX_HOME"));
        assert!(runtime_env.gateway_shutdown.is_some());
        assert_eq!(
            parse_codex_args(runtime_env.codex_args.as_deref()).expect("merged args"),
            vec![
                "--profile",
                "inherited",
                "-c",
                "model=deepseek-chat",
                "-c",
                "model_context_window=128000"
            ]
        );
        assert!(matches!(
            env.iter()
                .find(|(name, _)| name == "OPENAI_API_KEY")
                .map(|(_, value)| value.as_str()),
            Some(value) if value.starts_with("codex-monitor-") && value != "sk-provider"
        ));
        assert!(env
            .iter()
            .find(|(name, _)| name == "OPENAI_BASE_URL")
            .map(|(_, value)| value.starts_with("http://127.0.0.1:") && value.ends_with("/v1"))
            .unwrap_or(false));
    }

    #[test]
    fn active_codex_key_runtime_uses_known_provider_default_base_url() {
        let mut settings = AppSettings::default();
        settings.codex_key_profiles = vec![CodexKeyProfile {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            provider_kind: "deepseek".to_string(),
            key_env_var: "OPENAI_API_KEY".to_string(),
            key: "sk-provider".to_string(),
            base_url_env_var: "OPENAI_BASE_URL".to_string(),
            base_url: None,
            model: None,
            context_window: None,
            max_output_tokens: None,
            use_gateway: false,
            last_model_refresh_at_ms: None,
            cached_models: Vec::new(),
            group_name: None,
            group_multiplier: None,
        }];
        settings.active_codex_key_profile_id = Some("deepseek".to_string());

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_io()
            .enable_time()
            .build()
            .expect("runtime");
        let runtime_env = runtime
            .block_on(active_codex_key_runtime(&settings, None))
            .expect("runtime env");

        assert!(runtime_env.env.contains(&(
            "OPENAI_BASE_URL".to_string(),
            "https://api.deepseek.com/v1".to_string()
        )));
    }
}

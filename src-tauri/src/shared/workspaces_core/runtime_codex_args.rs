use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::backend::app_server::WorkspaceSession;
use crate::codex::args::resolve_workspace_codex_args;
use crate::codex::home::resolve_settings_codex_home;
use crate::shared::process_core::kill_child_process_tree;
use crate::shared::provider_profiles_core::{
    active_profile_codex_args, active_profile_runtime_fingerprint,
};
use crate::types::{AppSettings, WorkspaceEntry};

use super::connect::workspace_session_spawn_lock;
use super::helpers::resolve_entry_and_parent;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceRuntimeCodexArgsResult {
    pub(crate) applied_codex_args: Option<String>,
    pub(crate) respawned: bool,
}

pub(crate) async fn set_workspace_runtime_codex_args_core<F, Fut>(
    workspace_id: String,
    codex_args_override: Option<String>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    spawn_session: F,
) -> Result<WorkspaceRuntimeCodexArgsResult, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
    let (entry, parent_entry) = resolve_entry_and_parent(workspaces, &workspace_id).await?;
    let _spawn_guard = workspace_session_spawn_lock().lock().await;

    let (default_bin, resolved_args, codex_home) = {
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, parent_entry.as_ref(), Some(&settings)),
            resolve_settings_codex_home(&settings),
        )
    };

    let target_args = codex_args_override
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or(resolved_args);
    let (effective_target_args, provider_runtime_fingerprint) = {
        let settings = app_settings.lock().await;
        (
            active_profile_codex_args(&settings, target_args.clone())?,
            active_profile_runtime_fingerprint(&settings),
        )
    };

    // If we are not connected, we can't respawn. Treat this as a no-op success; callers
    // should call again after connecting.
    let (workspace_connected, current_session) = {
        let sessions = sessions.lock().await;
        (
            sessions.contains_key(&entry.id),
            sessions.values().next().cloned(),
        )
    };
    if !workspace_connected {
        return Ok(WorkspaceRuntimeCodexArgsResult {
            applied_codex_args: target_args,
            respawned: false,
        });
    }

    let Some(current_session) = current_session else {
        return Ok(WorkspaceRuntimeCodexArgsResult {
            applied_codex_args: target_args,
            respawned: false,
        });
    };

    if current_session.codex_args == effective_target_args
        && current_session.provider_runtime_fingerprint == provider_runtime_fingerprint
    {
        return Ok(WorkspaceRuntimeCodexArgsResult {
            applied_codex_args: target_args,
            respawned: false,
        });
    }

    if !current_session.active_turns.lock().await.is_empty() {
        return Err(
            "Cannot restart the Codex runtime while another thread is processing.".to_string(),
        );
    }

    let new_session =
        spawn_session(entry.clone(), default_bin, target_args.clone(), codex_home).await?;
    let workspace_ids = {
        let mut sessions = sessions.lock().await;
        let keys: Vec<String> = sessions.keys().cloned().collect();
        for key in &keys {
            sessions.insert(key.clone(), Arc::clone(&new_session));
        }
        keys
    };
    let workspace_paths = {
        let workspaces = workspaces.lock().await;
        workspace_ids
            .iter()
            .map(|workspace_id| {
                let path = workspaces
                    .get(workspace_id)
                    .map(|entry| entry.path.clone())
                    .unwrap_or_default();
                (workspace_id.clone(), path)
            })
            .collect::<Vec<_>>()
    };
    for (workspace_id, workspace_path) in &workspace_paths {
        let path = if workspace_path.is_empty() {
            None
        } else {
            Some(workspace_path.as_str())
        };
        new_session
            .register_workspace_with_path(workspace_id, path)
            .await;
    }
    let mut child = current_session.child.lock().await;
    kill_child_process_tree(&mut child).await;

    Ok(WorkspaceRuntimeCodexArgsResult {
        applied_codex_args: target_args,
        respawned: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::process::Stdio;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use tokio::process::Command;

    use crate::types::{CodexKeyProfile, WorkspaceKind, WorkspaceSettings};

    fn make_workspace_entry(id: &str) -> WorkspaceEntry {
        WorkspaceEntry {
            id: id.to_string(),
            name: id.to_string(),
            path: "/tmp".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        }
    }

    fn make_session(_entry: WorkspaceEntry, codex_args: Option<String>) -> WorkspaceSession {
        make_session_with_provider(codex_args, None)
    }

    fn make_session_with_provider(
        codex_args: Option<String>,
        provider_runtime_fingerprint: Option<String>,
    ) -> WorkspaceSession {
        let mut cmd = if cfg!(windows) {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", "more"]);
            cmd
        } else {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", "cat"]);
            cmd
        };

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        let mut child = cmd.spawn().expect("spawn dummy child");
        let stdin = child.stdin.take().expect("dummy child stdin");

        WorkspaceSession::test_new(
            codex_args,
            provider_runtime_fingerprint,
            child,
            stdin,
            "test-owner".to_string(),
        )
    }

    #[test]
    fn set_workspace_runtime_codex_args_is_noop_when_workspace_not_connected() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let sessions = Mutex::new(HashMap::<String, Arc<WorkspaceSession>>::new());
            let app_settings = Mutex::new(AppSettings::default());

            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let result = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("  --profile dev  ".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect("core call succeeds");

            assert_eq!(
                result,
                WorkspaceRuntimeCodexArgsResult {
                    applied_codex_args: Some("--profile dev".to_string()),
                    respawned: false
                }
            );
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    fn set_workspace_runtime_codex_args_is_noop_when_args_match() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let current_session = Arc::new(make_session(entry.clone(), Some("--same".to_string())));
            let sessions = Mutex::new(HashMap::from([(entry.id.clone(), current_session)]));
            let app_settings = Mutex::new(AppSettings::default());

            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let result = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("--same".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect("core call succeeds");

            assert_eq!(
                result,
                WorkspaceRuntimeCodexArgsResult {
                    applied_codex_args: Some("--same".to_string()),
                    respawned: false
                }
            );
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    fn set_workspace_runtime_codex_args_compares_effective_profile_args() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let mut settings = AppSettings::default();
            settings.codex_key_profiles = vec![CodexKeyProfile {
                id: "profile".to_string(),
                name: "Profile".to_string(),
                provider_kind: "deepseek".to_string(),
                key_env_var: "OPENAI_API_KEY".to_string(),
                key: "sk-test".to_string(),
                base_url_env_var: "OPENAI_BASE_URL".to_string(),
                base_url: None,
                model: Some("deepseek-chat".to_string()),
                context_window: Some(128_000),
                max_output_tokens: None,
                use_gateway: false,
                supports_thinking: false,
                supports_reasoning_effort: false,
                last_model_refresh_at_ms: None,
                cached_models: Vec::new(),
                group_name: None,
            }];
            settings.active_codex_key_profile_id = Some("profile".to_string());
            let effective_args =
                active_profile_codex_args(&settings, Some("--profile inherited".to_string()))
                    .expect("effective args");
            let provider_runtime_fingerprint = active_profile_runtime_fingerprint(&settings);
            let current_session = Arc::new(make_session_with_provider(
                effective_args,
                provider_runtime_fingerprint,
            ));
            let sessions = Mutex::new(HashMap::from([(entry.id.clone(), current_session)]));
            let app_settings = Mutex::new(settings);
            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let result = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("--profile inherited".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect("core call succeeds");

            assert_eq!(
                result,
                WorkspaceRuntimeCodexArgsResult {
                    applied_codex_args: Some("--profile inherited".to_string()),
                    respawned: false
                }
            );
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    fn set_workspace_runtime_codex_args_respawns_when_profile_key_changes() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let mut settings = AppSettings::default();
            settings.codex_key_profiles = vec![CodexKeyProfile {
                id: "profile".to_string(),
                name: "Profile".to_string(),
                provider_kind: "deepseek".to_string(),
                key_env_var: "OPENAI_API_KEY".to_string(),
                key: "sk-old".to_string(),
                base_url_env_var: "OPENAI_BASE_URL".to_string(),
                base_url: None,
                model: Some("deepseek-chat".to_string()),
                context_window: Some(128_000),
                max_output_tokens: None,
                use_gateway: false,
                supports_thinking: false,
                supports_reasoning_effort: false,
                last_model_refresh_at_ms: None,
                cached_models: Vec::new(),
                group_name: None,
            }];
            settings.active_codex_key_profile_id = Some("profile".to_string());
            let effective_args =
                active_profile_codex_args(&settings, Some("--profile inherited".to_string()))
                    .expect("effective args");
            let old_fingerprint = active_profile_runtime_fingerprint(&settings);
            let current_session =
                Arc::new(make_session_with_provider(effective_args, old_fingerprint));
            let sessions = Mutex::new(HashMap::from([(entry.id.clone(), current_session)]));
            settings.codex_key_profiles[0].key = "sk-new".to_string();
            let app_settings = Mutex::new(settings);
            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let result = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("--profile inherited".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect("core call succeeds");

            assert_eq!(
                result,
                WorkspaceRuntimeCodexArgsResult {
                    applied_codex_args: Some("--profile inherited".to_string()),
                    respawned: true
                }
            );
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 1);
        });
    }

    #[test]
    fn set_workspace_runtime_codex_args_respawns_when_args_change() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let current_session = Arc::new(make_session(entry.clone(), Some("--old".to_string())));
            let sessions = Mutex::new(HashMap::from([(entry.id.clone(), current_session)]));
            let app_settings = Mutex::new(AppSettings::default());

            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let result = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("--new".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect("core call succeeds");

            assert_eq!(
                result,
                WorkspaceRuntimeCodexArgsResult {
                    applied_codex_args: Some("--new".to_string()),
                    respawned: true
                }
            );
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 1);

            let next = sessions
                .lock()
                .await
                .get(&entry.id)
                .expect("session updated")
                .codex_args
                .clone();
            assert_eq!(next, Some("--new".to_string()));
        });
    }

    #[test]
    fn set_workspace_runtime_codex_args_does_not_respawn_during_active_turn() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let current_session = Arc::new(make_session(entry.clone(), Some("--old".to_string())));
            current_session
                .active_turns
                .lock()
                .await
                .insert("thread-2".to_string(), "turn-2".to_string());
            let sessions = Mutex::new(HashMap::from([(entry.id.clone(), current_session)]));
            let app_settings = Mutex::new(AppSettings::default());
            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let error = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("--new".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect_err("active turn blocks runtime restart");

            assert!(error.contains("another thread is processing"));
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 0);
        });
    }
}

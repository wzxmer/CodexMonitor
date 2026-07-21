use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

const KNOWLEDGE_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_QUERY_CHARS: usize = 4000;
const MAX_RAW_SNAPSHOT_CHARS: usize = 12000;
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KnowledgeIntakeCaptureRequest {
    pub(crate) project_id: String,
    pub(crate) raw_snapshot: String,
    pub(crate) source_session: String,
    pub(crate) source_turn: String,
    pub(crate) risk: String,
    pub(crate) sensitivity: String,
    pub(crate) idempotency_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KnowledgeTaskInitRequest {
    pub(crate) project_id: String,
    pub(crate) scale: String,
    pub(crate) risk: String,
    pub(crate) authorization_scope: String,
    pub(crate) idempotency_key: String,
    pub(crate) intake_id: Option<String>,
    pub(crate) work_item_path: Option<String>,
    pub(crate) capability_id: Option<String>,
    pub(crate) module_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KnowledgeAdapterStatus {
    availability: String,
    root: Option<String>,
    view_state: Option<String>,
    view_revision: Option<String>,
    ledger_integrity: Option<String>,
    runtime_integrity: Option<String>,
    diagnostic: Option<String>,
    usage_visibility: String,
}

fn knowledge_root() -> Option<PathBuf> {
    std::env::var_os("DEV_KNOWLEDGE_BASE")
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .or_else(|| {
            let fallback = PathBuf::from(r"D:\DevKnowledgeBase");
            fallback.is_dir().then_some(fallback)
        })
}

fn parse_json_output(stdout: &[u8]) -> Result<Value, String> {
    let output = String::from_utf8_lossy(stdout);
    let start = output
        .find('{')
        .ok_or_else(|| "knowledge CLI returned no JSON object".to_string())?;
    serde_json::from_str(&output[start..])
        .map_err(|error| format!("knowledge CLI returned invalid JSON: {error}"))
}

async fn run_knowledge(root: &Path, args: &[String]) -> Result<Value, String> {
    let script = root.join("tools").join("kb.py");
    if !script.is_file() {
        return Err("knowledge CLI is unavailable".to_string());
    }
    let mut command = if cfg!(windows) {
        let mut command = Command::new("py");
        command.arg("-3.14").arg(&script);
        command
    } else {
        let mut command = Command::new("python3");
        command.arg(&script);
        command
    };
    command
        .arg("--root")
        .arg(root)
        .arg("--json")
        .args(args)
        .kill_on_drop(true);
    let output = timeout(KNOWLEDGE_TIMEOUT, command.output())
        .await
        .map_err(|_| "knowledge CLI timed out".to_string())?
        .map_err(|error| format!("knowledge CLI could not start: {error}"))?;
    let value = parse_json_output(&output.stdout)?;
    if !output.status.success() || value.get("ok").and_then(Value::as_bool) != Some(true) {
        let message = value
            .get("diagnostic")
            .and_then(|diagnostic| diagnostic.get("message"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| String::from_utf8_lossy(&output.stderr).trim().to_string());
        return Err(if message.is_empty() {
            format!("knowledge CLI exited with {}", output.status)
        } else {
            message
        });
    }
    Ok(value)
}

async fn run_knowledge_request(
    root: &Path,
    prefix: &str,
    payload: &Value,
    command_args: &[&str],
) -> Result<Value, String> {
    let request_dir = root.join(".knowledge-state").join("client-requests");
    tokio::fs::create_dir_all(&request_dir)
        .await
        .map_err(|error| format!("knowledge request directory could not be created: {error}"))?;
    let sequence = REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let request_path = request_dir.join(format!("{prefix}-{}-{sequence}.json", std::process::id()));
    let content = serde_json::to_vec(payload)
        .map_err(|error| format!("knowledge request could not be serialized: {error}"))?;
    tokio::fs::write(&request_path, content)
        .await
        .map_err(|error| format!("knowledge request could not be written: {error}"))?;

    let mut args = command_args
        .iter()
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
    args.push("--file".to_string());
    args.push(request_path.to_string_lossy().to_string());
    let result = run_knowledge(root, &args).await;
    let cleanup = tokio::fs::remove_file(&request_path).await;
    match (result, cleanup) {
        (Ok(value), Ok(())) => Ok(value),
        (Ok(_), Err(error)) => Err(format!("knowledge request cleanup failed: {error}")),
        (Err(error), Ok(())) => Err(error),
        (Err(error), Err(cleanup_error)) => Err(format!(
            "{error}; knowledge request cleanup failed: {cleanup_error}"
        )),
    }
}

fn unavailable(diagnostic: String) -> Result<Value, String> {
    serde_json::to_value(KnowledgeAdapterStatus {
        availability: "unavailable".to_string(),
        root: None,
        view_state: None,
        view_revision: None,
        ledger_integrity: None,
        runtime_integrity: None,
        diagnostic: Some(diagnostic),
        usage_visibility: "unknown".to_string(),
    })
    .map_err(|error| error.to_string())
}

pub(crate) async fn knowledge_status_core() -> Result<Value, String> {
    let Some(root) = knowledge_root() else {
        return unavailable("DevKnowledgeBase is unavailable".to_string());
    };
    let wiki = match run_knowledge(&root, &["wiki".into(), "status".into()]).await {
        Ok(value) => value,
        Err(error) => return unavailable(error),
    };
    let audit = match run_knowledge(&root, &["audit".into()]).await {
        Ok(value) => value,
        Err(error) => return unavailable(error),
    };
    let wiki_data = wiki.get("data").unwrap_or(&Value::Null);
    let audit_data = audit.get("data").unwrap_or(&Value::Null);
    let view_state = wiki_data
        .get("state")
        .and_then(Value::as_str)
        .map(str::to_string);
    let healthy = matches!(
        view_state.as_deref(),
        Some("current" | "stale" | "possibly_stale")
    ) && audit_data.get("valid").and_then(Value::as_bool) == Some(true);
    serde_json::to_value(KnowledgeAdapterStatus {
        availability: if healthy { "ready" } else { "degraded" }.to_string(),
        root: Some(root.to_string_lossy().to_string()),
        view_state,
        view_revision: wiki_data
            .get("manifest_hash")
            .and_then(Value::as_str)
            .map(str::to_string),
        ledger_integrity: audit_data
            .get("ledger")
            .and_then(|value| value.get("integrity"))
            .and_then(Value::as_str)
            .map(str::to_string),
        runtime_integrity: audit_data
            .get("runtime")
            .and_then(|value| value.get("integrity"))
            .and_then(Value::as_str)
            .map(str::to_string),
        diagnostic: None,
        usage_visibility: "unknown".to_string(),
    })
    .map_err(|error| error.to_string())
}

fn valid_project_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn valid_relative_path(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty()
        && value.len() <= 500
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn validate_risk(value: &str) -> bool {
    matches!(value, "low" | "medium" | "high" | "critical")
}

pub(crate) async fn knowledge_query_core(
    query: String,
    project_id: Option<String>,
) -> Result<Value, String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > MAX_QUERY_CHARS {
        return Err("knowledge query must contain 1 to 4000 characters".to_string());
    }
    if project_id
        .as_deref()
        .is_some_and(|value| !value.is_empty() && !valid_project_id(value))
    {
        return Err("knowledge project ID contains unsupported characters".to_string());
    }
    let root = knowledge_root().ok_or_else(|| "DevKnowledgeBase is unavailable".to_string())?;
    let mut args = vec![
        "assistant".to_string(),
        "ask".to_string(),
        "--question".to_string(),
        query.to_string(),
        "--max-results".to_string(),
        "8".to_string(),
        "--semantic".to_string(),
        "auto".to_string(),
    ];
    if let Some(project_id) = project_id.filter(|value| !value.is_empty()) {
        args.push("--project".to_string());
        args.push(project_id);
    }
    let value = run_knowledge(&root, &args).await?;
    Ok(value.get("data").cloned().unwrap_or(Value::Null))
}

pub(crate) async fn knowledge_intake_capture_core(
    input: KnowledgeIntakeCaptureRequest,
) -> Result<Value, String> {
    if !valid_project_id(&input.project_id) {
        return Err("knowledge project ID contains unsupported characters".to_string());
    }
    let raw_snapshot = input.raw_snapshot.trim();
    if raw_snapshot.is_empty() || raw_snapshot.chars().count() > MAX_RAW_SNAPSHOT_CHARS {
        return Err("knowledge intake must contain 1 to 12000 characters".to_string());
    }
    if !validate_risk(&input.risk) {
        return Err("knowledge intake risk is invalid".to_string());
    }
    if !matches!(
        input.sensitivity.as_str(),
        "public" | "internal" | "private"
    ) {
        return Err("knowledge intake sensitivity is invalid".to_string());
    }
    if !valid_identifier(&input.idempotency_key)
        || input.source_session.trim().is_empty()
        || input.source_session.len() > 256
        || input.source_turn.trim().is_empty()
        || input.source_turn.len() > 256
    {
        return Err("knowledge intake source or idempotency metadata is invalid".to_string());
    }
    let root = knowledge_root().ok_or_else(|| "DevKnowledgeBase is unavailable".to_string())?;
    let payload = json!({
        "project_id": input.project_id,
        "raw_snapshot": raw_snapshot,
        "source_kind": "codex-monitor-client",
        "source_session": input.source_session,
        "source_turn": input.source_turn,
        "risk": input.risk,
        "sensitivity": input.sensitivity,
        "idempotency_key": input.idempotency_key,
    });
    let value = run_knowledge_request(&root, "intake", &payload, &["intake", "capture"]).await?;
    Ok(value.get("data").cloned().unwrap_or(Value::Null))
}

pub(crate) async fn knowledge_task_init_core(
    input: KnowledgeTaskInitRequest,
) -> Result<Value, String> {
    if !valid_project_id(&input.project_id) {
        return Err("knowledge project ID contains unsupported characters".to_string());
    }
    if !matches!(input.scale.as_str(), "S" | "M" | "L") || !validate_risk(&input.risk) {
        return Err("knowledge task scale or risk is invalid".to_string());
    }
    if input.authorization_scope.trim().is_empty() || input.authorization_scope.len() > 1000 {
        return Err("knowledge task authorization scope is invalid".to_string());
    }
    if !valid_identifier(&input.idempotency_key)
        || input
            .intake_id
            .as_deref()
            .is_some_and(|value| !valid_identifier(value))
        || input
            .capability_id
            .as_deref()
            .is_some_and(|value| !valid_identifier(value))
        || input
            .module_id
            .as_deref()
            .is_some_and(|value| !valid_identifier(value))
        || input
            .work_item_path
            .as_deref()
            .is_some_and(|value| !valid_relative_path(value))
    {
        return Err("knowledge task reference or idempotency metadata is invalid".to_string());
    }
    let root = knowledge_root().ok_or_else(|| "DevKnowledgeBase is unavailable".to_string())?;
    let payload = json!({
        "project_id": input.project_id,
        "scale": input.scale,
        "risk": input.risk,
        "authorization_scope": input.authorization_scope,
        "idempotency_key": input.idempotency_key,
        "intake_id": input.intake_id,
        "work_item_path": input.work_item_path,
        "capability_id": input.capability_id,
        "module_id": input.module_id,
    });
    let value = run_knowledge_request(&root, "task", &payload, &["task", "init"]).await?;
    Ok(value.get("data").cloned().unwrap_or(Value::Null))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_query_inputs() {
        assert!(valid_project_id("codex-monitor"));
        assert!(!valid_project_id("bad & project"));
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        assert!(runtime
            .block_on(knowledge_query_core(" ".to_string(), None))
            .is_err());
    }

    #[test]
    fn validates_write_request_boundaries() {
        assert!(valid_identifier("codex-monitor-request-1"));
        assert!(!valid_identifier("bad/request"));
        assert!(!valid_project_id(""));
        assert!(valid_relative_path("20-项目知识/ThreadFleet/工作项台账.md"));
        assert!(!valid_relative_path("../outside.md"));
        assert!(validate_risk("critical"));
        assert!(!validate_risk("unknown"));
    }
}

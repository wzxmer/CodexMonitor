use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::time::timeout;

use crate::types::WorkspaceEntry;

const WORKFLOW_GATE_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowGateProjection {
    schema_version: u64,
    workflow_id: String,
    project_id: Option<String>,
    workspace: String,
    task_id: Option<String>,
    work_item_path: Option<String>,
    status: String,
    stage: String,
    revision: u64,
    plan_id: Option<String>,
    plan_revision: Option<u64>,
    plan_review_status: Option<String>,
    implementation_review_status: Option<String>,
    token_visibility: Option<String>,
    credit_visibility: Option<String>,
    audit_valid: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowGateAdapterStatus {
    enforcement_level: String,
    state_source: String,
    workflow_id: String,
    projection: Option<WorkflowGateProjection>,
    diagnostic: Option<String>,
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

fn valid_workflow_id(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphanumeric())
        && value.len() <= 160
        && chars.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn normalized_workspace(path: &Path) -> String {
    let resolved = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let normalized = resolved.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

fn string_field(value: &Value, name: &str) -> Option<String> {
    value.get(name)?.as_str().map(str::to_string)
}

fn status_projection(value: &Value) -> Result<WorkflowGateProjection, String> {
    let (state, audit_valid) = if let Some(root) = value.get("root") {
        (
            root,
            value
                .get("audit")
                .and_then(|audit| audit.get("valid"))
                .and_then(Value::as_bool),
        )
    } else {
        (value, None)
    };
    let usage_visibility = state.get("usage_visibility");
    Ok(WorkflowGateProjection {
        schema_version: state
            .get("schema_version")
            .and_then(Value::as_u64)
            .ok_or_else(|| "WorkflowGate status is missing schema_version".to_string())?,
        workflow_id: string_field(state, "workflow_id")
            .ok_or_else(|| "WorkflowGate status is missing workflow_id".to_string())?,
        project_id: string_field(state, "project_id"),
        workspace: string_field(state, "workspace")
            .ok_or_else(|| "WorkflowGate status is missing workspace".to_string())?,
        task_id: string_field(state, "task_id"),
        work_item_path: string_field(state, "work_item_path"),
        status: string_field(state, "status")
            .ok_or_else(|| "WorkflowGate status is missing status".to_string())?,
        stage: string_field(state, "stage")
            .ok_or_else(|| "WorkflowGate status is missing stage".to_string())?,
        revision: state
            .get("revision")
            .and_then(Value::as_u64)
            .ok_or_else(|| "WorkflowGate status is missing revision".to_string())?,
        plan_id: string_field(state, "plan_id"),
        plan_revision: state.get("plan_revision").and_then(Value::as_u64),
        plan_review_status: state
            .get("plan_review")
            .and_then(|review| string_field(review, "status")),
        implementation_review_status: state
            .get("implementation_review")
            .and_then(|review| string_field(review, "status")),
        token_visibility: usage_visibility
            .and_then(|usage| string_field(usage, "tokens"))
            .or_else(|| string_field(state, "budget_usage_visibility")),
        credit_visibility: usage_visibility.and_then(|usage| string_field(usage, "credits")),
        audit_valid,
    })
}

fn parse_json_output(stdout: &[u8]) -> Result<Value, String> {
    let output = String::from_utf8_lossy(stdout);
    let start = output
        .find('{')
        .ok_or_else(|| "WorkflowGate returned no JSON object".to_string())?;
    serde_json::from_str(&output[start..])
        .map_err(|error| format!("WorkflowGate returned invalid JSON: {error}"))
}

async fn run_workflow_gate(root: &Path, args: &[&str]) -> Result<Value, String> {
    let mut command = if cfg!(windows) {
        let mut command = Command::new("cmd.exe");
        command
            .arg("/D")
            .arg("/C")
            .arg(root.join("tools").join("WorkflowGate.cmd"));
        command
    } else {
        let mut command = Command::new("python3");
        command.arg(root.join("tools").join("workflow_gate.py"));
        command
    };
    command
        .arg("--knowledge-root")
        .arg(root)
        .args(args)
        .kill_on_drop(true);
    let output = timeout(WORKFLOW_GATE_TIMEOUT, command.output())
        .await
        .map_err(|_| "WorkflowGate status timed out".to_string())?
        .map_err(|error| format!("WorkflowGate could not start: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "WorkflowGate exited with {}: {}{}",
            output.status,
            stderr.trim(),
            stdout.trim()
        ));
    }
    parse_json_output(&output.stdout)
}

async fn query_workflow_gate(root: &Path, workflow_id: &str) -> Result<Value, String> {
    match run_workflow_gate(
        root,
        &["--json", "status", "--workflow", workflow_id, "--no-sync"],
    )
    .await
    {
        Ok(value) => Ok(value),
        Err(status_error) => {
            run_workflow_gate(root, &["--json", "tree-status", "--root", workflow_id])
                .await
                .map_err(|tree_error| format!("{status_error}; {tree_error}"))
        }
    }
}

fn unsupported(workflow_id: String, diagnostic: String) -> WorkflowGateAdapterStatus {
    WorkflowGateAdapterStatus {
        enforcement_level: "unsupported".to_string(),
        state_source: "dev-knowledge-base".to_string(),
        workflow_id,
        projection: None,
        diagnostic: Some(diagnostic),
    }
}

pub(crate) async fn workflow_gate_status_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    workflow_id: String,
) -> Result<Value, String> {
    if !valid_workflow_id(&workflow_id) {
        return Err("workflow ID contains unsupported characters".to_string());
    }
    let workspace_path = {
        let workspaces = workspaces.lock().await;
        PathBuf::from(
            &workspaces
                .get(&workspace_id)
                .ok_or_else(|| "workspace not found".to_string())?
                .path,
        )
    };
    let root = knowledge_root();
    workflow_gate_status_for_root(root.as_deref(), &workspace_path, workflow_id).await
}

async fn workflow_gate_status_for_root(
    root: Option<&Path>,
    workspace_path: &Path,
    workflow_id: String,
) -> Result<Value, String> {
    let Some(root) = root else {
        return serde_json::to_value(unsupported(
            workflow_id,
            "DevKnowledgeBase is unavailable".to_string(),
        ))
        .map_err(|error| error.to_string());
    };
    let tool_path = if cfg!(windows) {
        root.join("tools").join("WorkflowGate.cmd")
    } else {
        root.join("tools").join("workflow_gate.py")
    };
    if !tool_path.is_file() {
        return serde_json::to_value(unsupported(
            workflow_id,
            "WorkflowGate CLI is unavailable".to_string(),
        ))
        .map_err(|error| error.to_string());
    }
    let value = match query_workflow_gate(&root, &workflow_id).await {
        Ok(value) => value,
        Err(error) => {
            return serde_json::to_value(WorkflowGateAdapterStatus {
                enforcement_level: "manual".to_string(),
                state_source: "dev-knowledge-base".to_string(),
                workflow_id,
                projection: None,
                diagnostic: Some(error),
            })
            .map_err(|error| error.to_string())
        }
    };
    let projection = status_projection(&value)?;
    if projection.workflow_id != workflow_id {
        return Err("WorkflowGate returned a different workflow ID".to_string());
    }
    if normalized_workspace(Path::new(&projection.workspace))
        != normalized_workspace(workspace_path)
    {
        return serde_json::to_value(WorkflowGateAdapterStatus {
            enforcement_level: "manual".to_string(),
            state_source: "dev-knowledge-base".to_string(),
            workflow_id,
            projection: Some(projection),
            diagnostic: Some(
                "WorkflowGate workspace does not match the selected workspace".to_string(),
            ),
        })
        .map_err(|error| error.to_string());
    }
    let audit_invalid = projection.audit_valid == Some(false);
    let normalized_status = projection.status.to_ascii_lowercase();
    let inactive = normalized_status != "active";
    serde_json::to_value(WorkflowGateAdapterStatus {
        enforcement_level: if audit_invalid || inactive {
            "manual"
        } else {
            "gated"
        }
        .to_string(),
        state_source: "dev-knowledge-base".to_string(),
        workflow_id,
        projection: Some(projection),
        diagnostic: if audit_invalid {
            Some("WorkflowGate tree audit is invalid".to_string())
        } else if matches!(normalized_status.as_str(), "completed" | "failed") {
            Some("WorkflowGate has ended and cannot be bound".to_string())
        } else if inactive {
            Some("WorkflowGate is not active; resume or resolve it before binding".to_string())
        } else {
            None
        },
    })
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir().join(format!("codex-monitor-workflow-gate-{label}-{nonce}"))
    }

    #[test]
    fn rejects_unsafe_workflow_ids() {
        assert!(valid_workflow_id("wf-safe_1.2"));
        assert!(!valid_workflow_id("wf-bad & whoami"));
        assert!(!valid_workflow_id(""));
    }

    #[test]
    fn projects_v1_status_without_owning_state() {
        let projection = status_projection(&json!({
            "schema_version": 1,
            "workflow_id": "wf-v1",
            "project_id": "codex-monitor",
            "workspace": "D:\\Project\\CodexMonitor",
            "task_id": "task-1",
            "status": "active",
            "stage": "implementation",
            "revision": 4,
            "plan_review": {"status": "approved"},
            "implementation_review": {"status": "not_started"},
            "usage_visibility": {"tokens": "actual", "credits": "unknown"}
        }))
        .expect("projection");
        assert_eq!(projection.workflow_id, "wf-v1");
        assert_eq!(projection.plan_review_status.as_deref(), Some("approved"));
        assert_eq!(projection.token_visibility.as_deref(), Some("actual"));
        assert_eq!(projection.audit_valid, None);
    }

    #[test]
    fn projects_v2_tree_and_preserves_audit() {
        let projection = status_projection(&json!({
            "root": {
                "schema_version": 2,
                "workflow_id": "wf-v2",
                "project_id": "codex-monitor",
                "workspace": "D:\\Project\\CodexMonitor",
                "status": "active",
                "stage": "approved",
                "revision": 5,
                "plan_id": "plan-1",
                "plan_revision": 2,
                "budget_usage_visibility": "estimated"
            },
            "audit": {"valid": true, "errors": [], "pending_transactions": []}
        }))
        .expect("projection");
        assert_eq!(projection.schema_version, 2);
        assert_eq!(projection.plan_revision, Some(2));
        assert_eq!(projection.token_visibility.as_deref(), Some("estimated"));
        assert_eq!(projection.audit_valid, Some(true));
    }

    #[test]
    fn invokes_external_gate_and_ignores_non_json_prefix() {
        let root = temp_root("invoke");
        let tools = root.join("tools");
        std::fs::create_dir_all(&tools).expect("tools");
        if cfg!(windows) {
            std::fs::write(
                tools.join("WorkflowGate.cmd"),
                "@echo off\r\necho Active code page: 65001\r\necho {\"schema_version\":1,\"workflow_id\":\"wf-test\",\"workspace\":\"D:\\\\Project\\\\CodexMonitor\",\"status\":\"active\",\"stage\":\"test\",\"revision\":1}\r\n",
            )
            .expect("fixture");
        } else {
            std::fs::write(
                tools.join("workflow_gate.py"),
                "print('prefix')\nprint('{\"schema_version\":1,\"workflow_id\":\"wf-test\",\"workspace\":\"/tmp/project\",\"status\":\"active\",\"stage\":\"test\",\"revision\":1}')\n",
            )
            .expect("fixture");
        }

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let workspace = if cfg!(windows) {
            PathBuf::from(r"D:\Project\CodexMonitor")
        } else {
            PathBuf::from("/tmp/project")
        };
        let result = runtime
            .block_on(workflow_gate_status_for_root(
                Some(&root),
                &workspace,
                "wf-test".to_string(),
            ))
            .expect("external gate result");
        assert_eq!(result["enforcementLevel"], "gated");
        assert_eq!(result["projection"]["workflowId"], "wf-test");

        if cfg!(windows) {
            std::fs::write(
                tools.join("WorkflowGate.cmd"),
                "@echo off\r\necho {\"schema_version\":1,\"workflow_id\":\"wf-test\",\"workspace\":\"D:\\\\Project\\\\CodexMonitor\",\"status\":\"blocked\",\"stage\":\"test\",\"revision\":2}\r\n",
            )
            .expect("blocked fixture");
        } else {
            std::fs::write(
                tools.join("workflow_gate.py"),
                "print('{\"schema_version\":1,\"workflow_id\":\"wf-test\",\"workspace\":\"/tmp/project\",\"status\":\"blocked\",\"stage\":\"test\",\"revision\":2}')\n",
            )
            .expect("blocked fixture");
        }
        let blocked = runtime
            .block_on(workflow_gate_status_for_root(
                Some(&root),
                &workspace,
                "wf-test".to_string(),
            ))
            .expect("blocked workflow result");
        assert_eq!(blocked["enforcementLevel"], "manual");

        let mismatch = runtime
            .block_on(workflow_gate_status_for_root(
                Some(&root),
                Path::new("C:/other-workspace"),
                "wf-test".to_string(),
            ))
            .expect("workspace mismatch result");
        assert_eq!(mismatch["enforcementLevel"], "manual");

        let unsupported = runtime
            .block_on(workflow_gate_status_for_root(
                None,
                &workspace,
                "wf-test".to_string(),
            ))
            .expect("unsupported result");
        assert_eq!(unsupported["enforcementLevel"], "unsupported");
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}

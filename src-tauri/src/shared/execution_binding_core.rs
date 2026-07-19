use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::shared::execution_router_core::{
    audit_binding, ShadowActualBinding, ShadowApprovedPlanRef, ShadowBindingAudit,
    ShadowBindingAuditStatus, ShadowBindingContext, ShadowExpectedBinding, ShadowProviderContext,
};

const SIDECAR_VERSION: u32 = 1;
const RECORD_SCHEMA_VERSION: u32 = 1;
const DEFAULT_MAX_PER_PARENT: usize = 128;
const DEFAULT_MAX_TOTAL: usize = 4_096;
const MAX_BINDING_LIFETIME_MS: u64 = 24 * 60 * 60 * 1_000;
const SIDECAR_FILE: &str = "execution-binding-shadow.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionBindingStatus {
    AwaitingExpected,
    AwaitingActual,
    Matched,
    Mismatch,
    InvalidExpected,
    Stale,
    Conflict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionBindingReasonCode {
    BindingExpired,
    PlanRevisionStale,
    RegistrationConflict,
    ActualBindingConflict,
    SenderThreadMismatch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionBindingRecord {
    pub schema_version: u32,
    pub workspace_id: String,
    pub parent_thread_id: String,
    pub collab_tool_call_id: String,
    pub receiver_thread_ids: Vec<String>,
    pub active_plan_revision: Option<u64>,
    pub approved_plan: Option<ShadowApprovedPlanRef>,
    pub expected: Option<ShadowExpectedBinding>,
    pub provider: Option<ShadowProviderContext>,
    pub actual: Option<ShadowActualBinding>,
    pub audit: Option<ShadowBindingAudit>,
    pub status: ExecutionBindingStatus,
    pub reason_codes: Vec<ExecutionBindingReasonCode>,
    pub registered_at_ms: Option<u64>,
    pub observed_at_ms: Option<u64>,
    pub expires_at_ms: Option<u64>,
    pub record_revision: u64,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionBindingRegisterRequest {
    #[serde(default)]
    pub source_id: String,
    #[serde(default)]
    pub runtime_id: String,
    pub workspace_id: String,
    pub parent_thread_id: String,
    pub collab_tool_call_id: String,
    pub active_plan_revision: u64,
    pub approved_plan: ShadowApprovedPlanRef,
    pub expected: ShadowExpectedBinding,
    pub provider: ShadowProviderContext,
    pub registered_at_ms: u64,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionBindingObserveRequest {
    #[serde(default)]
    pub source_id: String,
    #[serde(default)]
    pub runtime_id: String,
    pub workspace_id: String,
    pub parent_thread_id: String,
    pub collab_tool_call_id: String,
    pub sender_thread_id: String,
    #[serde(default)]
    pub receiver_thread_ids: Vec<String>,
    pub actual: ShadowActualBinding,
    pub observed_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionBindingQuery {
    #[serde(default)]
    pub source_id: String,
    #[serde(default)]
    pub runtime_id: String,
    pub workspace_id: String,
    pub parent_thread_id: String,
    pub collab_tool_call_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct StoredRecord {
    source_id: String,
    runtime_id: String,
    record: ExecutionBindingRecord,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Document {
    version: u32,
    records: Vec<StoredRecord>,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            version: SIDECAR_VERSION,
            records: Vec::new(),
        }
    }
}

pub struct ExecutionBindingSidecar {
    path: PathBuf,
    max_per_parent: usize,
    max_total: usize,
}

impl ExecutionBindingSidecar {
    pub fn for_data_dir(data_dir: &Path) -> Self {
        Self::new(
            data_dir.join(SIDECAR_FILE),
            DEFAULT_MAX_PER_PARENT,
            DEFAULT_MAX_TOTAL,
        )
    }

    fn new(path: PathBuf, max_per_parent: usize, max_total: usize) -> Self {
        Self {
            path,
            max_per_parent,
            max_total,
        }
    }

    pub fn register(
        &mut self,
        input: ExecutionBindingRegisterRequest,
    ) -> Result<ExecutionBindingRecord, String> {
        validate_scope(
            &input.source_id,
            &input.runtime_id,
            &input.workspace_id,
            &input.parent_thread_id,
            &input.collab_tool_call_id,
        )?;
        if input.registered_at_ms == 0
            || input.expires_at_ms <= input.registered_at_ms
            || input.expires_at_ms - input.registered_at_ms > MAX_BINDING_LIFETIME_MS
        {
            return Err("execution binding registration lifetime is invalid".to_string());
        }

        let mut document = read_document(&self.path)?;
        let index = find_record_index(
            &document,
            &input.source_id,
            &input.runtime_id,
            &input.workspace_id,
            &input.parent_thread_id,
            &input.collab_tool_call_id,
        );
        let mut stored = index
            .map(|index| document.records.remove(index))
            .unwrap_or_else(|| StoredRecord {
                source_id: input.source_id.clone(),
                runtime_id: input.runtime_id.clone(),
                record: empty_record(
                    input.workspace_id.clone(),
                    input.parent_thread_id.clone(),
                    input.collab_tool_call_id.clone(),
                    input.registered_at_ms,
                ),
            });
        let observation_expired = stored.record.registered_at_ms.is_none()
            && stored.record.observed_at_ms.is_some()
            && stored
                .record
                .expires_at_ms
                .is_some_and(|expires_at_ms| input.registered_at_ms >= expires_at_ms);

        if let (Some(plan), Some(expected), Some(provider), Some(active_revision)) = (
            stored.record.approved_plan.as_ref(),
            stored.record.expected.as_ref(),
            stored.record.provider.as_ref(),
            stored.record.active_plan_revision,
        ) {
            if plan == &input.approved_plan
                && expected == &input.expected
                && provider == &input.provider
                && active_revision == input.active_plan_revision
                && stored.record.registered_at_ms == Some(input.registered_at_ms)
                && stored.record.expires_at_ms == Some(input.expires_at_ms)
            {
                return Ok(stored.record);
            }
            let original = stored.record.clone();
            push_unique_reason(
                &mut stored.record.reason_codes,
                ExecutionBindingReasonCode::RegistrationConflict,
            );
            stored.record.status = ExecutionBindingStatus::Conflict;
            if stored.record == original {
                return Ok(stored.record);
            }
            advance_record(&mut stored.record, input.registered_at_ms);
            document.records.push(stored.clone());
            prune(&mut document, self.max_per_parent, self.max_total);
            write_atomically(&self.path, &document)?;
            return Ok(stored.record);
        }

        stored.record.active_plan_revision = Some(input.active_plan_revision);
        stored.record.approved_plan = Some(input.approved_plan);
        stored.record.expected = Some(input.expected);
        stored.record.provider = Some(input.provider);
        stored.record.registered_at_ms = Some(input.registered_at_ms);
        stored.record.expires_at_ms = Some(input.expires_at_ms);
        if observation_expired {
            push_unique_reason(
                &mut stored.record.reason_codes,
                ExecutionBindingReasonCode::BindingExpired,
            );
            stored.record.status = ExecutionBindingStatus::Stale;
        } else if stored.record.status != ExecutionBindingStatus::Conflict {
            recompute_record(&mut stored.record, input.registered_at_ms);
        }
        advance_record(&mut stored.record, input.registered_at_ms);
        document.records.push(stored.clone());
        prune(&mut document, self.max_per_parent, self.max_total);
        write_atomically(&self.path, &document)?;
        Ok(stored.record)
    }

    pub fn observe(
        &mut self,
        input: ExecutionBindingObserveRequest,
    ) -> Result<ExecutionBindingRecord, String> {
        validate_scope(
            &input.source_id,
            &input.runtime_id,
            &input.workspace_id,
            &input.parent_thread_id,
            &input.collab_tool_call_id,
        )?;
        validate_identifier("senderThreadId", &input.sender_thread_id)?;
        for receiver in &input.receiver_thread_ids {
            validate_identifier("receiverThreadId", receiver)?;
        }
        if input.observed_at_ms == 0 {
            return Err("execution binding observedAtMs is required".to_string());
        }

        let mut document = read_document(&self.path)?;
        let index = find_record_index(
            &document,
            &input.source_id,
            &input.runtime_id,
            &input.workspace_id,
            &input.parent_thread_id,
            &input.collab_tool_call_id,
        );
        let mut stored = index
            .map(|index| document.records.remove(index))
            .unwrap_or_else(|| StoredRecord {
                source_id: input.source_id.clone(),
                runtime_id: input.runtime_id.clone(),
                record: empty_record(
                    input.workspace_id.clone(),
                    input.parent_thread_id.clone(),
                    input.collab_tool_call_id.clone(),
                    input.observed_at_ms,
                ),
            });
        let original = stored.record.clone();

        if input.sender_thread_id != stored.record.parent_thread_id {
            push_unique_reason(
                &mut stored.record.reason_codes,
                ExecutionBindingReasonCode::SenderThreadMismatch,
            );
            stored.record.status = ExecutionBindingStatus::Conflict;
        }
        merge_receivers(
            &mut stored.record.receiver_thread_ids,
            &input.receiver_thread_ids,
        );
        if merge_actual(&mut stored.record.actual, &input.actual) {
            push_unique_reason(
                &mut stored.record.reason_codes,
                ExecutionBindingReasonCode::ActualBindingConflict,
            );
            stored.record.status = ExecutionBindingStatus::Conflict;
        }
        stored.record.observed_at_ms = Some(
            stored
                .record
                .observed_at_ms
                .map_or(input.observed_at_ms, |current| {
                    current.max(input.observed_at_ms)
                }),
        );
        if stored.record.status != ExecutionBindingStatus::Conflict {
            recompute_record(&mut stored.record, input.observed_at_ms);
        }
        if stored.record == original {
            return Ok(stored.record);
        }
        advance_record(&mut stored.record, input.observed_at_ms);
        document.records.push(stored.clone());
        prune(&mut document, self.max_per_parent, self.max_total);
        write_atomically(&self.path, &document)?;
        Ok(stored.record)
    }

    pub fn list(
        &mut self,
        query: &ExecutionBindingQuery,
    ) -> Result<Vec<ExecutionBindingRecord>, String> {
        validate_scope(
            &query.source_id,
            &query.runtime_id,
            &query.workspace_id,
            &query.parent_thread_id,
            query.collab_tool_call_id.as_deref().unwrap_or("query"),
        )?;
        if let Some(call_id) = query.collab_tool_call_id.as_deref() {
            validate_identifier("collabToolCallId", call_id)?;
        }
        let mut document = read_document(&self.path)?;
        let original = document.clone();
        let now_ms = current_time_ms();
        for stored in &mut document.records {
            if stored.record.status == ExecutionBindingStatus::Conflict {
                continue;
            }
            let previous = stored.record.clone();
            recompute_record(&mut stored.record, now_ms);
            if stored.record != previous {
                advance_record(&mut stored.record, now_ms);
            }
        }
        prune(&mut document, self.max_per_parent, self.max_total);
        if document != original {
            write_atomically(&self.path, &document)?;
        }
        let mut records = document
            .records
            .into_iter()
            .filter(|stored| {
                stored.source_id == query.source_id
                    && stored.runtime_id == query.runtime_id
                    && stored.record.workspace_id == query.workspace_id
                    && stored.record.parent_thread_id == query.parent_thread_id
                    && query
                        .collab_tool_call_id
                        .as_ref()
                        .is_none_or(|call_id| &stored.record.collab_tool_call_id == call_id)
            })
            .map(|stored| stored.record)
            .collect::<Vec<_>>();
        records.sort_by(|left, right| {
            right
                .updated_at_ms
                .cmp(&left.updated_at_ms)
                .then(left.collab_tool_call_id.cmp(&right.collab_tool_call_id))
        });
        Ok(records)
    }
}

fn empty_record(
    workspace_id: String,
    parent_thread_id: String,
    collab_tool_call_id: String,
    now_ms: u64,
) -> ExecutionBindingRecord {
    ExecutionBindingRecord {
        schema_version: RECORD_SCHEMA_VERSION,
        workspace_id,
        parent_thread_id,
        collab_tool_call_id,
        receiver_thread_ids: Vec::new(),
        active_plan_revision: None,
        approved_plan: None,
        expected: None,
        provider: None,
        actual: None,
        audit: None,
        status: ExecutionBindingStatus::AwaitingExpected,
        reason_codes: Vec::new(),
        registered_at_ms: None,
        observed_at_ms: None,
        expires_at_ms: Some(now_ms.saturating_add(MAX_BINDING_LIFETIME_MS)),
        record_revision: 0,
        updated_at_ms: now_ms,
    }
}

fn recompute_record(record: &mut ExecutionBindingRecord, now_ms: u64) {
    record
        .reason_codes
        .retain(|reason| !matches!(reason, ExecutionBindingReasonCode::PlanRevisionStale));
    if record
        .reason_codes
        .contains(&ExecutionBindingReasonCode::BindingExpired)
        || record
            .expires_at_ms
            .is_some_and(|expires_at_ms| now_ms >= expires_at_ms)
    {
        push_unique_reason(
            &mut record.reason_codes,
            ExecutionBindingReasonCode::BindingExpired,
        );
        record.status = ExecutionBindingStatus::Stale;
        return;
    }
    if matches!(
        (record.active_plan_revision, record.approved_plan.as_ref()),
        (Some(active), Some(plan)) if active != plan.plan_revision
    ) {
        push_unique_reason(
            &mut record.reason_codes,
            ExecutionBindingReasonCode::PlanRevisionStale,
        );
        record.status = ExecutionBindingStatus::Stale;
        return;
    }
    let (Some(plan), Some(expected), Some(provider)) = (
        record.approved_plan.clone(),
        record.expected.clone(),
        record.provider.as_ref(),
    ) else {
        record.audit = None;
        record.status = ExecutionBindingStatus::AwaitingExpected;
        return;
    };
    let context = ShadowBindingContext {
        approved_plan: Some(plan),
        expected: Some(expected),
        actual: record.actual.clone(),
    };
    let audit = audit_binding(&context, provider);
    record.status = match audit.status {
        ShadowBindingAuditStatus::Matched => ExecutionBindingStatus::Matched,
        ShadowBindingAuditStatus::Mismatch => ExecutionBindingStatus::Mismatch,
        ShadowBindingAuditStatus::MissingEvidence => ExecutionBindingStatus::AwaitingActual,
        ShadowBindingAuditStatus::InvalidExpected => ExecutionBindingStatus::InvalidExpected,
    };
    record.audit = Some(audit);
}

fn merge_actual(current: &mut Option<ShadowActualBinding>, incoming: &ShadowActualBinding) -> bool {
    let Some(existing) = current.as_mut() else {
        *current = Some(incoming.clone());
        return false;
    };
    let mut conflict = false;
    conflict |= merge_optional_string(&mut existing.model_id, &incoming.model_id);
    conflict |= merge_optional_string(&mut existing.reasoning_effort, &incoming.reasoning_effort);
    conflict
}

fn merge_optional_string(current: &mut Option<String>, incoming: &Option<String>) -> bool {
    match (current.as_ref(), incoming.as_ref()) {
        (None, Some(value)) => {
            *current = Some(value.clone());
            false
        }
        (Some(current), Some(incoming)) => current != incoming,
        _ => false,
    }
}

fn merge_receivers(current: &mut Vec<String>, incoming: &[String]) {
    for receiver in incoming {
        if !current.contains(receiver) {
            current.push(receiver.clone());
        }
    }
}

fn advance_record(record: &mut ExecutionBindingRecord, now_ms: u64) {
    record.record_revision = record.record_revision.saturating_add(1);
    record.updated_at_ms = record.updated_at_ms.max(now_ms);
}

fn push_unique_reason(
    reasons: &mut Vec<ExecutionBindingReasonCode>,
    reason: ExecutionBindingReasonCode,
) {
    if !reasons.contains(&reason) {
        reasons.push(reason);
    }
}

fn find_record_index(
    document: &Document,
    source_id: &str,
    runtime_id: &str,
    workspace_id: &str,
    parent_thread_id: &str,
    call_id: &str,
) -> Option<usize> {
    document.records.iter().position(|stored| {
        stored.source_id == source_id
            && stored.runtime_id == runtime_id
            && stored.record.workspace_id == workspace_id
            && stored.record.parent_thread_id == parent_thread_id
            && stored.record.collab_tool_call_id == call_id
    })
}

fn validate_scope(
    source_id: &str,
    runtime_id: &str,
    workspace_id: &str,
    parent_thread_id: &str,
    call_id: &str,
) -> Result<(), String> {
    for (name, value) in [
        ("sourceId", source_id),
        ("runtimeId", runtime_id),
        ("workspaceId", workspace_id),
        ("parentThreadId", parent_thread_id),
        ("collabToolCallId", call_id),
    ] {
        validate_identifier(name, value)?;
    }
    Ok(())
}

fn validate_identifier(name: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > 512 {
        return Err(format!("execution binding {name} is invalid"));
    }
    Ok(())
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn same_parent(left: &StoredRecord, right: &StoredRecord) -> bool {
    left.source_id == right.source_id
        && left.runtime_id == right.runtime_id
        && left.record.workspace_id == right.record.workspace_id
        && left.record.parent_thread_id == right.record.parent_thread_id
}

fn prune(document: &mut Document, max_per_parent: usize, max_total: usize) {
    document.records.sort_by(|left, right| {
        right
            .record
            .updated_at_ms
            .cmp(&left.record.updated_at_ms)
            .then(
                left.record
                    .collab_tool_call_id
                    .cmp(&right.record.collab_tool_call_id),
            )
    });
    let mut retained = Vec::new();
    for record in document.records.drain(..) {
        if retained
            .iter()
            .filter(|existing| same_parent(existing, &record))
            .count()
            < max_per_parent
        {
            retained.push(record);
        }
    }
    retained.truncate(max_total);
    document.records = retained;
}

fn read_document(path: &Path) -> Result<Document, String> {
    restore_backup(path)?;
    if !path.exists() {
        return Ok(Document::default());
    }
    let data = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    if data.trim().is_empty() {
        return Ok(Document::default());
    }
    let document: Document = serde_json::from_str(&data)
        .map_err(|error| format!("Invalid execution binding sidecar: {error}"))?;
    if document.version != SIDECAR_VERSION {
        return Err(format!(
            "Unsupported execution binding sidecar version: {}",
            document.version
        ));
    }
    Ok(document)
}

fn write_atomically(path: &Path, document: &Document) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temp = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let data = serde_json::to_vec_pretty(document).map_err(|error| error.to_string())?;
    let mut temp_file = std::fs::File::create(&temp).map_err(|error| error.to_string())?;
    temp_file
        .write_all(&data)
        .map_err(|error| error.to_string())?;
    temp_file.sync_all().map_err(|error| error.to_string())?;
    drop(temp_file);
    if path.exists() {
        if backup.exists() {
            std::fs::remove_file(&backup).map_err(|error| error.to_string())?;
        }
        std::fs::rename(path, &backup).map_err(|error| error.to_string())?;
    }
    match std::fs::rename(&temp, path) {
        Ok(()) => {
            if backup.exists() {
                let _ = std::fs::remove_file(&backup);
            }
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            if backup.exists() && !path.exists() {
                let _ = std::fs::rename(&backup, path);
            }
            Err(error.to_string())
        }
    }
}

fn restore_backup(path: &Path) -> Result<(), String> {
    let backup = path.with_extension("json.bak");
    if !path.exists() && backup.exists() {
        std::fs::rename(backup, path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::execution_router_core::VerifiedModelCapability;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "codex-monitor-execution-binding-{name}-{}.json",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn plan(revision: u64) -> ShadowApprovedPlanRef {
        ShadowApprovedPlanRef {
            plan_id: "plan-routing".to_string(),
            plan_revision: revision,
            plan_hash: "a".repeat(64),
            approval_receipt_id: "receipt-routing".to_string(),
            node_id: "node-transform".to_string(),
            task_fingerprint: "b".repeat(64),
        }
    }

    fn provider() -> ShadowProviderContext {
        ShadowProviderContext {
            active_provider_id: "openai".to_string(),
            selected_provider_id: "openai".to_string(),
            selected_model_id: "gpt-5.6-sol".to_string(),
            selected_reasoning_effort: Some("medium".to_string()),
            models: vec![VerifiedModelCapability {
                provider_id: "openai".to_string(),
                model_id: "gpt-5.6-luna".to_string(),
                verified: true,
                supported_reasoning_efforts: vec!["low".to_string(), "medium".to_string()],
            }],
        }
    }

    fn register(call_id: &str, now: u64) -> ExecutionBindingRegisterRequest {
        ExecutionBindingRegisterRequest {
            source_id: "source".to_string(),
            runtime_id: "runtime".to_string(),
            workspace_id: "workspace".to_string(),
            parent_thread_id: "parent".to_string(),
            collab_tool_call_id: call_id.to_string(),
            active_plan_revision: 2,
            approved_plan: plan(2),
            expected: ShadowExpectedBinding {
                model_id: "gpt-5.6-luna".to_string(),
                reasoning_effort: "low".to_string(),
            },
            provider: provider(),
            registered_at_ms: now,
            expires_at_ms: now + 60_000,
        }
    }

    fn observe(call_id: &str, model: Option<&str>, now: u64) -> ExecutionBindingObserveRequest {
        ExecutionBindingObserveRequest {
            source_id: "source".to_string(),
            runtime_id: "runtime".to_string(),
            workspace_id: "workspace".to_string(),
            parent_thread_id: "parent".to_string(),
            collab_tool_call_id: call_id.to_string(),
            sender_thread_id: "parent".to_string(),
            receiver_thread_ids: vec!["child".to_string()],
            actual: ShadowActualBinding {
                model_id: model.map(str::to_string),
                reasoning_effort: Some("low".to_string()),
            },
            observed_at_ms: now,
        }
    }

    #[test]
    fn expected_first_then_actual_matches_and_survives_reload() {
        let path = test_path("expected-first");
        let now = current_time_ms();
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        let pending = sidecar.register(register("call-1", now)).unwrap();
        assert_eq!(pending.status, ExecutionBindingStatus::AwaitingActual);
        let matched = sidecar
            .observe(observe("call-1", Some("gpt-5.6-luna"), now + 1))
            .unwrap();
        assert_eq!(matched.status, ExecutionBindingStatus::Matched);

        let mut reloaded = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        let records = reloaded
            .list(&ExecutionBindingQuery {
                source_id: "source".to_string(),
                runtime_id: "runtime".to_string(),
                workspace_id: "workspace".to_string(),
                parent_thread_id: "parent".to_string(),
                collab_tool_call_id: Some("call-1".to_string()),
            })
            .unwrap();
        assert_eq!(records, vec![matched]);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn actual_first_then_expected_matches() {
        let path = test_path("actual-first");
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        let pending = sidecar
            .observe(observe("call-1", Some("gpt-5.6-luna"), 10))
            .unwrap();
        assert_eq!(pending.status, ExecutionBindingStatus::AwaitingExpected);
        let matched = sidecar.register(register("call-1", 20)).unwrap();
        assert_eq!(matched.status, ExecutionBindingStatus::Matched);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn completion_enriches_started_item_without_conflict() {
        let path = test_path("enrich");
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        sidecar.observe(observe("call-1", None, 10)).unwrap();
        let enriched = sidecar
            .observe(observe("call-1", Some("gpt-5.6-luna"), 20))
            .unwrap();
        assert_eq!(enriched.status, ExecutionBindingStatus::AwaitingExpected);
        assert_eq!(
            enriched.actual.and_then(|actual| actual.model_id),
            Some("gpt-5.6-luna".to_string())
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn conflicting_actual_is_durable_and_fail_closed() {
        let path = test_path("conflict");
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        sidecar
            .observe(observe("call-1", Some("gpt-5.6-luna"), 10))
            .unwrap();
        let conflict = sidecar
            .observe(observe("call-1", Some("gpt-5.6-sol"), 20))
            .unwrap();
        assert_eq!(conflict.status, ExecutionBindingStatus::Conflict);
        assert!(conflict
            .reason_codes
            .contains(&ExecutionBindingReasonCode::ActualBindingConflict));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stale_plan_revision_never_matches() {
        let path = test_path("stale");
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        let mut stale = register("call-1", 10);
        stale.active_plan_revision = 3;
        let record = sidecar.register(stale).unwrap();
        assert_eq!(record.status, ExecutionBindingStatus::Stale);
        assert!(record
            .reason_codes
            .contains(&ExecutionBindingReasonCode::PlanRevisionStale));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn mismatched_actual_is_audited_without_rebinding() {
        let path = test_path("mismatch");
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        sidecar.register(register("call-1", 10)).unwrap();
        let record = sidecar
            .observe(observe("call-1", Some("gpt-5.6-sol"), 20))
            .unwrap();
        assert_eq!(record.status, ExecutionBindingStatus::Mismatch);
        assert_eq!(
            record.audit.map(|audit| audit.status),
            Some(ShadowBindingAuditStatus::Mismatch)
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn exact_retries_do_not_advance_record_revision() {
        let path = test_path("idempotent-retry");
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        let registration = register("call-1", 10);
        let first_registration = sidecar.register(registration.clone()).unwrap();
        let retried_registration = sidecar.register(registration).unwrap();
        assert_eq!(retried_registration, first_registration);

        let observation = observe("call-1", Some("gpt-5.6-luna"), 20);
        let first_observation = sidecar.observe(observation.clone()).unwrap();
        let retried_observation = sidecar.observe(observation).unwrap();
        assert_eq!(retried_observation, first_observation);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn expired_registration_becomes_stale_when_queried() {
        let path = test_path("query-expired");
        let now = current_time_ms();
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        let mut expired = register("call-1", now - 2_000);
        expired.expires_at_ms = now - 1_000;
        sidecar.register(expired).unwrap();

        let records = sidecar
            .list(&ExecutionBindingQuery {
                source_id: "source".to_string(),
                runtime_id: "runtime".to_string(),
                workspace_id: "workspace".to_string(),
                parent_thread_id: "parent".to_string(),
                collab_tool_call_id: Some("call-1".to_string()),
            })
            .unwrap();
        assert_eq!(records[0].status, ExecutionBindingStatus::Stale);
        assert!(records[0]
            .reason_codes
            .contains(&ExecutionBindingReasonCode::BindingExpired));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn expired_actual_only_record_cannot_be_revived_by_late_expected() {
        let path = test_path("actual-only-expired");
        let now = current_time_ms();
        let observed_at = now - MAX_BINDING_LIFETIME_MS - 1;
        let mut sidecar = ExecutionBindingSidecar::new(path.clone(), 128, 4_096);
        sidecar
            .observe(observe("call-1", Some("gpt-5.6-luna"), observed_at))
            .unwrap();

        let query = ExecutionBindingQuery {
            source_id: "source".to_string(),
            runtime_id: "runtime".to_string(),
            workspace_id: "workspace".to_string(),
            parent_thread_id: "parent".to_string(),
            collab_tool_call_id: Some("call-1".to_string()),
        };
        let expired = sidecar.list(&query).unwrap();
        assert_eq!(expired[0].status, ExecutionBindingStatus::Stale);

        let late = sidecar.register(register("call-1", now)).unwrap();
        assert_eq!(late.status, ExecutionBindingStatus::Stale);
        assert!(late
            .reason_codes
            .contains(&ExecutionBindingReasonCode::BindingExpired));
        let retry = sidecar.register(register("call-1", now)).unwrap();
        assert_eq!(retry, late);
        let _ = std::fs::remove_file(path);
    }
}

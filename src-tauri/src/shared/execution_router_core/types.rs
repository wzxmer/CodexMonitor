use serde::{Deserialize, Serialize};

use crate::shared::task_coordination_core::{AccessLevel, ResourceKind, ThreadKey};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskComplexity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskRisk {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SpawnOutcome {
    #[default]
    NotAttempted,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowTaskSignals {
    pub complexity: TaskComplexity,
    pub risk: TaskRisk,
    pub parallelizable: bool,
    pub requires_write: bool,
    #[serde(default)]
    pub requires_independent_review: bool,
    #[serde(default)]
    pub requires_user_decision: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerifiedModelCapability {
    pub provider_id: String,
    pub model_id: String,
    pub verified: bool,
    #[serde(default)]
    pub supported_reasoning_efforts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowProviderContext {
    pub active_provider_id: String,
    pub selected_provider_id: String,
    pub selected_model_id: String,
    pub selected_reasoning_effort: Option<String>,
    #[serde(default)]
    pub models: Vec<VerifiedModelCapability>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowResourceRequest {
    pub kind: ResourceKind,
    pub resource_key: String,
    pub access: AccessLevel,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowCoordinationContext {
    pub group_id: String,
    pub owner: ThreadKey,
    #[serde(default)]
    pub resources: Vec<ShadowResourceRequest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowRuntimeState {
    pub active_slots: u32,
    pub depth: u32,
    pub root_tokens_used: u64,
    pub subtask_tokens_estimate: u64,
    pub elapsed_ms: u64,
    pub retry_count: u32,
    pub fallback_count: u32,
    #[serde(default)]
    pub spawn_outcome: SpawnOutcome,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowApprovedPlanRef {
    pub plan_id: String,
    pub plan_revision: u64,
    pub plan_hash: String,
    pub approval_receipt_id: String,
    pub node_id: String,
    pub task_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowExpectedBinding {
    pub model_id: String,
    pub reasoning_effort: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowActualBinding {
    pub model_id: Option<String>,
    pub reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowBindingContext {
    pub approved_plan: Option<ShadowApprovedPlanRef>,
    pub expected: Option<ShadowExpectedBinding>,
    pub actual: Option<ShadowActualBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowRouteRequest {
    pub task: ShadowTaskSignals,
    pub provider: ShadowProviderContext,
    pub runtime: ShadowRuntimeState,
    pub coordination: Option<ShadowCoordinationContext>,
    #[serde(default)]
    pub binding: Option<ShadowBindingContext>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ShadowRouteRecommendation {
    Direct,
    Delegate,
    Review,
    DecisionGate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShadowRouteReasonCode {
    LowComplexity,
    LowRisk,
    CoordinationCostExceedsBenefit,
    ComplexTask,
    Parallelizable,
    DelegationBenefitExceedsCoordinationCost,
    IndependentReviewRequired,
    HighRisk,
    UserDecisionRequired,
    ProviderMismatch,
    UnknownModel,
    UnverifiedModel,
    UnsupportedEffort,
    InputLimitExceeded,
    SlotLimitReached,
    DepthLimitReached,
    RootTokenBudgetExhausted,
    SubtaskTokenBudgetExceeded,
    TimeoutReached,
    RetryLimitReached,
    FallbackLimitReached,
    SpawnFailed,
    CoordinationGroupMissing,
    CoordinationGroupInactive,
    OwnerMissing,
    OwnerInactive,
    OwnerLeaseInactive,
    OwnerLeaseExpired,
    ClaimMissing,
    ClaimInvalid,
    ClaimConflict,
    CoordinationClear,
    ModelCapabilityVerified,
    BindingAuditFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShadowBindingAuditStatus {
    Matched,
    Mismatch,
    MissingEvidence,
    InvalidExpected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShadowBindingAuditReasonCode {
    ApprovedPlanMissing,
    ApprovedPlanInvalid,
    ExpectedBindingMissing,
    ExpectedBindingInvalid,
    ActualBindingMissing,
    ExpectedModelUnknown,
    ExpectedModelUnverified,
    ExpectedEffortUnsupported,
    ModelMismatch,
    EffortMismatch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowBindingAudit {
    pub status: ShadowBindingAuditStatus,
    pub reason_codes: Vec<ShadowBindingAuditReasonCode>,
    pub plan_id: Option<String>,
    pub plan_revision: Option<u64>,
    pub node_id: Option<String>,
    pub task_fingerprint: Option<String>,
    pub expected: Option<ShadowExpectedBinding>,
    pub actual: Option<ShadowActualBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowRouteAdvice {
    pub recommendation: ShadowRouteRecommendation,
    pub reason_codes: Vec<ShadowRouteReasonCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binding_audit: Option<ShadowBindingAudit>,
}

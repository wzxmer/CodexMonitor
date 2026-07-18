mod types;

pub use types::*;

use crate::shared::task_coordination_core::leases;
use crate::shared::task_coordination_core::ledger::CoordinationLedger;
use crate::shared::task_coordination_core::service::{self, AcquireResult};
use crate::shared::task_coordination_core::{
    claims_conflict, resources_intersect, AccessLevel, ClaimState, GroupStatus, LeaseState,
    ParticipantState,
};

pub const MAX_ACTIVE_SLOTS: u32 = 4;
pub const MAX_DELEGATION_DEPTH: u32 = 3;
pub const MAX_ROOT_TOKENS: u64 = 200_000;
pub const MAX_SUBTASK_TOKENS: u64 = 64_000;
pub const MAX_TIMEOUT_MS: u64 = 30 * 60 * 1_000;
pub const MAX_RETRIES: u32 = 1;
pub const MAX_FALLBACKS: u32 = 1;
const MAX_MODEL_CATALOG_ENTRIES: usize = 128;
const MAX_RESOURCE_REQUESTS: usize = 64;

pub fn shadow_route(
    request: &ShadowRouteRequest,
    ledger: &CoordinationLedger,
    now_ms: u64,
) -> ShadowRouteAdvice {
    let delegate_candidate = request.task.complexity == TaskComplexity::High
        && request.task.parallelizable
        && !request.task.requires_independent_review
        && request.task.risk != TaskRisk::High
        && !request.task.requires_user_decision;
    let mut gates = Vec::new();

    evaluate_provider(&request.provider, &mut gates);
    evaluate_runtime(&request.runtime, delegate_candidate, &mut gates);

    if request.task.requires_write || delegate_candidate {
        evaluate_coordination(request, ledger, now_ms, &mut gates);
    }

    if request.task.risk == TaskRisk::High {
        push_unique(&mut gates, ShadowRouteReasonCode::HighRisk);
    }
    if request.task.requires_user_decision || request.task.risk == TaskRisk::High {
        push_unique(&mut gates, ShadowRouteReasonCode::UserDecisionRequired);
    }

    if !gates.is_empty() {
        return ShadowRouteAdvice {
            recommendation: ShadowRouteRecommendation::DecisionGate,
            reason_codes: gates,
        };
    }

    if request.task.requires_independent_review
        || (request.task.complexity == TaskComplexity::High && !request.task.parallelizable)
    {
        return ShadowRouteAdvice {
            recommendation: ShadowRouteRecommendation::Review,
            reason_codes: vec![
                ShadowRouteReasonCode::ComplexTask,
                ShadowRouteReasonCode::IndependentReviewRequired,
            ],
        };
    }

    if delegate_candidate {
        return ShadowRouteAdvice {
            recommendation: ShadowRouteRecommendation::Delegate,
            reason_codes: vec![
                ShadowRouteReasonCode::ComplexTask,
                ShadowRouteReasonCode::Parallelizable,
                ShadowRouteReasonCode::DelegationBenefitExceedsCoordinationCost,
                ShadowRouteReasonCode::CoordinationClear,
                ShadowRouteReasonCode::ModelCapabilityVerified,
            ],
        };
    }

    let mut reasons = vec![ShadowRouteReasonCode::CoordinationCostExceedsBenefit];
    if request.task.complexity == TaskComplexity::Low {
        reasons.insert(0, ShadowRouteReasonCode::LowComplexity);
    }
    if request.task.risk == TaskRisk::Low {
        reasons.insert(0, ShadowRouteReasonCode::LowRisk);
    }
    ShadowRouteAdvice {
        recommendation: ShadowRouteRecommendation::Direct,
        reason_codes: reasons,
    }
}

fn evaluate_provider(provider: &ShadowProviderContext, reasons: &mut Vec<ShadowRouteReasonCode>) {
    if provider.models.len() > MAX_MODEL_CATALOG_ENTRIES
        || provider.active_provider_id.len() > 256
        || provider.selected_provider_id.len() > 256
        || provider.selected_model_id.len() > 256
        || provider
            .selected_reasoning_effort
            .as_ref()
            .is_some_and(|value| value.len() > 64)
    {
        push_unique(reasons, ShadowRouteReasonCode::InputLimitExceeded);
    }

    if provider.active_provider_id.is_empty()
        || provider.selected_provider_id.is_empty()
        || provider.active_provider_id != provider.selected_provider_id
    {
        push_unique(reasons, ShadowRouteReasonCode::ProviderMismatch);
    }

    let Some(model) = provider.models.iter().find(|candidate| {
        candidate.provider_id == provider.selected_provider_id
            && candidate.model_id == provider.selected_model_id
    }) else {
        push_unique(reasons, ShadowRouteReasonCode::UnknownModel);
        return;
    };

    if !model.verified {
        push_unique(reasons, ShadowRouteReasonCode::UnverifiedModel);
    }
    if let Some(effort) = provider.selected_reasoning_effort.as_deref() {
        if !model
            .supported_reasoning_efforts
            .iter()
            .any(|supported| supported == effort)
        {
            push_unique(reasons, ShadowRouteReasonCode::UnsupportedEffort);
        }
    }
}

fn evaluate_runtime(
    runtime: &ShadowRuntimeState,
    delegate_candidate: bool,
    reasons: &mut Vec<ShadowRouteReasonCode>,
) {
    if runtime.root_tokens_used >= MAX_ROOT_TOKENS
        || runtime
            .root_tokens_used
            .checked_add(runtime.subtask_tokens_estimate)
            .is_none_or(|total| total > MAX_ROOT_TOKENS)
    {
        push_unique(reasons, ShadowRouteReasonCode::RootTokenBudgetExhausted);
    }
    if runtime.elapsed_ms >= MAX_TIMEOUT_MS {
        push_unique(reasons, ShadowRouteReasonCode::TimeoutReached);
    }

    if !delegate_candidate {
        return;
    }
    if runtime.active_slots >= MAX_ACTIVE_SLOTS {
        push_unique(reasons, ShadowRouteReasonCode::SlotLimitReached);
    }
    if runtime.depth >= MAX_DELEGATION_DEPTH {
        push_unique(reasons, ShadowRouteReasonCode::DepthLimitReached);
    }
    if runtime.subtask_tokens_estimate > MAX_SUBTASK_TOKENS {
        push_unique(reasons, ShadowRouteReasonCode::SubtaskTokenBudgetExceeded);
    }
    if runtime.retry_count >= MAX_RETRIES {
        push_unique(reasons, ShadowRouteReasonCode::RetryLimitReached);
    }
    if runtime.fallback_count >= MAX_FALLBACKS {
        push_unique(reasons, ShadowRouteReasonCode::FallbackLimitReached);
    }
    if runtime.spawn_outcome == SpawnOutcome::Failed {
        push_unique(reasons, ShadowRouteReasonCode::SpawnFailed);
        if runtime.retry_count >= MAX_RETRIES {
            push_unique(reasons, ShadowRouteReasonCode::RetryLimitReached);
        }
        if runtime.fallback_count >= MAX_FALLBACKS {
            push_unique(reasons, ShadowRouteReasonCode::FallbackLimitReached);
        }
    }
}

fn evaluate_coordination(
    request: &ShadowRouteRequest,
    ledger: &CoordinationLedger,
    now_ms: u64,
    reasons: &mut Vec<ShadowRouteReasonCode>,
) {
    let Some(context) = request.coordination.as_ref() else {
        push_unique(reasons, ShadowRouteReasonCode::CoordinationGroupMissing);
        return;
    };
    if context.resources.len() > MAX_RESOURCE_REQUESTS {
        push_unique(reasons, ShadowRouteReasonCode::InputLimitExceeded);
        return;
    }

    let Some(group) = ledger.groups.get(&context.group_id) else {
        push_unique(reasons, ShadowRouteReasonCode::CoordinationGroupMissing);
        return;
    };
    if group.status != GroupStatus::Active {
        push_unique(reasons, ShadowRouteReasonCode::CoordinationGroupInactive);
    }

    let Some(owner) = ledger
        .participants
        .get(&context.group_id)
        .and_then(|participants| {
            participants
                .iter()
                .find(|participant| participant.thread_key == context.owner)
        })
    else {
        push_unique(reasons, ShadowRouteReasonCode::OwnerMissing);
        return;
    };
    if owner.state != ParticipantState::Active {
        push_unique(reasons, ShadowRouteReasonCode::OwnerInactive);
    }
    if owner.lease_state != LeaseState::Active {
        push_unique(reasons, ShadowRouteReasonCode::OwnerLeaseInactive);
    } else if leases::is_lease_expired(owner, now_ms) {
        push_unique(reasons, ShadowRouteReasonCode::OwnerLeaseExpired);
    }

    if context.resources.is_empty() {
        push_unique(reasons, ShadowRouteReasonCode::ClaimMissing);
        return;
    }
    let existing = ledger
        .claims
        .get(&context.group_id)
        .map(Vec::as_slice)
        .unwrap_or_default();
    for resource in &context.resources {
        if existing
            .iter()
            .filter(|claim| claim.owner_thread_key != context.owner)
            .any(|claim| {
                claims_conflict(
                    claim,
                    resource.kind,
                    &resource.resource_key,
                    resource.access,
                )
                .is_some()
            })
        {
            push_unique(reasons, ShadowRouteReasonCode::ClaimConflict);
            continue;
        }
        match service::acquire_claim(
            &context.group_id,
            &context.owner,
            resource.kind,
            &resource.resource_key,
            resource.access,
            existing,
            now_ms,
        ) {
            AcquireResult::Conflict(conflict) if conflict.conflicting_claim_id.is_empty() => {
                push_unique(reasons, ShadowRouteReasonCode::ClaimInvalid);
                continue;
            }
            AcquireResult::Conflict(_) => {
                push_unique(reasons, ShadowRouteReasonCode::ClaimConflict);
                continue;
            }
            AcquireResult::Granted(_) => {}
        }

        let owns_claim = existing.iter().any(|claim| {
            claim.owner_thread_key == context.owner
                && claim.state == ClaimState::Granted
                && resources_intersect(
                    claim.kind,
                    &claim.resource_key,
                    resource.kind,
                    &resource.resource_key,
                )
                && access_covers(claim.access, resource.access)
        });
        if !owns_claim {
            push_unique(reasons, ShadowRouteReasonCode::ClaimMissing);
        }
    }
}

fn access_covers(existing: AccessLevel, requested: AccessLevel) -> bool {
    matches!(
        (existing, requested),
        (AccessLevel::Exclusive, _)
            | (AccessLevel::Write, AccessLevel::Read | AccessLevel::Write)
            | (AccessLevel::Read, AccessLevel::Read)
    )
}

fn push_unique(reasons: &mut Vec<ShadowRouteReasonCode>, reason: ShadowRouteReasonCode) {
    if !reasons.contains(&reason) {
        reasons.push(reason);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::task_coordination_core::{
        AccessLevel, ClaimState, CoordinationMode, GroupStatus, LeaseState, ParticipantRole,
        ParticipantState, ResourceClaim, ResourceKind, TaskCoordinationGroup, TaskParticipant,
        ThreadKey,
    };

    const NOW: u64 = 10_000;

    fn owner() -> ThreadKey {
        ThreadKey {
            source: "local".to_string(),
            workspace_id: "workspace-1".to_string(),
            thread_id: "thread-1".to_string(),
        }
    }

    fn verified_provider() -> ShadowProviderContext {
        ShadowProviderContext {
            active_provider_id: "provider-a".to_string(),
            selected_provider_id: "provider-a".to_string(),
            selected_model_id: "model-a".to_string(),
            selected_reasoning_effort: Some("high".to_string()),
            models: vec![VerifiedModelCapability {
                provider_id: "provider-a".to_string(),
                model_id: "model-a".to_string(),
                verified: true,
                supported_reasoning_efforts: vec!["low".to_string(), "high".to_string()],
            }],
        }
    }

    fn runtime() -> ShadowRuntimeState {
        ShadowRuntimeState {
            active_slots: 0,
            depth: 0,
            root_tokens_used: 1_000,
            subtask_tokens_estimate: 8_000,
            elapsed_ms: 1_000,
            retry_count: 0,
            fallback_count: 0,
            spawn_outcome: SpawnOutcome::NotAttempted,
        }
    }

    fn request(complexity: TaskComplexity, risk: TaskRisk) -> ShadowRouteRequest {
        ShadowRouteRequest {
            task: ShadowTaskSignals {
                complexity,
                risk,
                parallelizable: false,
                requires_write: false,
                requires_independent_review: false,
                requires_user_decision: false,
            },
            provider: verified_provider(),
            runtime: runtime(),
            coordination: None,
        }
    }

    fn coordinated_ledger() -> CoordinationLedger {
        let mut ledger = CoordinationLedger::default();
        ledger.groups.insert(
            "group-1".to_string(),
            TaskCoordinationGroup {
                id: "group-1".to_string(),
                name: "Router".to_string(),
                repository_id: "repo-1".to_string(),
                repository_root: "/repo".to_string(),
                base_revision: None,
                coordinator_thread_key: Some(owner()),
                mode: CoordinationMode::Guarded,
                status: GroupStatus::Active,
                created_at: 0,
                updated_at: 0,
            },
        );
        ledger.participants.insert(
            "group-1".to_string(),
            vec![TaskParticipant {
                thread_key: owner(),
                group_id: "group-1".to_string(),
                workspace_id: "workspace-1".to_string(),
                thread_id: "thread-1".to_string(),
                worktree_path: None,
                branch: None,
                role: ParticipantRole::Coordinator,
                state: ParticipantState::Active,
                lease_state: LeaseState::Active,
                lease_until: Some(NOW + 30_000),
                last_heartbeat_at: Some(NOW),
            }],
        );
        ledger.claims.insert(
            "group-1".to_string(),
            vec![ResourceClaim {
                id: "claim-1".to_string(),
                group_id: "group-1".to_string(),
                owner_thread_key: owner(),
                kind: ResourceKind::Logical,
                resource_key: "router-core".to_string(),
                access: AccessLevel::Write,
                state: ClaimState::Granted,
                reason: None,
                created_at: NOW,
                updated_at: NOW,
            }],
        );
        ledger
    }

    fn make_delegate_request() -> ShadowRouteRequest {
        let mut request = request(TaskComplexity::High, TaskRisk::Medium);
        request.task.parallelizable = true;
        request.task.requires_write = true;
        request.coordination = Some(ShadowCoordinationContext {
            group_id: "group-1".to_string(),
            owner: owner(),
            resources: vec![ShadowResourceRequest {
                kind: ResourceKind::Logical,
                resource_key: "router-core".to_string(),
                access: AccessLevel::Write,
            }],
        });
        request
    }

    #[test]
    fn recommends_direct_for_low_risk_atomic_work() {
        let advice = shadow_route(
            &request(TaskComplexity::Low, TaskRisk::Low),
            &CoordinationLedger::default(),
            NOW,
        );
        assert_eq!(advice.recommendation, ShadowRouteRecommendation::Direct);
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::LowComplexity));
    }

    #[test]
    fn recommends_delegate_for_complex_parallel_work_with_owned_claim() {
        let advice = shadow_route(&make_delegate_request(), &coordinated_ledger(), NOW);
        assert_eq!(advice.recommendation, ShadowRouteRecommendation::Delegate);
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::CoordinationClear));
    }

    #[test]
    fn recommends_review_for_complex_non_parallel_work() {
        let advice = shadow_route(
            &request(TaskComplexity::High, TaskRisk::Medium),
            &CoordinationLedger::default(),
            NOW,
        );
        assert_eq!(advice.recommendation, ShadowRouteRecommendation::Review);
    }

    #[test]
    fn missing_coordination_blocks_complex_delegation() {
        let advice = shadow_route(
            &make_delegate_request(),
            &CoordinationLedger::default(),
            NOW,
        );
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::CoordinationGroupMissing));
    }

    #[test]
    fn high_risk_work_requires_decision_gate() {
        let advice = shadow_route(
            &request(TaskComplexity::Medium, TaskRisk::High),
            &CoordinationLedger::default(),
            NOW,
        );
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::HighRisk));
    }

    #[test]
    fn unknown_model_is_not_guessed() {
        let mut request = request(TaskComplexity::Low, TaskRisk::Low);
        request.provider.selected_model_id = "missing".to_string();
        let advice = shadow_route(&request, &CoordinationLedger::default(), NOW);
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert_eq!(
            advice.reason_codes,
            vec![ShadowRouteReasonCode::UnknownModel]
        );
    }

    #[test]
    fn unsupported_effort_is_not_silently_corrected() {
        let mut request = request(TaskComplexity::Low, TaskRisk::Low);
        request.provider.selected_reasoning_effort = Some("xhigh".to_string());
        let advice = shadow_route(&request, &CoordinationLedger::default(), NOW);
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert_eq!(
            advice.reason_codes,
            vec![ShadowRouteReasonCode::UnsupportedEffort]
        );
    }

    #[test]
    fn cross_provider_selection_requires_decision_gate() {
        let mut request = request(TaskComplexity::Low, TaskRisk::Low);
        request.provider.selected_provider_id = "provider-b".to_string();
        request.provider.models.push(VerifiedModelCapability {
            provider_id: "provider-b".to_string(),
            model_id: "model-b".to_string(),
            verified: true,
            supported_reasoning_efforts: vec!["high".to_string()],
        });
        request.provider.selected_model_id = "model-b".to_string();
        let advice = shadow_route(&request, &CoordinationLedger::default(), NOW);
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::ProviderMismatch));
    }

    #[test]
    fn spawn_failure_never_falls_back_to_parent_silently() {
        let mut request = make_delegate_request();
        request.runtime.spawn_outcome = SpawnOutcome::Failed;
        request.runtime.retry_count = MAX_RETRIES;
        request.runtime.fallback_count = MAX_FALLBACKS;
        let advice = shadow_route(&request, &coordinated_ledger(), NOW);
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::SpawnFailed));
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::RetryLimitReached));
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::FallbackLimitReached));
    }

    #[test]
    fn exhausted_root_budget_requires_decision_gate() {
        let mut request = request(TaskComplexity::Low, TaskRisk::Low);
        request.runtime.root_tokens_used = MAX_ROOT_TOKENS;
        let advice = shadow_route(&request, &CoordinationLedger::default(), NOW);
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::RootTokenBudgetExhausted));
    }

    #[test]
    fn bounded_delegate_runtime_reports_all_exhausted_limits() {
        let mut request = make_delegate_request();
        request.runtime.active_slots = MAX_ACTIVE_SLOTS;
        request.runtime.depth = MAX_DELEGATION_DEPTH;
        request.runtime.subtask_tokens_estimate = MAX_SUBTASK_TOKENS + 1;
        request.runtime.elapsed_ms = MAX_TIMEOUT_MS;
        request.runtime.retry_count = MAX_RETRIES;
        request.runtime.fallback_count = MAX_FALLBACKS;
        let advice = shadow_route(&request, &coordinated_ledger(), NOW);
        for expected in [
            ShadowRouteReasonCode::SlotLimitReached,
            ShadowRouteReasonCode::DepthLimitReached,
            ShadowRouteReasonCode::SubtaskTokenBudgetExceeded,
            ShadowRouteReasonCode::TimeoutReached,
            ShadowRouteReasonCode::RetryLimitReached,
            ShadowRouteReasonCode::FallbackLimitReached,
        ] {
            assert!(
                advice.reason_codes.contains(&expected),
                "missing {expected:?}"
            );
        }
    }

    #[test]
    fn coordination_conflict_blocks_delegation() {
        let mut ledger = coordinated_ledger();
        ledger
            .claims
            .get_mut("group-1")
            .unwrap()
            .push(ResourceClaim {
                id: "claim-other".to_string(),
                group_id: "group-1".to_string(),
                owner_thread_key: ThreadKey {
                    source: "local".to_string(),
                    workspace_id: "workspace-1".to_string(),
                    thread_id: "thread-other".to_string(),
                },
                kind: ResourceKind::Logical,
                resource_key: "router-core".to_string(),
                access: AccessLevel::Write,
                state: ClaimState::Granted,
                reason: None,
                created_at: NOW,
                updated_at: NOW,
            });
        let advice = shadow_route(&make_delegate_request(), &ledger, NOW);
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::ClaimConflict));
    }

    #[test]
    fn inactive_owner_lease_blocks_delegation() {
        let mut ledger = coordinated_ledger();
        ledger
            .participants
            .get_mut("group-1")
            .unwrap()
            .first_mut()
            .unwrap()
            .lease_state = LeaseState::Uncertain;
        let advice = shadow_route(&make_delegate_request(), &ledger, NOW);
        assert_eq!(
            advice.recommendation,
            ShadowRouteRecommendation::DecisionGate
        );
        assert!(advice
            .reason_codes
            .contains(&ShadowRouteReasonCode::OwnerLeaseInactive));
    }

    #[test]
    fn response_exposes_only_advice_and_reason_codes() {
        let advice = shadow_route(
            &request(TaskComplexity::Low, TaskRisk::Low),
            &CoordinationLedger::default(),
            NOW,
        );
        let value = serde_json::to_value(advice).expect("serialize advice");
        let object = value.as_object().expect("advice object");
        assert_eq!(object.len(), 2);
        assert_eq!(object["recommendation"], "direct");
        assert!(object["reasonCodes"].is_array());
    }
}

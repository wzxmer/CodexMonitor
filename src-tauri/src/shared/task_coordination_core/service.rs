use serde::Serialize;
use std::collections::HashSet;

use super::types::{
    claims_conflict, validate_resource_key, AccessLevel, ClaimState, ConflictResult, ResourceClaim,
    ResourceKind, TaskCoordinationGroup, TaskParticipant, ThreadKey,
};

/// Result of acquiring a claim.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AcquireResult {
    Granted(ResourceClaim),
    Conflict(ConflictResult),
}

/// Result of candidate detection between two threads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CandidateMatch {
    pub thread_key: ThreadKey,
    pub reason: String,
    pub strength: CandidateStrength,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum CandidateStrength {
    Strong,
    Medium,
    Weak,
}

/// Creates a new coordination group.
pub fn create_group(group: TaskCoordinationGroup) -> TaskCoordinationGroup {
    group
}

/// Adds a participant to a group.
pub fn join_group(participant: TaskParticipant) -> TaskParticipant {
    participant
}

/// Attempts to acquire a resource claim within a group.
/// Checks all existing non-released claims for conflicts.
pub fn acquire_claim(
    group_id: &str,
    owner: &ThreadKey,
    kind: ResourceKind,
    resource_key: &str,
    access: AccessLevel,
    existing_claims: &[ResourceClaim],
    now: u64,
) -> AcquireResult {
    if let Err(e) = validate_resource_key(kind, resource_key) {
        return AcquireResult::Conflict(ConflictResult {
            conflicting_claim_id: String::new(),
            existing_access: AccessLevel::Read,
            new_access: access,
            reason: e,
        });
    }

    // Check self-ownership: if the same thread already has a claim on the same resource,
    // upgrade or return granted
    for existing in existing_claims
        .iter()
        .filter(|c| c.state != ClaimState::Released)
    {
        if existing.owner_thread_key == *owner
            && super::types::resources_intersect(
                existing.kind,
                &existing.resource_key,
                kind,
                resource_key,
            )
        {
            // Same owner, same resource — allow (it's an upgrade/re-declaration)
            // But if downgrading exclusive to lower, keep the stronger
            if existing.access == AccessLevel::Exclusive && access != AccessLevel::Exclusive {
                // Keep existing stronger claim
                return AcquireResult::Granted(existing.clone());
            }
            // Otherwise return new granted
            let claim = make_claim(group_id, owner, kind, resource_key, access, now);
            return AcquireResult::Granted(claim);
        }
    }

    // Check conflicts with other owners
    for existing in existing_claims
        .iter()
        .filter(|c| c.state != ClaimState::Released)
    {
        if existing.owner_thread_key == *owner {
            continue;
        }
        if super::types::resources_intersect(
            existing.kind,
            &existing.resource_key,
            kind,
            resource_key,
        ) {
            if let Some(conflict) = claims_conflict(existing, kind, resource_key, access) {
                return AcquireResult::Conflict(conflict);
            }
        }
    }

    AcquireResult::Granted(make_claim(group_id, owner, kind, resource_key, access, now))
}

fn make_claim(
    group_id: &str,
    owner: &ThreadKey,
    kind: ResourceKind,
    resource_key: &str,
    access: AccessLevel,
    now: u64,
) -> ResourceClaim {
    let key = super::types::normalize_path(resource_key);
    let claim_id = format!(
        "{group_id}:{source}:{workspace}:{thread}:{key}:{access:?}",
        source = owner.source,
        workspace = owner.workspace_id,
        thread = owner.thread_id,
    );
    ResourceClaim {
        id: claim_id,
        group_id: group_id.to_string(),
        owner_thread_key: owner.clone(),
        kind,
        resource_key: key,
        access,
        state: ClaimState::Granted,
        reason: None,
        created_at: now,
        updated_at: now,
    }
}

/// Detects candidate related threads using deterministic signals.
/// Does NOT use embeddings or LLM calls.
pub fn detect_candidates(
    target: &ThreadKey,
    target_repository_id: &str,
    target_title: &str,
    known_threads: &[(ThreadKey, String, String)], // (thread_key, repository_id, title)
    seen_pairs: &HashSet<String>,
) -> Vec<CandidateMatch> {
    let mut results = Vec::new();

    for (key, repo_id, title) in known_threads {
        if key == target {
            continue;
        }
        if repo_id != target_repository_id {
            continue;
        }

        let pair_key = if target < key {
            format!("{}::{}", target.thread_id, key.thread_id)
        } else {
            format!("{}::{}", key.thread_id, target.thread_id)
        };
        if seen_pairs.contains(&pair_key) {
            continue;
        }

        // Strong signal: same title (normalized)
        if normalize_title(title) == normalize_title(target_title) && !title.is_empty() {
            results.push(CandidateMatch {
                thread_key: key.clone(),
                reason: "same title".to_string(),
                strength: CandidateStrength::Strong,
            });
            continue;
        }

        // Medium signal: shared keywords in title
        let target_keywords = extract_keywords(target_title);
        let title_keywords = extract_keywords(title);
        let common: HashSet<_> = target_keywords
            .intersection(&title_keywords)
            .cloned()
            .collect();
        if common.len() >= 2 {
            results.push(CandidateMatch {
                thread_key: key.clone(),
                reason: format!(
                    "shared keywords: {}",
                    common.into_iter().collect::<Vec<_>>().join(", ")
                ),
                strength: CandidateStrength::Medium,
            });
            continue;
        }

        // Weak signal: single keyword overlap
        if common.len() == 1 {
            results.push(CandidateMatch {
                thread_key: key.clone(),
                reason: "keyword overlap".to_string(),
                strength: CandidateStrength::Weak,
            });
        }
    }

    results
}

fn normalize_title(title: &str) -> String {
    title.trim().to_lowercase()
}

fn extract_keywords(title: &str) -> HashSet<String> {
    title
        .split(|c: char| !c.is_alphanumeric())
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty() && s.len() > 1 && !is_stop_word(s))
        .collect()
}

fn is_stop_word(word: &str) -> bool {
    matches!(
        word,
        "the"
            | "a"
            | "an"
            | "and"
            | "or"
            | "in"
            | "on"
            | "for"
            | "to"
            | "of"
            | "with"
            | "is"
            | "this"
            | "that"
    )
}

#[cfg(test)]
mod tests {
    use super::super::types::*;
    use super::*;

    fn make_owner() -> ThreadKey {
        ThreadKey {
            source: "local".to_string(),
            workspace_id: "ws".to_string(),
            thread_id: "t1".to_string(),
        }
    }

    #[test]
    fn acquire_claim_no_conflict() {
        let result = acquire_claim(
            "g1",
            &make_owner(),
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Write,
            &[],
            0,
        );
        assert!(matches!(result, AcquireResult::Granted(_)));
    }

    #[test]
    fn acquire_claim_conflict_with_other() {
        let owner1 = make_owner();
        let owner2 = ThreadKey {
            source: "local".to_string(),
            workspace_id: "ws".to_string(),
            thread_id: "t2".to_string(),
        };
        let existing = vec![ResourceClaim {
            id: "c1".to_string(),
            group_id: "g1".to_string(),
            owner_thread_key: owner2,
            kind: ResourceKind::File,
            resource_key: "/repo/a.rs".to_string(),
            access: AccessLevel::Write,
            state: ClaimState::Granted,
            reason: None,
            created_at: 0,
            updated_at: 0,
        }];
        let result = acquire_claim(
            "g1",
            &owner1,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Write,
            &existing,
            0,
        );
        assert!(matches!(result, AcquireResult::Conflict(_)));
    }

    #[test]
    fn acquire_claim_same_owner_upgrade() {
        let owner = make_owner();
        let existing = vec![ResourceClaim {
            id: "c1".to_string(),
            group_id: "g1".to_string(),
            owner_thread_key: owner.clone(),
            kind: ResourceKind::File,
            resource_key: "/repo/a.rs".to_string(),
            access: AccessLevel::Read,
            state: ClaimState::Granted,
            reason: None,
            created_at: 0,
            updated_at: 0,
        }];
        let result = acquire_claim(
            "g1",
            &owner,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Write,
            &existing,
            1,
        );
        assert!(matches!(result, AcquireResult::Granted(_)));
    }

    #[test]
    fn acquire_claim_released_no_conflict() {
        let owner1 = make_owner();
        let owner2 = ThreadKey {
            source: "local".to_string(),
            workspace_id: "ws".to_string(),
            thread_id: "t2".to_string(),
        };
        let mut existing_claim = ResourceClaim {
            id: "c1".to_string(),
            group_id: "g1".to_string(),
            owner_thread_key: owner2,
            kind: ResourceKind::File,
            resource_key: "/repo/a.rs".to_string(),
            access: AccessLevel::Write,
            state: ClaimState::Granted,
            reason: None,
            created_at: 0,
            updated_at: 0,
        };
        existing_claim.state = ClaimState::Released;
        let result = acquire_claim(
            "g1",
            &owner1,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Write,
            &[existing_claim],
            0,
        );
        assert!(matches!(result, AcquireResult::Granted(_)));
    }

    #[test]
    fn acquire_claim_empty_key_rejected() {
        let result = acquire_claim(
            "g1",
            &make_owner(),
            ResourceKind::File,
            "",
            AccessLevel::Write,
            &[],
            0,
        );
        assert!(matches!(result, AcquireResult::Conflict(_)));
    }

    #[test]
    fn detect_candidates_strong_same_title() {
        let target = make_owner();
        let other = ThreadKey {
            source: "local".to_string(),
            workspace_id: "ws".to_string(),
            thread_id: "t2".to_string(),
        };
        let known = vec![(other, "repo1".to_string(), "Fix login bug".to_string())];
        let results = detect_candidates(&target, "repo1", "Fix login bug", &known, &HashSet::new());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].strength, CandidateStrength::Strong);
    }

    #[test]
    fn detect_candidates_different_repo_no_match() {
        let target = make_owner();
        let other = ThreadKey {
            source: "local".to_string(),
            workspace_id: "ws".to_string(),
            thread_id: "t2".to_string(),
        };
        let known = vec![(other, "repo2".to_string(), "Fix login bug".to_string())];
        let results = detect_candidates(&target, "repo1", "Fix login bug", &known, &HashSet::new());
        assert!(results.is_empty());
    }

    #[test]
    fn detect_candidates_seen_pair_skipped() {
        let target = make_owner();
        let other = ThreadKey {
            source: "local".to_string(),
            workspace_id: "ws".to_string(),
            thread_id: "t2".to_string(),
        };
        let known = vec![(other, "repo1".to_string(), "Fix login bug".to_string())];
        let mut seen = HashSet::new();
        seen.insert("t1::t2".to_string());
        let results = detect_candidates(&target, "repo1", "Fix login bug", &known, &seen);
        assert!(results.is_empty());
    }

    #[test]
    fn detect_candidates_weak_single_keyword() {
        let target = make_owner();
        let other = ThreadKey {
            source: "local".to_string(),
            workspace_id: "ws".to_string(),
            thread_id: "t2".to_string(),
        };
        let known = vec![(other, "repo1".to_string(), "Refactor auth".to_string())];
        let results = detect_candidates(&target, "repo1", "Fix auth", &known, &HashSet::new());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].strength, CandidateStrength::Weak);
    }
}

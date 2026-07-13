use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Identifies a thread across source/workspace/session.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ThreadKey {
    pub source: String,
    pub workspace_id: String,
    pub thread_id: String,
}

/// Identifies a repository across main and worktree copies.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RepositoryIdentity {
    pub repository_id: String,
    pub root: String,
}

/// Coordination group that links related threads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaskCoordinationGroup {
    pub id: String,
    pub name: String,
    pub repository_id: String,
    pub repository_root: String,
    pub base_revision: Option<String>,
    pub coordinator_thread_key: Option<ThreadKey>,
    pub mode: CoordinationMode,
    pub status: GroupStatus,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CoordinationMode {
    Advisory,
    #[default]
    Guarded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum GroupStatus {
    #[default]
    Active,
    Completed,
    Archived,
}

/// A participant thread in a coordination group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaskParticipant {
    pub thread_key: ThreadKey,
    pub group_id: String,
    pub workspace_id: String,
    pub thread_id: String,
    pub worktree_path: Option<String>,
    pub branch: Option<String>,
    pub role: ParticipantRole,
    pub state: ParticipantState,
    pub lease_state: LeaseState,
    pub lease_until: Option<u64>,
    pub last_heartbeat_at: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ParticipantRole {
    #[default]
    Worker,
    Coordinator,
    Reviewer,
    Observer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ParticipantState {
    #[default]
    Planned,
    Active,
    Waiting,
    Blocked,
    Completed,
    Detached,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LeaseState {
    #[default]
    Released,
    Active,
    Uncertain,
}

/// A resource claim within a group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResourceClaim {
    pub id: String,
    pub group_id: String,
    pub owner_thread_key: ThreadKey,
    pub kind: ResourceKind,
    pub resource_key: String,
    pub access: AccessLevel,
    pub state: ClaimState,
    pub reason: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ResourceKind {
    #[default]
    File,
    Directory,
    Logical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AccessLevel {
    #[default]
    Read,
    Write,
    Exclusive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ClaimState {
    #[default]
    Proposed,
    Granted,
    Conflicted,
    Released,
}

/// Conflict detection result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConflictResult {
    pub conflicting_claim_id: String,
    pub existing_access: AccessLevel,
    pub new_access: AccessLevel,
    pub reason: String,
}

/// A checkpoint in the coordination group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoordinationCheckpoint {
    pub id: String,
    pub group_id: String,
    pub source_thread_key: ThreadKey,
    pub kind: CheckpointKind,
    pub summary: String,
    pub changed_paths: Vec<String>,
    pub commit: Option<String>,
    pub sequence: u64,
    pub delivery_state: DeliveryState,
    pub created_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CheckpointKind {
    #[default]
    Progress,
    Decision,
    Dependency,
    Conflict,
    Final,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum DeliveryState {
    #[default]
    Pending,
    Delivered,
    Failed,
}

/// Normalizes a filesystem path for comparison.
/// On Windows, paths are case-insensitive and both `/` and `\` are separators.
pub fn normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    // Replace backslashes with forward slashes
    let normalized = trimmed.replace('\\', "/");
    #[cfg(target_os = "windows")]
    let normalized = normalized.to_lowercase();
    // Collapse duplicate slashes but preserve leading double slash for UNC
    let mut result = String::with_capacity(normalized.len());
    let mut prev_slash = false;
    for (i, ch) in normalized.chars().enumerate() {
        if ch == '/' {
            if prev_slash && i != 1 {
                continue;
            }
            prev_slash = true;
        } else {
            prev_slash = false;
        }
        result.push(ch);
    }
    // Strip trailing slash unless it's the root
    if result.len() > 1 && result.ends_with('/') {
        result.pop();
    }
    result
}

/// Generates a repository identity from a git common-dir and work root.
/// For non-git workspaces, falls back to normalized root path.
pub fn repository_identity(common_dir: Option<&str>, work_root: &str) -> RepositoryIdentity {
    let root = normalize_path(work_root);
    let repository_id = match common_dir {
        Some(dir) if !dir.trim().is_empty() => {
            let normalized_dir = normalize_path(dir);
            format!("{normalized_dir}::{root}")
        }
        _ => root.clone(),
    };
    RepositoryIdentity {
        repository_id,
        root,
    }
}

/// Checks if two resource keys intersect.
/// - file/file: exact match (normalized)
/// - directory/file: file is inside directory
/// - directory/directory: one is prefix of the other
/// - logical/logical: exact match
/// - file/directory (mixed): file is inside directory
/// - logical vs file/directory: never intersects
pub fn resources_intersect(
    kind_a: ResourceKind,
    key_a: &str,
    kind_b: ResourceKind,
    key_b: &str,
) -> bool {
    match (kind_a, kind_b) {
        (ResourceKind::Logical, ResourceKind::Logical) => key_a == key_b,
        (ResourceKind::Logical, _) | (_, ResourceKind::Logical) => false,
        (ResourceKind::File, ResourceKind::File) => normalize_path(key_a) == normalize_path(key_b),
        (ResourceKind::File, ResourceKind::Directory) => is_path_inside(key_a, key_b),
        (ResourceKind::Directory, ResourceKind::File) => is_path_inside(key_b, key_a),
        (ResourceKind::Directory, ResourceKind::Directory) => is_dir_prefix_or_eq(key_a, key_b),
    }
}

/// Returns true if `file` is inside `directory`.
fn is_path_inside(file: &str, directory: &str) -> bool {
    let file = normalize_path(file);
    let dir = normalize_path(directory);
    if file == dir {
        return false;
    }
    let dir_with_slash = if dir.ends_with('/') {
        dir.clone()
    } else {
        format!("{dir}/")
    };
    file.starts_with(&dir_with_slash)
}

/// Returns true if one directory is a prefix of the other (or equal).
fn is_dir_prefix_or_eq(dir_a: &str, dir_b: &str) -> bool {
    let a = normalize_path(dir_a);
    let b = normalize_path(dir_b);
    if a == b {
        return true;
    }
    let a_with_slash = if a.ends_with('/') {
        a.clone()
    } else {
        format!("{a}/")
    };
    let b_with_slash = if b.ends_with('/') {
        b.clone()
    } else {
        format!("{b}/")
    };
    a.starts_with(&b_with_slash) || b.starts_with(&a_with_slash)
}

/// Checks whether a new claim conflicts with an existing claim.
/// Returns Some(ConflictResult) if there is a conflict, None otherwise.
///
/// Permission matrix:
/// | existing \ new | read | write | exclusive |
/// |----------------|------|-------|----------|
/// | read           | ok   | ok*   | conflict |
/// | write          | ok*  | conflict | conflict |
/// | exclusive      | conflict | conflict | conflict |
///
/// *ok with advisory note (snapshot may change)
pub fn claims_conflict(
    existing: &ResourceClaim,
    new_kind: ResourceKind,
    new_key: &str,
    new_access: AccessLevel,
) -> Option<ConflictResult> {
    if existing.state == ClaimState::Released {
        return None;
    }
    if !resources_intersect(existing.kind, &existing.resource_key, new_kind, new_key) {
        return None;
    }
    // Same owner doesn't conflict with itself
    // (checked by caller via thread_key comparison)

    let conf = match (existing.access, new_access) {
        (AccessLevel::Read, AccessLevel::Read) => None,
        (AccessLevel::Read, AccessLevel::Write) => None,
        (AccessLevel::Read, AccessLevel::Exclusive) => Some(()),
        (AccessLevel::Write, AccessLevel::Read) => None,
        (AccessLevel::Write, AccessLevel::Write) => Some(()),
        (AccessLevel::Write, AccessLevel::Exclusive) => Some(()),
        (AccessLevel::Exclusive, _) => Some(()),
    };
    conf.map(|_| ConflictResult {
        conflicting_claim_id: existing.id.clone(),
        existing_access: existing.access,
        new_access,
        reason: format!(
            "resource '{key}' access conflict: existing {:?} vs new {new_access:?}",
            existing.access,
            key = existing.resource_key
        ),
    })
}

/// Validates that a resource key is non-empty and not a glob pattern.
pub fn validate_resource_key(kind: ResourceKind, key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("resource key must not be empty".to_string());
    }
    if trimmed.contains('*') || trimmed.contains('?') || trimmed.contains('[') {
        return Err(format!(
            "glob patterns are not supported for {kind:?} resources"
        ));
    }
    Ok(())
}

/// Detects duplicate mutation request IDs for idempotency.
pub fn is_duplicate_request(seen_requests: &HashSet<String>, request_id: &str) -> bool {
    !request_id.is_empty() && seen_requests.contains(request_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_windows_path() {
        let a = normalize_path(r"C:\Users\test\file.rs");
        let b = normalize_path(r"c:/users/test/file.rs");
        #[cfg(target_os = "windows")]
        assert_eq!(a, b);
        #[cfg(not(target_os = "windows"))]
        assert_eq!(a, "C:/Users/test/file.rs");
    }

    #[test]
    fn normalizes_trailing_slash() {
        assert_eq!(normalize_path("/home/user/dir/"), "/home/user/dir");
        assert_eq!(normalize_path("/"), "/");
    }

    #[test]
    fn repository_identity_git() {
        let id = repository_identity(Some("/repo/.git"), "/repo");
        assert_eq!(id.repository_id, "/repo/.git::/repo");
    }

    #[test]
    fn repository_identity_non_git() {
        let id = repository_identity(None, "/work/my-project");
        assert_eq!(id.repository_id, "/work/my-project");
    }

    #[test]
    fn resources_file_file_match() {
        assert!(resources_intersect(
            ResourceKind::File,
            "/repo/src/main.rs",
            ResourceKind::File,
            "/repo/src/main.rs"
        ));
        assert!(!resources_intersect(
            ResourceKind::File,
            "/repo/src/main.rs",
            ResourceKind::File,
            "/repo/src/other.rs"
        ));
    }

    #[test]
    fn resources_directory_contains_file() {
        assert!(resources_intersect(
            ResourceKind::File,
            "/repo/src/main.rs",
            ResourceKind::Directory,
            "/repo/src"
        ));
        assert!(!resources_intersect(
            ResourceKind::File,
            "/repo/src/main.rs",
            ResourceKind::Directory,
            "/repo/tests"
        ));
    }

    #[test]
    fn resources_directory_prefix() {
        assert!(resources_intersect(
            ResourceKind::Directory,
            "/repo/src/a",
            ResourceKind::Directory,
            "/repo/src"
        ));
        // Same dir
        assert!(resources_intersect(
            ResourceKind::Directory,
            "/repo/src",
            ResourceKind::Directory,
            "/repo/src"
        ));
    }

    #[test]
    fn resources_logical_exact_match() {
        assert!(resources_intersect(
            ResourceKind::Logical,
            "contract:settings",
            ResourceKind::Logical,
            "contract:settings"
        ));
        assert!(!resources_intersect(
            ResourceKind::Logical,
            "contract:settings",
            ResourceKind::Logical,
            "contract:other"
        ));
    }

    #[test]
    fn resources_logical_never_intersects_file() {
        assert!(!resources_intersect(
            ResourceKind::Logical,
            "contract:settings",
            ResourceKind::File,
            "/repo/src/main.rs"
        ));
    }

    #[test]
    fn claims_read_read_no_conflict() {
        let existing = make_claim(ResourceKind::File, "/repo/a.rs", AccessLevel::Read);
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Read
        )
        .is_none());
    }

    #[test]
    fn claims_read_write_no_conflict() {
        let existing = make_claim(ResourceKind::File, "/repo/a.rs", AccessLevel::Read);
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Write
        )
        .is_none());
    }

    #[test]
    fn claims_write_write_conflict() {
        let existing = make_claim(ResourceKind::File, "/repo/a.rs", AccessLevel::Write);
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Write
        )
        .is_some());
    }

    #[test]
    fn claims_write_read_no_conflict() {
        let existing = make_claim(ResourceKind::File, "/repo/a.rs", AccessLevel::Write);
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Read
        )
        .is_none());
    }

    #[test]
    fn claims_exclusive_blocks_all() {
        let existing = make_claim(ResourceKind::File, "/repo/a.rs", AccessLevel::Exclusive);
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Read
        )
        .is_some());
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Write
        )
        .is_some());
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Exclusive
        )
        .is_some());
    }

    #[test]
    fn claims_released_no_conflict() {
        let mut existing = make_claim(ResourceKind::File, "/repo/a.rs", AccessLevel::Write);
        existing.state = ClaimState::Released;
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/a.rs",
            AccessLevel::Write
        )
        .is_none());
    }

    #[test]
    fn claims_different_path_no_conflict() {
        let existing = make_claim(ResourceKind::File, "/repo/a.rs", AccessLevel::Write);
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/b.rs",
            AccessLevel::Write
        )
        .is_none());
    }

    #[test]
    fn claims_directory_file_conflict() {
        let existing = make_claim(ResourceKind::Directory, "/repo/src", AccessLevel::Write);
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/src/main.rs",
            AccessLevel::Write
        )
        .is_some());
    }

    #[test]
    fn claims_logical_no_file_conflict() {
        let existing = make_claim(
            ResourceKind::Logical,
            "contract:settings",
            AccessLevel::Write,
        );
        assert!(claims_conflict(
            &existing,
            ResourceKind::File,
            "/repo/settings.rs",
            AccessLevel::Write
        )
        .is_none());
    }

    #[test]
    fn validates_resource_key_rejects_empty() {
        assert!(validate_resource_key(ResourceKind::File, "").is_err());
        assert!(validate_resource_key(ResourceKind::File, "  ").is_err());
    }

    #[test]
    fn validates_resource_key_rejects_glob() {
        assert!(validate_resource_key(ResourceKind::File, "/repo/*.rs").is_err());
        assert!(validate_resource_key(ResourceKind::Directory, "/repo/src/*").is_err());
        assert!(validate_resource_key(ResourceKind::Logical, "contract:settings").is_ok());
    }

    #[test]
    fn duplicate_request_detected() {
        let mut seen = HashSet::new();
        seen.insert("req-1".to_string());
        assert!(is_duplicate_request(&seen, "req-1"));
        assert!(!is_duplicate_request(&seen, "req-2"));
        assert!(!is_duplicate_request(&seen, ""));
    }

    fn make_claim(kind: ResourceKind, key: &str, access: AccessLevel) -> ResourceClaim {
        ResourceClaim {
            id: "claim-1".to_string(),
            group_id: "group-1".to_string(),
            owner_thread_key: ThreadKey {
                source: "local".to_string(),
                workspace_id: "ws-1".to_string(),
                thread_id: "thread-1".to_string(),
            },
            kind,
            resource_key: key.to_string(),
            access,
            state: ClaimState::Granted,
            reason: None,
            created_at: 0,
            updated_at: 0,
        }
    }
}

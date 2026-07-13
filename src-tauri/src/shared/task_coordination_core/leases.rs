use super::types::{ClaimState, LeaseState, ResourceClaim};

/// Updates a participant's lease state based on heartbeat and timeout.
/// Returns the new lease state.
pub fn renew_lease(
    participant: &mut super::types::TaskParticipant,
    now: u64,
    lease_duration_ms: u64,
) -> LeaseState {
    participant.lease_state = LeaseState::Active;
    participant.lease_until = Some(now + lease_duration_ms);
    participant.last_heartbeat_at = Some(now);
    LeaseState::Active
}

/// Marks a participant's lease as uncertain (e.g., on disconnect).
pub fn mark_uncertain(participant: &mut super::types::TaskParticipant) -> LeaseState {
    participant.lease_state = LeaseState::Uncertain;
    participant.lease_state
}

/// Marks a participant's lease as released.
pub fn release_lease(participant: &mut super::types::TaskParticipant) -> LeaseState {
    participant.lease_state = LeaseState::Released;
    participant.lease_until = None;
    participant.lease_state
}

/// Checks if a lease is expired (not active or past its expiry).
/// Released leases are not expired (they're gone).
/// Uncertain leases are never auto-expired — they block until user resolves.
pub fn is_lease_expired(participant: &super::types::TaskParticipant, now: u64) -> bool {
    match participant.lease_state {
        LeaseState::Active => participant.lease_until.map(|t| now > t).unwrap_or(true),
        LeaseState::Uncertain => false,
        LeaseState::Released => false,
    }
}

/// Transition an expired active lease to uncertain.
pub fn expire_active_lease(participant: &mut super::types::TaskParticipant) -> Option<LeaseState> {
    if participant.lease_state == LeaseState::Active {
        participant.lease_state = LeaseState::Uncertain;
        Some(LeaseState::Uncertain)
    } else {
        None
    }
}

/// Checks if a claim is effectively held (granted and owner lease is active/uncertain).
pub fn is_claim_held(claim: &ResourceClaim, lease_state: LeaseState) -> bool {
    claim.state == ClaimState::Granted
        && (lease_state == LeaseState::Active || lease_state == LeaseState::Uncertain)
}

#[cfg(test)]
mod tests {
    use super::super::types::*;
    use super::*;

    fn make_participant() -> TaskParticipant {
        TaskParticipant {
            thread_key: ThreadKey {
                source: "local".to_string(),
                workspace_id: "ws".to_string(),
                thread_id: "t".to_string(),
            },
            group_id: "g".to_string(),
            workspace_id: "ws".to_string(),
            thread_id: "t".to_string(),
            worktree_path: None,
            branch: None,
            role: ParticipantRole::Worker,
            state: ParticipantState::Active,
            lease_state: LeaseState::Released,
            lease_until: None,
            last_heartbeat_at: None,
        }
    }

    #[test]
    fn renew_sets_active() {
        let mut p = make_participant();
        let state = renew_lease(&mut p, 1000, 5000);
        assert_eq!(state, LeaseState::Active);
        assert_eq!(p.lease_until, Some(6000));
        assert_eq!(p.last_heartbeat_at, Some(1000));
    }

    #[test]
    fn release_clears_lease() {
        let mut p = make_participant();
        renew_lease(&mut p, 1000, 5000);
        let state = release_lease(&mut p);
        assert_eq!(state, LeaseState::Released);
        assert_eq!(p.lease_until, None);
    }

    #[test]
    fn uncertain_blocks_expiry() {
        let mut p = make_participant();
        mark_uncertain(&mut p);
        assert!(!is_lease_expired(&p, 999_999_999));
    }

    #[test]
    fn active_expires_after_timeout() {
        let mut p = make_participant();
        renew_lease(&mut p, 1000, 5000);
        // not expired yet
        assert!(!is_lease_expired(&p, 4000));
        // expired
        assert!(is_lease_expired(&p, 7000));
    }

    #[test]
    fn expire_active_transitions_to_uncertain() {
        let mut p = make_participant();
        renew_lease(&mut p, 1000, 5000);
        let state = expire_active_lease(&mut p);
        assert_eq!(state, Some(LeaseState::Uncertain));
        // second call returns None
        let state2 = expire_active_lease(&mut p);
        assert_eq!(state2, None);
    }

    #[test]
    fn claim_held_when_granted_and_active() {
        let claim = ResourceClaim {
            id: "c".to_string(),
            group_id: "g".to_string(),
            owner_thread_key: ThreadKey {
                source: "local".to_string(),
                workspace_id: "ws".to_string(),
                thread_id: "t".to_string(),
            },
            kind: ResourceKind::File,
            resource_key: "/repo/a.rs".to_string(),
            access: AccessLevel::Write,
            state: ClaimState::Granted,
            reason: None,
            created_at: 0,
            updated_at: 0,
        };
        assert!(is_claim_held(&claim, LeaseState::Active));
        assert!(is_claim_held(&claim, LeaseState::Uncertain));
        assert!(!is_claim_held(&claim, LeaseState::Released));
    }
}

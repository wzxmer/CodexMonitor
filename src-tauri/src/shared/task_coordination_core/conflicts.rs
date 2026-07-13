//! Conflict checking helpers that operate on claim sets.
//!
//! Re-exports conflict detection from types and service layers.

#[allow(unused_imports)]
pub use super::service::{acquire_claim, AcquireResult};
#[allow(unused_imports)]
pub use super::types::{claims_conflict, ConflictResult};

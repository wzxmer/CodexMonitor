//! Task similarity candidate detection.
//!
//! Re-exports from service module; will be split into its own module
//! when the service grows beyond Phase 2.

#[allow(unused_imports)]
pub use super::service::{detect_candidates, CandidateMatch, CandidateStrength};

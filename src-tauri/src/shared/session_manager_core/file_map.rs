use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::types::{SessionFileConfidence, SessionFileStatus};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SessionFileMapping {
    pub(crate) path: Option<PathBuf>,
    pub(crate) status: SessionFileStatus,
    pub(crate) confidence: SessionFileConfidence,
}

pub(crate) fn map_session_files(
    files_by_thread_id: HashMap<String, Vec<PathBuf>>,
) -> HashMap<String, SessionFileMapping> {
    files_by_thread_id
        .into_iter()
        .map(|(thread_id, paths)| {
            let mapping = match paths.as_slice() {
                [path] if path.is_file() => SessionFileMapping {
                    path: Some(path.clone()),
                    status: SessionFileStatus::Mapped,
                    confidence: SessionFileConfidence::Exact,
                },
                [path] => SessionFileMapping {
                    path: Some(path.clone()),
                    status: SessionFileStatus::Missing,
                    confidence: SessionFileConfidence::None,
                },
                [] => SessionFileMapping {
                    path: None,
                    status: SessionFileStatus::Unmapped,
                    confidence: SessionFileConfidence::None,
                },
                _ => SessionFileMapping {
                    path: None,
                    status: SessionFileStatus::Invalid,
                    confidence: SessionFileConfidence::Ambiguous,
                },
            };
            (thread_id, mapping)
        })
        .collect()
}

pub(crate) fn is_path_within_root(path: &Path, root: &Path) -> bool {
    let Ok(canonical_root) = root.canonicalize() else {
        return false;
    };
    let Ok(canonical_path) = path.canonicalize() else {
        return false;
    };
    canonical_path.starts_with(canonical_root)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::fs;

    use uuid::Uuid;

    use super::{is_path_within_root, map_session_files};
    use crate::types::{SessionFileConfidence, SessionFileStatus};

    #[test]
    fn maps_exact_and_ambiguous_files() {
        let root = std::env::temp_dir().join(format!("codex-monitor-map-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let exact = root.join("exact.jsonl");
        let duplicate = root.join("duplicate.jsonl");
        fs::write(&exact, "{}").unwrap();
        fs::write(&duplicate, "{}").unwrap();

        let mapped = map_session_files(HashMap::from([
            ("exact".to_string(), vec![exact.clone()]),
            (
                "duplicate".to_string(),
                vec![exact.clone(), duplicate.clone()],
            ),
        ]));

        assert!(matches!(mapped["exact"].status, SessionFileStatus::Mapped));
        assert!(matches!(
            mapped["exact"].confidence,
            SessionFileConfidence::Exact
        ));
        assert!(matches!(
            mapped["duplicate"].confidence,
            SessionFileConfidence::Ambiguous
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn validates_canonical_root_containment() {
        let root = std::env::temp_dir().join(format!("codex-monitor-root-{}", Uuid::new_v4()));
        let child = root.join("sessions").join("session.jsonl");
        fs::create_dir_all(child.parent().unwrap()).unwrap();
        fs::write(&child, "{}").unwrap();

        assert!(is_path_within_root(&child, &root));
        assert!(!is_path_within_root(&root, child.parent().unwrap()));
        fs::remove_dir_all(root).unwrap();
    }
}

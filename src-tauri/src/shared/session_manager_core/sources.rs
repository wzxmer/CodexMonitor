use std::collections::HashMap;
use std::path::Path;

use crate::types::{SessionSource, SessionSourceStatus};
use sha2::{Digest, Sha256};

use super::types::{normalize_source_path, source_identity_key};

const CURRENT_SOURCE_NAME: &str = "Current CODEX_HOME";
const DEFAULT_SOURCE_NAME: &str = "Default CODEX_HOME";

pub(crate) fn session_source_for_codex_home(path: &Path) -> Result<SessionSource, String> {
    let normalized_path = normalized_path_string(path)
        .ok_or_else(|| "Current CODEX_HOME path is required".to_string())?;
    Ok(SessionSource {
        id: source_id_for_path(&normalized_path),
        name: CURRENT_SOURCE_NAME.to_string(),
        codex_home_path: normalized_path.clone(),
        enabled: true,
        is_current: true,
        is_default: false,
        discovered_at: 0,
        last_scan_at: None,
        status: status_for_path(Path::new(&normalized_path)),
        error: None,
    })
}

pub(crate) fn reconcile_session_sources(
    sources: Vec<SessionSource>,
    current_path: Option<&Path>,
    default_path: Option<&Path>,
    now_ms: i64,
) -> Vec<SessionSource> {
    let mut normalized_sources: Vec<SessionSource> = Vec::new();
    let mut source_index_by_identity: HashMap<String, usize> = HashMap::new();
    let current = current_path.and_then(normalized_path_string);
    let default = default_path.and_then(normalized_path_string);

    for mut source in sources {
        let migrated_path =
            migrated_legacy_system_source_path(&source, current.as_deref(), default.as_deref());
        let path = migrated_path
            .clone()
            .unwrap_or_else(|| normalize_source_path(&source.codex_home_path));
        if path.is_empty() {
            continue;
        }
        if migrated_path.is_some() {
            source.last_scan_at = None;
            source.status = status_for_path(Path::new(&path));
            source.error = None;
        }
        let identity = source_identity_key(&path);
        if let Some(index) = source_index_by_identity.get(&identity).copied() {
            merge_duplicate_source(&mut normalized_sources[index], source);
            if migrated_path.is_some() {
                let target = &mut normalized_sources[index];
                target.last_scan_at = None;
                target.status = status_for_path(Path::new(&path));
                target.error = None;
            }
            continue;
        }

        let mut normalized = source;
        normalized.codex_home_path = path;
        normalized.id = source_id_for_path(&normalized.codex_home_path);
        normalized.name = normalized_source_name(&normalized.name, &normalized.codex_home_path);
        normalized.is_current = false;
        normalized.is_default = false;
        if normalized.error.is_none() {
            normalized.status = status_for_path(Path::new(&normalized.codex_home_path));
        }
        source_index_by_identity.insert(identity, normalized_sources.len());
        normalized_sources.push(normalized);
    }

    upsert_system_source(
        &mut normalized_sources,
        &mut source_index_by_identity,
        current.as_deref(),
        true,
        false,
        CURRENT_SOURCE_NAME,
        now_ms,
    );
    upsert_system_source(
        &mut normalized_sources,
        &mut source_index_by_identity,
        default.as_deref(),
        false,
        true,
        DEFAULT_SOURCE_NAME,
        now_ms,
    );

    normalized_sources
}

#[cfg(not(windows))]
fn migrated_legacy_system_source_path(
    source: &SessionSource,
    current_path: Option<&str>,
    default_path: Option<&str>,
) -> Option<String> {
    [
        (source.is_current, current_path),
        (source.is_default, default_path),
    ]
    .into_iter()
    .find_map(|(is_system_source, expected)| {
        let expected = is_system_source.then_some(expected).flatten()?;
        legacy_windows_normalized_unix_path_matches(&source.codex_home_path, expected)
            .then(|| expected.to_string())
    })
}

#[cfg(windows)]
fn migrated_legacy_system_source_path(
    _source: &SessionSource,
    _current_path: Option<&str>,
    _default_path: Option<&str>,
) -> Option<String> {
    None
}

#[cfg(not(windows))]
fn legacy_windows_normalized_unix_path_matches(saved: &str, expected: &str) -> bool {
    let Some(expected) = expected.strip_prefix('/') else {
        return false;
    };
    saved.trim().trim_end_matches(['\\', '/']) == expected.replace('/', "\\").trim_end_matches('\\')
}

pub(crate) fn add_session_source(
    sources: Vec<SessionSource>,
    name: &str,
    path: &Path,
    now_ms: i64,
) -> Result<Vec<SessionSource>, String> {
    let normalized_path = normalized_path_string(path)
        .ok_or_else(|| "Session source path cannot be empty".to_string())?;
    let identity = source_identity_key(&normalized_path);
    let mut sources = sources;
    if let Some(source) = sources
        .iter_mut()
        .find(|source| source_identity_key(&source.codex_home_path) == identity)
    {
        source.name = normalized_source_name(name, &normalized_path);
        source.enabled = true;
        source.codex_home_path = normalized_path;
        source.status = status_for_path(Path::new(&source.codex_home_path));
        source.error = None;
        return Ok(sources);
    }

    sources.push(SessionSource {
        id: source_id_for_path(&normalized_path),
        name: normalized_source_name(name, &normalized_path),
        codex_home_path: normalized_path.clone(),
        enabled: true,
        is_current: false,
        is_default: false,
        discovered_at: now_ms,
        last_scan_at: None,
        status: status_for_path(Path::new(&normalized_path)),
        error: None,
    });
    Ok(sources)
}

pub(crate) fn rename_session_source(
    sources: &mut [SessionSource],
    source_id: &str,
    name: &str,
) -> Result<(), String> {
    let source = find_source_mut(sources, source_id)?;
    source.name = normalized_source_name(name, &source.codex_home_path);
    Ok(())
}

pub(crate) fn set_session_source_enabled(
    sources: &mut [SessionSource],
    source_id: &str,
    enabled: bool,
) -> Result<(), String> {
    find_source_mut(sources, source_id)?.enabled = enabled;
    Ok(())
}

pub(crate) fn remove_session_source(
    sources: &mut Vec<SessionSource>,
    source_id: &str,
) -> Result<(), String> {
    let index = sources
        .iter()
        .position(|source| source.id == source_id)
        .ok_or_else(|| "Session source not found".to_string())?;
    if sources[index].is_current || sources[index].is_default {
        return Err("System session sources cannot be removed".to_string());
    }
    sources.remove(index);
    Ok(())
}

pub(crate) fn mark_session_source_scan_started(
    sources: &mut [SessionSource],
    source_id: &str,
) -> Result<(), String> {
    let source = find_source_mut(sources, source_id)?;
    source.status = SessionSourceStatus::Scanning;
    source.error = None;
    Ok(())
}

pub(crate) fn mark_session_source_scan_finished(
    sources: &mut [SessionSource],
    source_id: &str,
    scanned_at: i64,
    error: Option<String>,
) -> Result<(), String> {
    let source = find_source_mut(sources, source_id)?;
    source.last_scan_at = Some(scanned_at);
    source.status = error
        .as_ref()
        .map(|_| SessionSourceStatus::Invalid)
        .unwrap_or_else(|| status_for_path(Path::new(&source.codex_home_path)));
    source.error = error;
    Ok(())
}

fn upsert_system_source(
    sources: &mut Vec<SessionSource>,
    source_index_by_identity: &mut HashMap<String, usize>,
    path: Option<&str>,
    is_current: bool,
    is_default: bool,
    default_name: &str,
    now_ms: i64,
) {
    let Some(path) = path else {
        return;
    };
    let identity = source_identity_key(path);
    if let Some(index) = source_index_by_identity.get(&identity).copied() {
        let source = &mut sources[index];
        source.is_current |= is_current;
        source.is_default |= is_default;
        if source.error.is_none() {
            source.status = status_for_path(Path::new(&source.codex_home_path));
        }
        return;
    }

    source_index_by_identity.insert(identity, sources.len());
    sources.push(SessionSource {
        id: source_id_for_path(path),
        name: default_name.to_string(),
        codex_home_path: path.to_string(),
        enabled: true,
        is_current,
        is_default,
        discovered_at: now_ms,
        last_scan_at: None,
        status: status_for_path(Path::new(path)),
        error: None,
    });
}

fn merge_duplicate_source(target: &mut SessionSource, duplicate: SessionSource) {
    if target.name.trim().is_empty() && !duplicate.name.trim().is_empty() {
        target.name = duplicate.name;
    }
    target.discovered_at = target.discovered_at.min(duplicate.discovered_at);
    target.last_scan_at = target.last_scan_at.max(duplicate.last_scan_at);
}

fn normalized_path_string(path: &Path) -> Option<String> {
    let normalized = normalize_source_path(&path.to_string_lossy());
    (!normalized.is_empty()).then_some(normalized)
}

fn normalized_source_name(name: &str, normalized_path: &str) -> String {
    let trimmed = name.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    Path::new(normalized_path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(normalized_path)
        .to_string()
}

fn source_id_for_path(path: &str) -> String {
    let digest = Sha256::digest(source_identity_key(path).as_bytes());
    format!("source-{}", hex_prefix(&digest, 16))
}

fn hex_prefix(bytes: &[u8], byte_count: usize) -> String {
    bytes
        .iter()
        .take(byte_count)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn status_for_path(path: &Path) -> SessionSourceStatus {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => SessionSourceStatus::Ready,
        Ok(_) => SessionSourceStatus::Invalid,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => SessionSourceStatus::Missing,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            SessionSourceStatus::Denied
        }
        Err(_) => SessionSourceStatus::Invalid,
    }
}

fn find_source_mut<'a>(
    sources: &'a mut [SessionSource],
    source_id: &str,
) -> Result<&'a mut SessionSource, String> {
    sources
        .iter_mut()
        .find(|source| source.id == source_id)
        .ok_or_else(|| "Session source not found".to_string())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        add_session_source, reconcile_session_sources, remove_session_source,
        rename_session_source, session_source_for_codex_home, set_session_source_enabled,
    };
    use crate::types::{SessionSource, SessionSourceStatus};

    fn source(path: &str, name: &str, discovered_at: i64) -> SessionSource {
        SessionSource {
            id: "legacy-id".to_string(),
            name: name.to_string(),
            codex_home_path: path.to_string(),
            enabled: true,
            is_current: false,
            is_default: false,
            discovered_at,
            last_scan_at: None,
            status: SessionSourceStatus::Ready,
            error: None,
        }
    }

    #[cfg(windows)]
    #[test]
    fn builds_stable_current_source_from_codex_home() {
        let left =
            session_source_for_codex_home(Path::new(r"C:\Users\Test\.codex\")).expect("source");
        let right =
            session_source_for_codex_home(Path::new(r"c:/users/test/.codex")).expect("source");

        assert_eq!(left.id, right.id);
        assert!(left.is_current);
        assert_eq!(left.codex_home_path, r"C:\Users\Test\.codex");
    }

    #[cfg(windows)]
    #[test]
    fn reconcile_preserves_history_and_upserts_system_sources() {
        let sources = vec![source(r"D:\Profiles\Old", "Old profile", 10)];
        let reconciled = reconcile_session_sources(
            sources,
            Some(Path::new(r"D:\Profiles\Current")),
            Some(Path::new(r"C:\Users\Lenovo\.codex")),
            20,
        );

        assert_eq!(reconciled.len(), 3);
        assert!(reconciled.iter().any(|source| source.name == "Old profile"));
        assert!(reconciled.iter().any(|source| source.is_current));
        assert!(reconciled.iter().any(|source| source.is_default));
    }

    #[cfg(windows)]
    #[test]
    fn reconcile_deduplicates_paths_case_insensitively() {
        let mut saved = source(r"C:\Users\Lenovo\.CODEX", "Saved name", 10);
        saved.enabled = false;
        let sources = vec![saved, source(r"c:/users/lenovo/.codex/", "Duplicate", 20)];
        let reconciled = reconcile_session_sources(
            sources,
            Some(Path::new(r"c:\users\lenovo\.codex")),
            Some(Path::new(r"C:\Users\Lenovo\.codex")),
            30,
        );

        assert_eq!(reconciled.len(), 1);
        assert_eq!(reconciled[0].name, "Saved name");
        assert!(reconciled[0].is_current);
        assert!(reconciled[0].is_default);
        assert_eq!(reconciled[0].discovered_at, 10);
        assert!(!reconciled[0].enabled);
    }

    #[cfg(not(windows))]
    #[test]
    fn builds_stable_current_source_from_unix_codex_home() {
        let source =
            session_source_for_codex_home(Path::new("/Users/test/.codex/")).expect("source");

        assert!(source.is_current);
        assert_eq!(source.codex_home_path, "/Users/test/.codex");
    }

    #[cfg(not(windows))]
    #[test]
    fn reconcile_migrates_legacy_malformed_unix_system_source() {
        let mut saved = source(r"Users\test\.codex", "Current CODEX_HOME", 10);
        saved.is_current = true;
        saved.is_default = true;
        saved.last_scan_at = Some(20);
        saved.status = SessionSourceStatus::Invalid;
        saved.error = Some("Unable to access session source".to_string());

        let reconciled = reconcile_session_sources(
            vec![saved],
            Some(Path::new("/Users/test/.codex")),
            Some(Path::new("/Users/test/.codex")),
            30,
        );

        assert_eq!(reconciled.len(), 1);
        assert_eq!(reconciled[0].codex_home_path, "/Users/test/.codex");
        assert!(reconciled[0].is_current);
        assert!(reconciled[0].is_default);
        assert_eq!(reconciled[0].last_scan_at, None);
        assert_eq!(reconciled[0].error, None);
    }

    #[cfg(not(windows))]
    #[test]
    fn reconcile_migration_clears_errors_on_an_existing_native_duplicate() {
        let mut native = source("/Users/test/.codex", "Native", 10);
        native.status = SessionSourceStatus::Invalid;
        native.error = Some("stale scan error".to_string());
        let mut legacy = source(r"Users\test\.codex", "Current CODEX_HOME", 20);
        legacy.is_current = true;

        let reconciled = reconcile_session_sources(
            vec![native, legacy],
            Some(Path::new("/Users/test/.codex")),
            None,
            30,
        );

        assert_eq!(reconciled.len(), 1);
        assert!(reconciled[0].is_current);
        assert_eq!(reconciled[0].last_scan_at, None);
        assert_eq!(reconciled[0].error, None);
    }

    #[cfg(not(windows))]
    #[test]
    fn reconcile_keeps_case_distinct_unix_sources() {
        let sources = vec![
            source("/Users/test/.CODEX", "Upper", 10),
            source("/Users/test/.codex", "Lower", 20),
        ];
        let reconciled = reconcile_session_sources(sources, None, None, 30);

        assert_eq!(reconciled.len(), 2);
    }

    #[test]
    fn reconcile_keeps_stable_ids_and_scan_errors() {
        let mut saved = source(r"D:\Profiles\Work", "Work", 10);
        saved.error = Some("parse failed".to_string());
        saved.status = SessionSourceStatus::Invalid;

        let first = reconcile_session_sources(vec![saved], None, None, 20);
        let second = reconcile_session_sources(first.clone(), None, None, 30);

        assert_eq!(first[0].id, second[0].id);
        assert_eq!(second[0].error.as_deref(), Some("parse failed"));
        assert!(matches!(second[0].status, SessionSourceStatus::Invalid));
    }

    #[cfg(windows)]
    #[test]
    fn management_operations_never_touch_disk() {
        let missing = Path::new(r"Z:\Missing\Codex");
        let mut sources = add_session_source(Vec::new(), " Work ", missing, 10).unwrap();
        let source_id = sources[0].id.clone();

        rename_session_source(&mut sources, &source_id, "Renamed").unwrap();
        set_session_source_enabled(&mut sources, &source_id, false).unwrap();
        assert_eq!(sources[0].name, "Renamed");
        assert!(!sources[0].enabled);
        assert!(matches!(sources[0].status, SessionSourceStatus::Missing));

        remove_session_source(&mut sources, &source_id).unwrap();
        assert!(sources.is_empty());
        assert!(!missing.exists());
    }

    #[cfg(windows)]
    #[test]
    fn system_sources_cannot_be_removed() {
        let mut sources = reconcile_session_sources(
            Vec::new(),
            Some(Path::new(r"D:\Profiles\Current")),
            None,
            10,
        );
        let source_id = sources[0].id.clone();

        let error = remove_session_source(&mut sources, &source_id).unwrap_err();
        assert_eq!(error, "System session sources cannot be removed");
    }
}

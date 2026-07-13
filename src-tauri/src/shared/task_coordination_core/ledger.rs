use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::types::{CoordinationCheckpoint, ResourceClaim, TaskCoordinationGroup, TaskParticipant};

const LEDGER_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoordinationLedger {
    pub version: u32,
    pub groups: HashMap<String, TaskCoordinationGroup>,
    pub participants: HashMap<String, Vec<TaskParticipant>>,
    pub claims: HashMap<String, Vec<ResourceClaim>>,
    pub checkpoints: HashMap<String, Vec<CoordinationCheckpoint>>,
}

impl Default for CoordinationLedger {
    fn default() -> Self {
        Self {
            version: LEDGER_VERSION,
            groups: HashMap::new(),
            participants: HashMap::new(),
            claims: HashMap::new(),
            checkpoints: HashMap::new(),
        }
    }
}

pub fn read_ledger(path: &Path) -> Result<CoordinationLedger, String> {
    restore_backup(path)?;
    if !path.exists() {
        return Ok(CoordinationLedger::default());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    if data.trim().is_empty() {
        return Ok(CoordinationLedger::default());
    }
    let ledger: CoordinationLedger =
        serde_json::from_str(&data).map_err(|e| format!("Invalid coordination ledger: {e}"))?;
    Ok(ledger)
}

pub fn write_ledger(path: &Path, ledger: &CoordinationLedger) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp = temp_path(path);
    let backup = backup_path(path);
    let data = serde_json::to_string_pretty(ledger).map_err(|e| e.to_string())?;
    std::fs::write(&temp, data).map_err(|e| e.to_string())?;
    if path.exists() {
        if backup.exists() {
            std::fs::remove_file(&backup).map_err(|e| e.to_string())?;
        }
        std::fs::rename(path, &backup).map_err(|e| e.to_string())?;
    }
    match std::fs::rename(&temp, path) {
        Ok(()) => {
            if backup.exists() {
                let _ = std::fs::remove_file(&backup);
            }
            Ok(())
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp);
            if backup.exists() && !path.exists() {
                let _ = std::fs::rename(&backup, path);
            }
            Err(e.to_string())
        }
    }
}

fn temp_path(path: &Path) -> PathBuf {
    let mut v = path.as_os_str().to_os_string();
    v.push(".tmp");
    PathBuf::from(v)
}

fn backup_path(path: &Path) -> PathBuf {
    let mut v = path.as_os_str().to_os_string();
    v.push(".bak");
    PathBuf::from(v)
}

fn restore_backup(path: &Path) -> Result<(), String> {
    let backup = backup_path(path);
    if !path.exists() && backup.exists() {
        std::fs::rename(&backup, path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "coord-ledger-{name}-{}.json",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn write_and_read_roundtrip() {
        let path = test_path("roundtrip");
        let mut ledger = CoordinationLedger::default();
        ledger.groups.insert(
            "g1".to_string(),
            TaskCoordinationGroup {
                id: "g1".to_string(),
                name: "Test".to_string(),
                repository_id: "repo1".to_string(),
                repository_root: "/repo".to_string(),
                base_revision: None,
                coordinator_thread_key: None,
                mode: Default::default(),
                status: Default::default(),
                created_at: 0,
                updated_at: 0,
            },
        );
        write_ledger(&path, &ledger).unwrap();
        let read = read_ledger(&path).unwrap();
        assert_eq!(read.version, 1);
        assert!(read.groups.contains_key("g1"));
    }

    #[test]
    fn empty_path_returns_default() {
        let path = test_path("empty");
        std::fs::write(&path, "").unwrap();
        let ledger = read_ledger(&path).unwrap();
        assert_eq!(ledger, CoordinationLedger::default());
    }

    #[test]
    fn missing_path_returns_default() {
        let path = test_path("missing");
        // already removed by test_path
        let ledger = read_ledger(&path).unwrap();
        assert_eq!(ledger, CoordinationLedger::default());
    }

    #[test]
    fn corrupt_data_returns_error() {
        let path = test_path("corrupt");
        std::fs::write(&path, "{{{corrupt").unwrap();
        assert!(read_ledger(&path).is_err());
    }
}

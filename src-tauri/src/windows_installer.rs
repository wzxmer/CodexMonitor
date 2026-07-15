use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const PRODUCT_NAME: &str = "Codex Monitor";
const UNINSTALL_ROOT: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
const SNAPSHOT_SCHEMA_VERSION: u32 = 2;
const REPARSE_POINT_ATTRIBUTE: u32 = 0x400;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum RegistryHive {
    CurrentUser,
    LocalMachine,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum RegistryView {
    Registry32,
    Registry64,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegistryLocator {
    hive: RegistryHive,
    view: RegistryView,
    key_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RawRegistryValue {
    value_type: u32,
    data_base64: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum InstallerFamily {
    Msi,
    Nsis,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallerRecord {
    locator: RegistryLocator,
    family: InstallerFamily,
    display_version: Option<String>,
    uninstall_string: Option<String>,
    install_location: Option<String>,
    product_code: Option<String>,
    has_subkeys: bool,
    values: BTreeMap<String, RawRegistryValue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileSnapshot {
    role: String,
    path: String,
    size: u64,
    sha256: String,
    attributes: u32,
    shortcut_target: Option<String>,
}

impl FileSnapshot {
    fn is_reparse_point(&self) -> bool {
        self.attributes & REPARSE_POINT_ATTRIBUTE != 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SystemObservation {
    current_version: String,
    current_exe: String,
    records: Vec<InstallerRecord>,
    files: Vec<FileSnapshot>,
    inspection_errors: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallerRecordSummary {
    family: InstallerFamily,
    hive: RegistryHive,
    view: RegistryView,
    display_version: Option<String>,
    install_location: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowsInstallerRepairPreview {
    status: String,
    recovery_required: bool,
    fingerprint: Option<String>,
    current_version: String,
    records: Vec<InstallerRecordSummary>,
    blockers: Vec<String>,
    planned_actions: Vec<String>,
}

impl WindowsInstallerRepairPreview {
    fn unsupported() -> Self {
        Self {
            status: "unsupported".into(),
            recovery_required: false,
            fingerprint: None,
            current_version: env!("CARGO_PKG_VERSION").into(),
            records: Vec::new(),
            blockers: vec![
                "Windows installer repair is only available in the Windows desktop app.".into(),
            ],
            planned_actions: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowsInstallerRepairResult {
    transaction_id: Option<String>,
    status: String,
    fingerprint: Option<String>,
    message: Option<String>,
}

impl WindowsInstallerRepairResult {
    fn unsupported() -> Self {
        Self {
            transaction_id: None,
            status: "unsupported".into(),
            fingerprint: None,
            message: Some(
                "Windows installer repair is only available in the Windows desktop app.".into(),
            ),
        }
    }
}

#[derive(Debug, Clone)]
struct RepairPlan {
    fingerprint: String,
    msi: InstallerRecord,
    nsis: InstallerRecord,
    current_exe: FileSnapshot,
    files: Vec<FileSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileMoveSnapshot {
    source: FileSnapshot,
    quarantine_path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum TransactionState {
    Prepared,
    Applying,
    Verifying,
    Completed,
    RollingBack,
    RolledBack,
    RollbackFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepairManifest {
    schema_version: u32,
    journal_revision: u64,
    transaction_id: String,
    operation_id: String,
    state: TransactionState,
    pre_fingerprint: String,
    post_fingerprint: Option<String>,
    msi_digest: String,
    current_exe: FileSnapshot,
    nsis_record: InstallerRecord,
    files: Vec<FileMoveSnapshot>,
    moved_file_count: usize,
    pending_file_move: Option<usize>,
    registry_deleted: bool,
    registry_delete_pending: bool,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum JournalFileKind {
    Backup,
    Temp,
    Primary,
}

#[derive(Debug, Clone)]
struct JournalCandidate {
    kind: JournalFileKind,
    manifest: RepairManifest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RecoveryScopeMode {
    TrustedInMemory,
    Incomplete,
    CompletedRollback,
}

fn raw_registry_string(record: &InstallerRecord, name: &str) -> Result<String, String> {
    let value = record
        .values
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(name))
        .map(|(_, value)| value)
        .ok_or_else(|| format!("Installer registry snapshot is missing {name}."))?;
    if value.value_type != 1 {
        return Err(format!("Installer registry snapshot {name} is not REG_SZ."));
    }
    let bytes = BASE64
        .decode(&value.data_base64)
        .map_err(|error| format!("Invalid installer registry snapshot {name}: {error}"))?;
    if bytes.len() % 2 != 0 {
        return Err(format!(
            "Installer registry snapshot {name} has invalid UTF-16 bytes."
        ));
    }
    let mut units = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .collect::<Vec<_>>();
    while units.last() == Some(&0) {
        units.pop();
    }
    String::from_utf16(&units)
        .map_err(|error| format!("Invalid installer registry snapshot {name}: {error}"))
}

fn validate_nsis_record_scope(record: &InstallerRecord) -> Result<PathBuf, String> {
    if record.locator.hive != RegistryHive::CurrentUser
        || record.family != InstallerFamily::Nsis
        || record.has_subkeys
    {
        return Err("Recovery registry scope is not one flat HKCU NSIS record.".into());
    }
    let prefix = format!(r"{UNINSTALL_ROOT}\");
    let subkey = record
        .locator
        .key_path
        .strip_prefix(&prefix)
        .filter(|value| !value.is_empty() && !value.contains(['\\', '/']))
        .ok_or("Recovery registry key is outside the exact uninstall root.")?;
    if subkey.trim() != subkey {
        return Err("Recovery registry subkey is not canonical.".into());
    }
    if raw_registry_string(record, "DisplayName")? != PRODUCT_NAME {
        return Err("Recovery registry snapshot has a different product name.".into());
    }
    let raw_uninstall = raw_registry_string(record, "UninstallString")?;
    let raw_path = parse_strict_uninstall_path(&raw_uninstall)
        .ok_or("Recovery registry snapshot has an unsafe uninstall path.")?;
    let typed_path = record
        .uninstall_string
        .as_deref()
        .and_then(parse_strict_uninstall_path)
        .ok_or("Recovery registry model has an unsafe uninstall path.")?;
    if normalize_path(&raw_path) != normalize_path(&typed_path) {
        return Err("Recovery registry raw and typed uninstall paths differ.".into());
    }
    Ok(raw_path)
}

fn journal_file_identity(path: &Path) -> Result<(String, JournalFileKind), String> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Installer repair journal has an invalid file name.")?;
    let (transaction_id, kind) = if let Some(value) = file_name.strip_suffix(".json.tmp") {
        (value, JournalFileKind::Temp)
    } else if let Some(value) = file_name.strip_suffix(".json.bak") {
        (value, JournalFileKind::Backup)
    } else if let Some(value) = file_name.strip_suffix(".json") {
        (value, JournalFileKind::Primary)
    } else {
        return Err("Installer repair journal has an unsupported file suffix.".into());
    };
    validate_opaque_id(transaction_id, "journal transaction ID")?;
    Ok((transaction_id.into(), kind))
}

#[cfg(test)]
fn parse_journal_candidate(path: &Path, data: &[u8]) -> Result<JournalCandidate, String> {
    let (transaction_id, kind) = journal_file_identity(path)?;
    let manifest: RepairManifest = serde_json::from_slice(data)
        .map_err(|error| format!("Invalid installer repair journal: {error}"))?;
    validate_manifest(&manifest)?;
    if manifest.transaction_id != transaction_id {
        return Err(
            "Installer repair journal transaction identity does not match its file name.".into(),
        );
    }
    Ok(JournalCandidate { kind, manifest })
}

fn load_latest_journals(entries: Vec<(PathBuf, Vec<u8>)>) -> Result<Vec<RepairManifest>, String> {
    let mut candidates = Vec::new();
    let mut truncated_by_transaction = BTreeMap::<String, Vec<String>>::new();
    for (path, data) in entries {
        let (transaction_id, kind) = journal_file_identity(&path)?;
        let manifest = match serde_json::from_slice::<RepairManifest>(&data) {
            Ok(manifest) => manifest,
            Err(error) => {
                if kind == JournalFileKind::Primary {
                    return Err(format!(
                        "Invalid primary installer repair journal {}: {error}",
                        path.display()
                    ));
                }
                truncated_by_transaction
                    .entry(transaction_id)
                    .or_default()
                    .push(format!("{}: {error}", path.display()));
                continue;
            }
        };
        validate_manifest(&manifest)?;
        if manifest.transaction_id != transaction_id {
            return Err(
                "Installer repair journal transaction identity does not match its file name."
                    .into(),
            );
        }
        candidates.push(JournalCandidate { kind, manifest });
    }
    let valid_transactions = candidates
        .iter()
        .map(|candidate| candidate.manifest.transaction_id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if let Some((transaction_id, errors)) = truncated_by_transaction
        .iter()
        .find(|(transaction_id, _)| !valid_transactions.contains(transaction_id.as_str()))
    {
        return Err(format!(
            "Installer repair journal {transaction_id} has no valid candidate: {}",
            errors.join("; ")
        ));
    }
    select_latest_journals(candidates)
}

fn validate_manifest(manifest: &RepairManifest) -> Result<(), String> {
    if manifest.schema_version != SNAPSHOT_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported installer repair journal schema {}.",
            manifest.schema_version
        ));
    }
    validate_opaque_id(&manifest.transaction_id, "journal transaction ID")?;
    validate_opaque_id(&manifest.operation_id, "journal operation ID")?;
    if manifest.journal_revision == 0 {
        return Err("Installer repair journal revision is missing.".into());
    }
    if manifest.moved_file_count > manifest.files.len() {
        return Err("Installer repair journal has an invalid moved-file count.".into());
    }
    if let Some(index) = manifest.pending_file_move {
        if index >= manifest.files.len() || index != manifest.moved_file_count {
            return Err("Installer repair journal has an invalid pending file move.".into());
        }
    }
    if manifest.registry_deleted && manifest.registry_delete_pending {
        return Err("Installer repair journal has conflicting registry states.".into());
    }
    if manifest.state == TransactionState::Completed
        && (manifest.pending_file_move.is_some()
            || manifest.registry_delete_pending
            || manifest.moved_file_count != manifest.files.len()
            || !manifest.registry_deleted)
    {
        return Err("Completed installer repair journal is internally inconsistent.".into());
    }
    if manifest.state == TransactionState::RolledBack
        && (manifest.pending_file_move.is_some()
            || manifest.registry_delete_pending
            || manifest.moved_file_count != 0
            || manifest.registry_deleted)
    {
        return Err("Rolled-back installer repair journal is internally inconsistent.".into());
    }
    Ok(())
}

fn select_latest_journals(
    candidates: Vec<JournalCandidate>,
) -> Result<Vec<RepairManifest>, String> {
    let mut grouped = BTreeMap::<String, Vec<JournalCandidate>>::new();
    for candidate in candidates {
        grouped
            .entry(candidate.manifest.transaction_id.clone())
            .or_default()
            .push(candidate);
    }
    let mut manifests = Vec::with_capacity(grouped.len());
    for (transaction_id, group) in grouped {
        let latest_revision = group
            .iter()
            .map(|candidate| candidate.manifest.journal_revision)
            .max()
            .ok_or("Installer repair journal candidate group was empty.")?;
        let mut latest = group
            .into_iter()
            .filter(|candidate| candidate.manifest.journal_revision == latest_revision)
            .collect::<Vec<_>>();
        let first = &latest[0].manifest;
        if latest.iter().any(|candidate| candidate.manifest != *first) {
            return Err(format!(
                "Installer repair journal {transaction_id} has conflicting latest candidates."
            ));
        }
        latest.sort_by_key(|candidate| candidate.kind);
        manifests.push(latest.pop().expect("non-empty latest journal set").manifest);
    }
    Ok(manifests)
}

trait RepairBackend {
    fn observe(&mut self, current_version: &str) -> Result<SystemObservation, String>;
    fn move_file(
        &mut self,
        source: &Path,
        destination: &Path,
        expected: &FileSnapshot,
    ) -> Result<(), String>;
    fn delete_record(&mut self, record: &InstallerRecord) -> Result<(), String>;
    fn restore_record(&mut self, record: &InstallerRecord) -> Result<(), String>;
    fn persist_manifest(&mut self, manifest: &RepairManifest) -> Result<(), String>;
    fn list_manifests(&mut self) -> Result<Vec<RepairManifest>, String>;
    fn quarantine_path(
        &self,
        source: &Path,
        transaction_id: &str,
        index: usize,
    ) -> Result<PathBuf, String>;
    fn canonical_nsis_shortcut_path(&self) -> Result<Option<PathBuf>, String>;
}

struct RepairEngine<B> {
    backend: B,
    current_version: String,
}

impl<B: RepairBackend> RepairEngine<B> {
    fn new(backend: B, current_version: impl Into<String>) -> Self {
        Self {
            backend,
            current_version: current_version.into(),
        }
    }

    fn preview(&mut self) -> WindowsInstallerRepairPreview {
        let manifests = match self.backend.list_manifests() {
            Ok(manifests) => manifests,
            Err(error) => {
                return WindowsInstallerRepairPreview {
                    status: "blocked".into(),
                    recovery_required: false,
                    fingerprint: None,
                    current_version: self.current_version.clone(),
                    records: Vec::new(),
                    blockers: vec![format!(
                        "Installer repair journals could not be read safely: {error}"
                    )],
                    planned_actions: Vec::new(),
                };
            }
        };
        let recovery_required = manifests
            .iter()
            .any(|manifest| transaction_requires_recovery(manifest.state));
        let observation = match self.backend.observe(&self.current_version) {
            Ok(observation) => observation,
            Err(error) => {
                let mut blockers = Vec::new();
                if recovery_required {
                    blockers.push(
                        "An interrupted installer repair requires explicit recovery before another repair."
                            .into(),
                    );
                }
                blockers.push(format!("Installer state could not be read safely: {error}"));
                return WindowsInstallerRepairPreview {
                    status: "blocked".into(),
                    recovery_required,
                    fingerprint: None,
                    current_version: self.current_version.clone(),
                    records: Vec::new(),
                    blockers,
                    planned_actions: Vec::new(),
                };
            }
        };
        let mut preview = preview_from_observation(&observation);
        if recovery_required {
            preview.status = "blocked".into();
            preview.recovery_required = true;
            preview.fingerprint = None;
            preview.blockers = vec![
                "An interrupted installer repair requires explicit recovery before another repair."
                    .into(),
            ];
            preview.planned_actions.clear();
        }
        preview
    }

    fn apply(
        &mut self,
        expected_fingerprint: &str,
        operation_id: &str,
    ) -> Result<WindowsInstallerRepairResult, String> {
        validate_opaque_id(operation_id, "operation ID")?;
        self.recover_incomplete_transactions()?;
        if let Some(existing) = self
            .backend
            .list_manifests()?
            .into_iter()
            .find(|manifest| manifest.operation_id == operation_id)
        {
            return self.result_for_existing(existing);
        }

        let observation = self.backend.observe(&self.current_version)?;
        let plan = build_repair_plan(&observation).map_err(|blockers| blockers.join(" "))?;
        if plan.fingerprint != expected_fingerprint {
            return Err("Installer state changed after preview; no changes were made.".into());
        }

        let transaction_id = uuid::Uuid::new_v4().to_string();
        let mut files = Vec::with_capacity(plan.files.len());
        for (index, file) in plan.files.iter().enumerate() {
            let quarantine =
                self.backend
                    .quarantine_path(Path::new(&file.path), &transaction_id, index)?;
            files.push(FileMoveSnapshot {
                source: file.clone(),
                quarantine_path: quarantine.to_string_lossy().into_owned(),
            });
        }
        let mut manifest = RepairManifest {
            schema_version: SNAPSHOT_SCHEMA_VERSION,
            journal_revision: 0,
            transaction_id: transaction_id.clone(),
            operation_id: operation_id.to_string(),
            state: TransactionState::Prepared,
            pre_fingerprint: plan.fingerprint,
            post_fingerprint: None,
            msi_digest: record_digest(&plan.msi),
            current_exe: plan.current_exe,
            nsis_record: plan.nsis,
            files,
            moved_file_count: 0,
            pending_file_move: None,
            registry_deleted: false,
            registry_delete_pending: false,
            last_error: None,
        };
        self.persist(&mut manifest)?;
        manifest.state = TransactionState::Applying;
        self.persist(&mut manifest)?;

        let apply_result = self.apply_steps(&mut manifest);
        if let Err(error) = apply_result {
            manifest.last_error = Some(error.clone());
            let rollback_result =
                self.rollback_manifest(&mut manifest, RecoveryScopeMode::TrustedInMemory);
            return match rollback_result {
                Ok(()) => Err(format!("Repair failed and was rolled back: {error}")),
                Err(rollback_error) => Err(format!(
                    "Repair failed: {error}. Automatic rollback also failed: {rollback_error}"
                )),
            };
        }

        Ok(WindowsInstallerRepairResult {
            transaction_id: Some(transaction_id),
            status: "completed".into(),
            fingerprint: manifest.post_fingerprint,
            message: None,
        })
    }

    fn rollback(
        &mut self,
        transaction_id: &str,
        expected_post_fingerprint: &str,
    ) -> Result<WindowsInstallerRepairResult, String> {
        validate_opaque_id(transaction_id, "transaction ID")?;
        let Some(mut manifest) = self
            .backend
            .list_manifests()?
            .into_iter()
            .find(|manifest| manifest.transaction_id == transaction_id)
        else {
            return Err("Repair transaction was not found.".into());
        };
        if manifest.state == TransactionState::RolledBack {
            return Ok(WindowsInstallerRepairResult {
                transaction_id: Some(transaction_id.into()),
                status: "rolledBack".into(),
                fingerprint: Some(manifest.pre_fingerprint),
                message: None,
            });
        }
        if manifest.state != TransactionState::Completed {
            return Err("Only a completed repair can be rolled back explicitly.".into());
        }
        let stored_post = manifest
            .post_fingerprint
            .as_deref()
            .ok_or("Completed repair is missing its post-repair fingerprint.")?;
        if stored_post != expected_post_fingerprint {
            return Err("Rollback fingerprint does not match the completed repair.".into());
        }
        let observation = self.backend.observe(&self.current_version)?;
        let current_fingerprint = observation_fingerprint(&observation);
        if current_fingerprint != stored_post {
            return Err("Installer state changed after repair; rollback was refused.".into());
        }
        self.rollback_manifest(&mut manifest, RecoveryScopeMode::CompletedRollback)?;
        Ok(WindowsInstallerRepairResult {
            transaction_id: Some(transaction_id.into()),
            status: "rolledBack".into(),
            fingerprint: Some(manifest.pre_fingerprint),
            message: None,
        })
    }

    fn recover(&mut self) -> Result<WindowsInstallerRepairResult, String> {
        let recovered = self.recover_incomplete_transactions()?;
        Ok(WindowsInstallerRepairResult {
            transaction_id: None,
            status: "rolledBack".into(),
            fingerprint: None,
            message: Some(if recovered == 0 {
                "No interrupted installer repair required recovery.".into()
            } else {
                format!("Recovered {recovered} interrupted installer repair transaction(s).")
            }),
        })
    }

    fn apply_steps(&mut self, manifest: &mut RepairManifest) -> Result<(), String> {
        for index in manifest.moved_file_count..manifest.files.len() {
            let file = manifest.files[index].clone();
            manifest.pending_file_move = Some(index);
            self.persist(manifest)?;
            self.backend.move_file(
                Path::new(&file.source.path),
                Path::new(&file.quarantine_path),
                &file.source,
            )?;
            manifest.moved_file_count = index + 1;
            manifest.pending_file_move = None;
            self.persist(manifest)?;
        }
        manifest.registry_delete_pending = true;
        self.persist(manifest)?;
        self.backend.delete_record(&manifest.nsis_record)?;
        manifest.registry_deleted = true;
        manifest.registry_delete_pending = false;
        self.persist(manifest)?;
        manifest.state = TransactionState::Verifying;
        self.persist(manifest)?;

        let post = self.backend.observe(&self.current_version)?;
        verify_post_repair(&post, manifest)?;
        manifest.post_fingerprint = Some(observation_fingerprint(&post));
        manifest.state = TransactionState::Completed;
        manifest.last_error = None;
        self.persist(manifest)
    }

    fn result_for_existing(
        &mut self,
        mut manifest: RepairManifest,
    ) -> Result<WindowsInstallerRepairResult, String> {
        match manifest.state {
            TransactionState::Completed => Ok(WindowsInstallerRepairResult {
                transaction_id: Some(manifest.transaction_id),
                status: "completed".into(),
                fingerprint: manifest.post_fingerprint,
                message: None,
            }),
            TransactionState::RolledBack => Ok(WindowsInstallerRepairResult {
                transaction_id: Some(manifest.transaction_id),
                status: "rolledBack".into(),
                fingerprint: Some(manifest.pre_fingerprint),
                message: None,
            }),
            _ => {
                self.rollback_manifest(&mut manifest, RecoveryScopeMode::Incomplete)?;
                Ok(WindowsInstallerRepairResult {
                    transaction_id: Some(manifest.transaction_id),
                    status: "rolledBack".into(),
                    fingerprint: Some(manifest.pre_fingerprint),
                    message: Some(
                        "An interrupted repair was restored. Preview again before retrying.".into(),
                    ),
                })
            }
        }
    }

    fn recover_incomplete_transactions(&mut self) -> Result<usize, String> {
        let incomplete = self
            .backend
            .list_manifests()?
            .into_iter()
            .filter(|manifest| transaction_requires_recovery(manifest.state))
            .collect::<Vec<_>>();
        let recovered = incomplete.len();
        for mut manifest in incomplete {
            self.rollback_manifest(&mut manifest, RecoveryScopeMode::Incomplete)?;
        }
        Ok(recovered)
    }

    fn validate_recovery_scope(
        &mut self,
        manifest: &RepairManifest,
        mode: RecoveryScopeMode,
    ) -> Result<(), String> {
        validate_manifest(manifest)?;
        let uninstall_path = validate_nsis_record_scope(&manifest.nsis_record)?;
        if manifest.current_exe.role != "currentExe"
            || !Path::new(&manifest.current_exe.path).is_absolute()
            || manifest.current_exe.is_reparse_point()
        {
            return Err(
                "Recovery current executable snapshot is outside the trusted scope.".into(),
            );
        }
        let current_exe_path = Path::new(&manifest.current_exe.path);
        let current_exe_parent = current_exe_path
            .parent()
            .ok_or("Recovery current executable has no parent directory.")?;
        if uninstall_path.parent().map(normalize_path) != Some(normalize_path(current_exe_parent)) {
            return Err("Recovery uninstaller is not beside the current executable.".into());
        }

        let canonical_shortcut = self.backend.canonical_nsis_shortcut_path()?;
        let mut roles = BTreeMap::<String, usize>::new();
        let mut source_paths = std::collections::BTreeSet::new();
        let mut quarantine_paths = std::collections::BTreeSet::new();
        for (index, file) in manifest.files.iter().enumerate() {
            *roles.entry(file.source.role.clone()).or_default() += 1;
            let source = Path::new(&file.source.path);
            let quarantine = Path::new(&file.quarantine_path);
            if !source.is_absolute()
                || !quarantine.is_absolute()
                || file.source.is_reparse_point()
                || source.components().next() != quarantine.components().next()
            {
                return Err(
                    "Recovery file path is not an absolute same-volume trusted path.".into(),
                );
            }
            if !source_paths.insert(normalize_path(source))
                || !quarantine_paths.insert(normalize_path(quarantine))
            {
                return Err("Recovery file paths are duplicated.".into());
            }
            let expected_quarantine =
                self.backend
                    .quarantine_path(source, &manifest.transaction_id, index)?;
            if normalize_path(&expected_quarantine) != normalize_path(quarantine) {
                return Err("Recovery quarantine path is not the backend-derived path.".into());
            }
            match file.source.role.as_str() {
                "nsisUninstaller"
                    if normalize_path(source) == normalize_path(&uninstall_path)
                        && file.source.shortcut_target.is_none() => {}
                "nsisShortcut" => {
                    let expected_shortcut = canonical_shortcut
                        .as_deref()
                        .ok_or("Recovery shortcut scope cannot be resolved.")?;
                    if normalize_path(source) != normalize_path(expected_shortcut)
                        || file
                            .source
                            .shortcut_target
                            .as_deref()
                            .map(|target| normalize_path(Path::new(target)))
                            != Some(normalize_path(current_exe_path))
                    {
                        return Err("Recovery shortcut is outside the canonical app scope.".into());
                    }
                }
                _ => return Err("Recovery file role or ownership is not allowed.".into()),
            }
        }
        if roles.get("nsisUninstaller") != Some(&1)
            || roles.get("nsisShortcut").copied().unwrap_or(0) > 1
            || roles.len() > 2
        {
            return Err("Recovery file roles are missing or duplicated.".into());
        }

        if mode == RecoveryScopeMode::TrustedInMemory {
            return Ok(());
        }

        let observation = self.backend.observe(&self.current_version)?;
        if normalize_path(Path::new(&observation.current_exe)) != normalize_path(current_exe_path) {
            return Err("Running executable path differs from the recovery snapshot.".into());
        }
        let current_exe_files = observation
            .files
            .iter()
            .filter(|file| file.role == "currentExe")
            .collect::<Vec<_>>();
        if current_exe_files.len() != 1
            || !file_snapshot_matches(&manifest.current_exe, current_exe_files[0])
        {
            return Err("Running executable snapshot differs from the recovery snapshot.".into());
        }

        let msi_records = observation
            .records
            .iter()
            .filter(|record| record.family == InstallerFamily::Msi)
            .collect::<Vec<_>>();
        let nsis_records = observation
            .records
            .iter()
            .filter(|record| record.family == InstallerFamily::Nsis)
            .collect::<Vec<_>>();
        if observation
            .records
            .iter()
            .any(|record| record.family == InstallerFamily::Unknown)
            || msi_records.len() != 1
            || observation.records.len() != 1 + nsis_records.len()
        {
            return Err("Current installer registrations are not uniquely owned.".into());
        }
        let msi = msi_records[0];
        if record_digest(msi) != manifest.msi_digest
            || msi.locator.hive != RegistryHive::LocalMachine
            || msi.display_version.as_deref() != Some(self.current_version.as_str())
            || !msi.product_code.as_deref().is_some_and(is_product_code)
            || msi
                .install_location
                .as_deref()
                .map(Path::new)
                .map(normalize_path)
                != Some(normalize_path(current_exe_parent))
        {
            return Err("Current MSI registration differs from the recovery owner.".into());
        }
        match mode {
            RecoveryScopeMode::TrustedInMemory => unreachable!("trusted recovery returned above"),
            RecoveryScopeMode::Incomplete => match nsis_records.as_slice() {
                [record]
                    if record.locator == manifest.nsis_record.locator
                        && record_digest(record) == record_digest(&manifest.nsis_record) => {}
                [] if manifest.registry_delete_pending || manifest.registry_deleted => {}
                [] => {
                    return Err(
                        "NSIS registration is missing without a pending delete journal state."
                            .into(),
                    )
                }
                _ => {
                    return Err("Current NSIS registration differs from the recovery owner.".into())
                }
            },
            RecoveryScopeMode::CompletedRollback if nsis_records.is_empty() => {}
            RecoveryScopeMode::CompletedRollback => {
                return Err("Completed repair unexpectedly has an NSIS registration.".into())
            }
        }
        Ok(())
    }

    fn rollback_manifest(
        &mut self,
        manifest: &mut RepairManifest,
        mode: RecoveryScopeMode,
    ) -> Result<(), String> {
        self.validate_recovery_scope(manifest, mode)?;
        manifest.state = TransactionState::RollingBack;
        let journal_error = self.persist(manifest).err();
        let effective_moved_count = manifest
            .pending_file_move
            .map(|index| index + 1)
            .unwrap_or(manifest.moved_file_count)
            .max(manifest.moved_file_count);
        for index in (0..effective_moved_count).rev() {
            let file = &manifest.files[index];
            let expected = snapshot_at_path(&file.source, &file.quarantine_path);
            if let Err(error) = self.backend.move_file(
                Path::new(&file.quarantine_path),
                Path::new(&file.source.path),
                &expected,
            ) {
                manifest.state = TransactionState::RollbackFailed;
                manifest.last_error = Some(combine_errors(&error, journal_error.as_deref()));
                let _ = self.persist(manifest);
                return Err(combine_errors(&error, journal_error.as_deref()));
            }
            manifest.moved_file_count = index;
            if manifest.pending_file_move == Some(index) {
                manifest.pending_file_move = None;
            }
            let _ = self.persist(manifest);
        }
        if manifest.registry_deleted || manifest.registry_delete_pending {
            if let Err(error) = self.backend.restore_record(&manifest.nsis_record) {
                manifest.state = TransactionState::RollbackFailed;
                manifest.last_error = Some(combine_errors(&error, journal_error.as_deref()));
                let _ = self.persist(manifest);
                return Err(combine_errors(&error, journal_error.as_deref()));
            }
            manifest.registry_deleted = false;
            manifest.registry_delete_pending = false;
            let _ = self.persist(manifest);
        }
        manifest.moved_file_count = 0;
        manifest.pending_file_move = None;
        manifest.registry_deleted = false;
        manifest.registry_delete_pending = false;
        manifest.state = TransactionState::RolledBack;
        manifest.last_error = journal_error
            .as_deref()
            .map(|error| format!("Rollback journal error: {error}"));
        let final_journal_error = self.persist(manifest).err();
        match (journal_error, final_journal_error) {
            (None, None) => Ok(()),
            (first, second) => Err(combine_errors(
                "Rollback completed, but its journal could not be persisted.",
                first.or(second).as_deref(),
            )),
        }
    }

    fn persist(&mut self, manifest: &mut RepairManifest) -> Result<(), String> {
        manifest.journal_revision = manifest
            .journal_revision
            .checked_add(1)
            .ok_or("Installer repair journal revision overflowed.")?;
        self.backend.persist_manifest(manifest)
    }
}

fn preview_from_observation(observation: &SystemObservation) -> WindowsInstallerRepairPreview {
    let records = observation
        .records
        .iter()
        .map(|record| InstallerRecordSummary {
            family: record.family,
            hive: record.locator.hive.clone(),
            view: record.locator.view,
            display_version: record.display_version.clone(),
            install_location: record.install_location.clone(),
        })
        .collect();
    match build_repair_plan(observation) {
        Ok(plan) => WindowsInstallerRepairPreview {
            status: "repairable".into(),
            recovery_required: false,
            fingerprint: Some(plan.fingerprint),
            current_version: observation.current_version.clone(),
            records,
            blockers: Vec::new(),
            planned_actions: vec![
                "Quarantine the verified stale NSIS shortcut and uninstaller when present.".into(),
                "Remove only the exact stale HKCU NSIS uninstall registration.".into(),
                "Verify the current MSI installation, with automatic rollback on failure.".into(),
            ],
        },
        Err(blockers) => WindowsInstallerRepairPreview {
            status: "blocked".into(),
            recovery_required: false,
            fingerprint: None,
            current_version: observation.current_version.clone(),
            records,
            blockers,
            planned_actions: Vec::new(),
        },
    }
}

fn transaction_requires_recovery(state: TransactionState) -> bool {
    matches!(
        state,
        TransactionState::Prepared
            | TransactionState::Applying
            | TransactionState::Verifying
            | TransactionState::RollingBack
            | TransactionState::RollbackFailed
    )
}

fn build_repair_plan(observation: &SystemObservation) -> Result<RepairPlan, Vec<String>> {
    let mut blockers = observation.inspection_errors.clone();
    let msi = observation
        .records
        .iter()
        .filter(|record| record.family == InstallerFamily::Msi)
        .collect::<Vec<_>>();
    let nsis = observation
        .records
        .iter()
        .filter(|record| record.family == InstallerFamily::Nsis)
        .collect::<Vec<_>>();
    if observation
        .records
        .iter()
        .any(|record| record.family == InstallerFamily::Unknown)
    {
        blockers.push("An unrecognized Codex Monitor installer registration exists.".into());
    }
    if msi.len() != 1 {
        blockers.push("Repair requires exactly one MSI registration.".into());
    }
    if nsis.len() != 1 {
        blockers.push("Repair requires exactly one stale NSIS registration.".into());
    }
    if !blockers.is_empty() {
        return Err(blockers);
    }
    let msi = msi[0];
    let nsis = nsis[0];
    if msi.display_version.as_deref() != Some(observation.current_version.as_str()) {
        blockers.push("The MSI registration does not match the running app version.".into());
    }
    if msi.locator.hive != RegistryHive::LocalMachine {
        blockers.push("The healthy MSI registration is not machine-owned.".into());
    }
    if !msi.product_code.as_deref().is_some_and(is_product_code) {
        blockers.push("The MSI registration does not have a valid product code.".into());
    }
    if nsis.locator.hive != RegistryHive::CurrentUser {
        blockers.push("Only a stale current-user NSIS registration can be repaired.".into());
    }
    if nsis.has_subkeys {
        blockers.push("The NSIS uninstall registration contains unexpected subkeys.".into());
    }
    let nsis_version = nsis.display_version.as_deref();
    if nsis_version
        .zip(Some(observation.current_version.as_str()))
        .and_then(|(left, right)| compare_versions(left, right))
        != Some(std::cmp::Ordering::Less)
    {
        blockers.push("The NSIS registration is not a verified older version.".into());
    }
    let current_exe = normalize_path(Path::new(&observation.current_exe));
    let current_parent = Path::new(&observation.current_exe)
        .parent()
        .map(normalize_path)
        .unwrap_or_default();
    let msi_location = msi
        .install_location
        .as_deref()
        .map(|path| normalize_path(Path::new(path)));
    if msi_location.as_deref() != Some(current_parent.as_str()) {
        blockers.push("The MSI install location does not own the running executable.".into());
    }
    let Some(uninstall_path) = nsis
        .uninstall_string
        .as_deref()
        .and_then(parse_strict_uninstall_path)
    else {
        blockers.push("The NSIS uninstall command is not an exact uninstall.exe path.".into());
        return Err(blockers);
    };
    let uninstall_parent = uninstall_path
        .parent()
        .map(normalize_path)
        .unwrap_or_default();
    if uninstall_parent != current_parent {
        blockers
            .push("The stale NSIS uninstaller is not in the shared MSI install directory.".into());
    }
    let Some(current_file) = observation.files.iter().find(|file| {
        file.role == "currentExe" && normalize_path(Path::new(&file.path)) == current_exe
    }) else {
        blockers.push("The running executable could not be verified.".into());
        return Err(blockers);
    };
    if current_file.is_reparse_point() {
        blockers.push("The running executable is a reparse point.".into());
    }
    let Some(uninstaller) = observation.files.iter().find(|file| {
        file.role == "nsisUninstaller"
            && normalize_path(Path::new(&file.path)) == normalize_path(&uninstall_path)
    }) else {
        blockers.push("The stale NSIS uninstaller file could not be verified.".into());
        return Err(blockers);
    };
    if uninstaller.is_reparse_point() {
        blockers.push("The stale NSIS uninstaller is a reparse point.".into());
    }
    let mut files = vec![uninstaller.clone()];
    for shortcut in observation
        .files
        .iter()
        .filter(|file| file.role == "nsisShortcut")
    {
        if shortcut.is_reparse_point() {
            blockers.push("The stale NSIS shortcut is a reparse point.".into());
        }
        if shortcut
            .shortcut_target
            .as_deref()
            .map(|target| normalize_path(Path::new(target)))
            .as_deref()
            != Some(current_exe.as_str())
        {
            blockers.push("The stale NSIS shortcut target could not be verified.".into());
        } else {
            files.insert(0, shortcut.clone());
        }
    }
    if !blockers.is_empty() {
        return Err(blockers);
    }
    Ok(RepairPlan {
        fingerprint: observation_fingerprint(observation),
        msi: msi.clone(),
        nsis: nsis.clone(),
        current_exe: current_file.clone(),
        files,
    })
}

fn verify_post_repair(
    observation: &SystemObservation,
    manifest: &RepairManifest,
) -> Result<(), String> {
    if !observation.inspection_errors.is_empty() {
        return Err(observation.inspection_errors.join(" "));
    }
    let records = &observation.records;
    if records.len() != 1 || records[0].family != InstallerFamily::Msi {
        return Err("Post-repair verification did not find one healthy MSI registration.".into());
    }
    if record_digest(&records[0]) != manifest.msi_digest {
        return Err("The MSI registration changed during repair.".into());
    }
    let current_exe = observation
        .files
        .iter()
        .find(|file| file.role == "currentExe")
        .ok_or("The current executable could not be verified after repair.")?;
    if !file_snapshot_matches(&manifest.current_exe, current_exe) {
        return Err("The current executable changed during repair.".into());
    }
    for moved in &manifest.files {
        if observation.files.iter().any(|file| {
            normalize_path(Path::new(&file.path)) == normalize_path(Path::new(&moved.source.path))
        }) {
            return Err("A stale NSIS file still exists after repair.".into());
        }
    }
    Ok(())
}

fn observation_fingerprint(observation: &SystemObservation) -> String {
    let mut canonical = observation.clone();
    canonical
        .records
        .sort_by(|left, right| left.locator.cmp(&right.locator));
    canonical.files.sort_by(|left, right| {
        (
            left.role.as_str(),
            normalize_path(Path::new(&left.path)).as_str(),
        )
            .cmp(&(
                right.role.as_str(),
                normalize_path(Path::new(&right.path)).as_str(),
            ))
    });
    canonical.inspection_errors.sort();
    let bytes = serde_json::to_vec(&canonical).expect("serializable installer observation");
    let mut hasher = Sha256::new();
    hasher.update(b"codex-monitor-installer-repair/v1\0");
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn record_digest(record: &InstallerRecord) -> String {
    let bytes = serde_json::to_vec(record).expect("serializable installer record");
    format!("{:x}", Sha256::digest(bytes))
}

fn snapshot_at_path(snapshot: &FileSnapshot, path: &str) -> FileSnapshot {
    let mut expected = snapshot.clone();
    expected.path = path.into();
    expected
}

fn file_snapshot_matches(expected: &FileSnapshot, actual: &FileSnapshot) -> bool {
    normalize_path(Path::new(&expected.path)) == normalize_path(Path::new(&actual.path))
        && expected.size == actual.size
        && expected.sha256 == actual.sha256
        && expected.attributes == actual.attributes
        && !actual.is_reparse_point()
}

fn validate_regular_file_entry(
    is_file: bool,
    is_symlink: bool,
    attributes: u32,
) -> Result<(), String> {
    if is_symlink || attributes & REPARSE_POINT_ATTRIBUTE != 0 {
        return Err("Installer file is a symlink or reparse point.".into());
    }
    if !is_file {
        return Err("Installer path is not a regular file.".into());
    }
    Ok(())
}

fn combine_errors(primary: &str, secondary: Option<&str>) -> String {
    match secondary {
        Some(secondary) => format!("{primary}; journal error: {secondary}"),
        None => primary.into(),
    }
}

fn validate_opaque_id(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 80
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err(format!("Invalid {label}."));
    }
    Ok(())
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

fn compare_versions(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    fn parse(value: &str) -> Option<Vec<u64>> {
        let value = value.trim().trim_start_matches(['v', 'V']);
        if value.is_empty() {
            return None;
        }
        value
            .split('.')
            .map(|segment| segment.parse().ok())
            .collect()
    }
    let mut left = parse(left)?;
    let mut right = parse(right)?;
    let length = left.len().max(right.len());
    left.resize(length, 0);
    right.resize(length, 0);
    Some(left.cmp(&right))
}

fn is_product_code(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 38
        && bytes[0] == b'{'
        && bytes[37] == b'}'
        && [9, 14, 19, 24].iter().all(|index| bytes[*index] == b'-')
        && bytes[1..37]
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
}

fn parse_strict_uninstall_path(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    let path = if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        &trimmed[1..trimmed.len() - 1]
    } else if !trimmed.contains('"') && !trimmed.contains(" /") {
        trimmed
    } else {
        return None;
    };
    let path = PathBuf::from(path);
    if !path.is_absolute()
        || !path
            .file_name()
            .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("uninstall.exe"))
    {
        return None;
    }
    Some(path)
}

pub(crate) fn classify_windows_installer_registration(
    windows_installer: Option<u32>,
    uninstall_string: Option<&str>,
) -> Option<&'static str> {
    if windows_installer == Some(1) {
        return Some("msi");
    }
    uninstall_string
        .and_then(parse_strict_uninstall_path)
        .map(|_| "nsis")
}

pub(crate) fn select_windows_installer_kind(
    current_version: &str,
    msi_versions: impl IntoIterator<Item = Option<String>>,
    nsis_versions: impl IntoIterator<Item = Option<String>>,
) -> &'static str {
    let msi_versions = msi_versions.into_iter().collect::<Vec<_>>();
    let nsis_versions = nsis_versions.into_iter().collect::<Vec<_>>();
    let has_current_msi = msi_versions
        .iter()
        .any(|version| version.as_deref() == Some(current_version));
    let has_current_nsis = nsis_versions
        .iter()
        .any(|version| version.as_deref() == Some(current_version));
    match (msi_versions.is_empty(), nsis_versions.is_empty()) {
        (false, false) => "mixed",
        (false, true) if has_current_msi => "msi",
        (true, false) if has_current_nsis => "nsis",
        _ => "unknown",
    }
}

fn installer_kind_from_records(current_version: &str, records: &[InstallerRecord]) -> String {
    if records
        .iter()
        .any(|record| record.family == InstallerFamily::Unknown)
    {
        return "unknown".into();
    }
    select_windows_installer_kind(
        current_version,
        records
            .iter()
            .filter(|record| record.family == InstallerFamily::Msi)
            .map(|record| record.display_version.clone()),
        records
            .iter()
            .filter(|record| record.family == InstallerFamily::Nsis)
            .map(|record| record.display_version.clone()),
    )
    .into()
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use std::io::Write;
    use std::os::windows::fs::MetadataExt;
    use winreg::{
        enums::{
            HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
            KEY_WRITE, REG_BINARY, REG_DWORD, REG_DWORD_BIG_ENDIAN, REG_EXPAND_SZ,
            REG_FULL_RESOURCE_DESCRIPTOR, REG_LINK, REG_MULTI_SZ, REG_NONE, REG_QWORD,
            REG_RESOURCE_LIST, REG_RESOURCE_REQUIREMENTS_LIST, REG_SZ,
        },
        RegKey, RegValue,
    };

    pub(super) struct WindowsRepairBackend {
        manifest_root: PathBuf,
    }

    impl WindowsRepairBackend {
        pub(super) fn new(manifest_root: PathBuf) -> Self {
            Self {
                manifest_root: manifest_root.join("installer-repair"),
            }
        }

        fn scan_records(&self) -> Result<Vec<InstallerRecord>, String> {
            let mut records = Vec::new();
            for hive in [RegistryHive::CurrentUser, RegistryHive::LocalMachine] {
                for view in [RegistryView::Registry32, RegistryView::Registry64] {
                    records.extend(self.scan_view(hive.clone(), view)?);
                }
            }
            records.sort_by(|left, right| left.locator.cmp(&right.locator));
            Ok(records)
        }

        fn scan_view(
            &self,
            hive: RegistryHive,
            view: RegistryView,
        ) -> Result<Vec<InstallerRecord>, String> {
            let root = predefined_key(&hive);
            let flags = KEY_READ | view_flag(view);
            let uninstall = match root.open_subkey_with_flags(UNINSTALL_ROOT, flags) {
                Ok(key) => key,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
                Err(error) => {
                    return Err(format!("Failed to open uninstall registry view: {error}"))
                }
            };
            let mut records = Vec::new();
            for subkey in uninstall.enum_keys() {
                let subkey = subkey.map_err(|error| error.to_string())?;
                let key = uninstall
                    .open_subkey_with_flags(&subkey, KEY_READ | view_flag(view))
                    .map_err(|error| error.to_string())?;
                if key.get_value::<String, _>("DisplayName").ok().as_deref() != Some(PRODUCT_NAME) {
                    continue;
                }
                let mut values = BTreeMap::new();
                for value in key.enum_values() {
                    let (name, value) = value.map_err(|error| error.to_string())?;
                    values.insert(
                        name,
                        RawRegistryValue {
                            value_type: value.vtype as u32,
                            data_base64: BASE64.encode(value.bytes),
                        },
                    );
                }
                let windows_installer = key.get_value::<u32, _>("WindowsInstaller").ok();
                let uninstall_string = key.get_value::<String, _>("UninstallString").ok();
                let family = match classify_windows_installer_registration(
                    windows_installer,
                    uninstall_string.as_deref(),
                ) {
                    Some("msi") => InstallerFamily::Msi,
                    Some("nsis") => InstallerFamily::Nsis,
                    _ => InstallerFamily::Unknown,
                };
                records.push(InstallerRecord {
                    locator: RegistryLocator {
                        hive: hive.clone(),
                        view,
                        key_path: format!(r"{UNINSTALL_ROOT}\{subkey}"),
                    },
                    family,
                    display_version: key.get_value("DisplayVersion").ok(),
                    uninstall_string,
                    install_location: key.get_value("InstallLocation").ok(),
                    product_code: (family == InstallerFamily::Msi).then_some(subkey),
                    has_subkeys: key.enum_keys().next().is_some(),
                    values,
                });
            }
            Ok(records)
        }

        fn inspect_file(&self, role: &str, path: &Path) -> Result<Option<FileSnapshot>, String> {
            let metadata = match fs::symlink_metadata(path) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(format!("Failed to inspect {}: {error}", path.display())),
            };
            validate_regular_file_entry(
                metadata.is_file(),
                metadata.file_type().is_symlink(),
                metadata.file_attributes(),
            )
            .map_err(|error| format!("{}: {error}", path.display()))?;
            let bytes = fs::read(path)
                .map_err(|error| format!("Failed to hash {}: {error}", path.display()))?;
            Ok(Some(FileSnapshot {
                role: role.into(),
                path: path.to_string_lossy().into_owned(),
                size: metadata.len(),
                sha256: format!("{:x}", Sha256::digest(bytes)),
                attributes: metadata.file_attributes(),
                shortcut_target: None,
            }))
        }

        fn manifest_path(&self, transaction_id: &str) -> PathBuf {
            self.manifest_root.join(format!("{transaction_id}.json"))
        }

        fn find_exact_record(
            &self,
            locator: &RegistryLocator,
        ) -> Result<Option<InstallerRecord>, String> {
            Ok(self
                .scan_view(locator.hive.clone(), locator.view)?
                .into_iter()
                .find(|record| record.locator == *locator))
        }

        fn exact_key_exists(&self, locator: &RegistryLocator) -> Result<bool, String> {
            match predefined_key(&locator.hive)
                .open_subkey_with_flags(&locator.key_path, KEY_READ | view_flag(locator.view))
            {
                Ok(_) => Ok(true),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
                Err(error) => Err(format!(
                    "Failed to inspect exact installer registration: {error}"
                )),
            }
        }
    }

    impl RepairBackend for WindowsRepairBackend {
        fn observe(&mut self, current_version: &str) -> Result<SystemObservation, String> {
            let records = self.scan_records()?;
            let current_exe = std::env::current_exe()
                .map_err(|error| format!("Failed to resolve current executable: {error}"))?;
            let mut files = Vec::new();
            let mut inspection_errors = Vec::new();
            match self.inspect_file("currentExe", &current_exe) {
                Ok(Some(file)) => files.push(file),
                Ok(None) => inspection_errors.push("The running executable is missing.".into()),
                Err(error) => inspection_errors.push(error),
            }
            for record in records
                .iter()
                .filter(|record| record.family == InstallerFamily::Nsis)
            {
                let Some(path) = record
                    .uninstall_string
                    .as_deref()
                    .and_then(parse_strict_uninstall_path)
                else {
                    continue;
                };
                match self.inspect_file("nsisUninstaller", &path) {
                    Ok(Some(file)) => files.push(file),
                    Ok(None) => {
                        inspection_errors.push("The registered NSIS uninstaller is missing.".into())
                    }
                    Err(error) => inspection_errors.push(error),
                }
            }
            if let Some(app_data) = std::env::var_os("APPDATA") {
                let shortcut = PathBuf::from(app_data)
                    .join(r"Microsoft\Windows\Start Menu\Programs\Codex Monitor.lnk");
                match self.inspect_file("nsisShortcut", &shortcut) {
                    Ok(Some(file)) => {
                        files.push(file);
                        inspection_errors.push(
                            "A legacy NSIS shortcut exists, but this build cannot verify its Shell Link target safely."
                                .into(),
                        );
                    }
                    Ok(None) => {}
                    Err(error) => inspection_errors.push(error),
                }
            }
            Ok(SystemObservation {
                current_version: current_version.into(),
                current_exe: current_exe.to_string_lossy().into_owned(),
                records,
                files,
                inspection_errors,
            })
        }

        fn move_file(
            &mut self,
            source: &Path,
            destination: &Path,
            expected: &FileSnapshot,
        ) -> Result<(), String> {
            let source_state = self.inspect_file(&expected.role, source)?;
            let destination_state = self.inspect_file(&expected.role, destination)?;
            match (source_state, destination_state) {
                (Some(actual), None) if file_snapshot_matches(expected, &actual) => {}
                (None, Some(actual))
                    if file_snapshot_matches(
                        &snapshot_at_path(expected, &destination.to_string_lossy()),
                        &actual,
                    ) =>
                {
                    return Ok(())
                }
                (Some(_), Some(_)) => {
                    return Err(
                        "Both installer file locations exist; refusing to overwrite either.".into(),
                    )
                }
                (None, None) => {
                    return Err(
                        "Neither installer file location exists; recovery is ambiguous.".into(),
                    )
                }
                _ => return Err("Installer file state drifted; refusing to move it.".into()),
            }
            ensure_same_volume(source, destination)?;
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::rename(source, destination).map_err(|error| {
                format!("Failed to move {} to quarantine: {error}", source.display())
            })
        }

        fn delete_record(&mut self, record: &InstallerRecord) -> Result<(), String> {
            if record.locator.hive != RegistryHive::CurrentUser
                || record.family != InstallerFamily::Nsis
                || record.has_subkeys
            {
                return Err("Registry deletion escaped the stale HKCU NSIS allowlist.".into());
            }
            if !self.exact_key_exists(&record.locator)? {
                return Ok(());
            }
            let current = self.find_exact_record(&record.locator)?.ok_or(
                "The exact NSIS registration still exists but no longer matches Codex Monitor.",
            )?;
            if record_digest(&current) != record_digest(record) {
                return Err("NSIS registration changed before deletion.".into());
            }
            predefined_key(&record.locator.hive)
                .delete_subkey_with_flags(&record.locator.key_path, view_flag(record.locator.view))
                .map_err(|error| format!("Failed to remove stale NSIS registration: {error}"))
        }

        fn restore_record(&mut self, record: &InstallerRecord) -> Result<(), String> {
            if record.locator.hive != RegistryHive::CurrentUser
                || record.family != InstallerFamily::Nsis
                || record.has_subkeys
            {
                return Err("Registry restore escaped the stale HKCU NSIS allowlist.".into());
            }
            let root = predefined_key(&record.locator.hive);
            if self.exact_key_exists(&record.locator)? {
                let current = self.find_exact_record(&record.locator)?.ok_or(
                    "Refusing to overwrite an existing unrecognized installer registration.",
                )?;
                return if record_digest(&current) == record_digest(record) {
                    Ok(())
                } else {
                    Err("Refusing to overwrite a drifted installer registration.".into())
                };
            }
            let (key, _) = root
                .create_subkey_with_flags(
                    &record.locator.key_path,
                    KEY_WRITE | view_flag(record.locator.view),
                )
                .map_err(|error| error.to_string())?;
            for (name, value) in &record.values {
                let raw = RegValue {
                    vtype: registry_type(value.value_type)?,
                    bytes: BASE64
                        .decode(&value.data_base64)
                        .map_err(|error| error.to_string())?,
                };
                if let Err(error) = key.set_raw_value(name, &raw) {
                    drop(key);
                    let _ = root.delete_subkey_with_flags(
                        &record.locator.key_path,
                        view_flag(record.locator.view),
                    );
                    return Err(format!("Failed to restore NSIS registration: {error}"));
                }
            }
            Ok(())
        }

        fn persist_manifest(&mut self, manifest: &RepairManifest) -> Result<(), String> {
            fs::create_dir_all(&self.manifest_root).map_err(|error| error.to_string())?;
            let path = self.manifest_path(&manifest.transaction_id);
            let temp = path.with_extension("json.tmp");
            let backup = path.with_extension("json.bak");
            let bytes = serde_json::to_vec_pretty(manifest).map_err(|error| error.to_string())?;
            let mut file = fs::File::create(&temp).map_err(|error| error.to_string())?;
            file.write_all(&bytes).map_err(|error| error.to_string())?;
            file.sync_all().map_err(|error| error.to_string())?;
            drop(file);
            if path.exists() {
                if backup.exists() {
                    fs::remove_file(&backup).map_err(|error| error.to_string())?;
                }
                fs::rename(&path, &backup).map_err(|error| error.to_string())?;
            }
            match fs::rename(&temp, &path) {
                Ok(()) => {
                    if backup.exists() {
                        fs::remove_file(backup).map_err(|error| error.to_string())?;
                    }
                    Ok(())
                }
                Err(error) => {
                    if backup.exists() && !path.exists() {
                        let _ = fs::rename(&backup, &path);
                    }
                    Err(error.to_string())
                }
            }
        }

        fn list_manifests(&mut self) -> Result<Vec<RepairManifest>, String> {
            let entries = match fs::read_dir(&self.manifest_root) {
                Ok(entries) => entries,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
                Err(error) => return Err(error.to_string()),
            };
            let mut journal_entries = Vec::new();
            for entry in entries {
                let path = entry.map_err(|error| error.to_string())?.path();
                let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
                    return Err("Installer repair journal has an invalid file name.".into());
                };
                if !file_name.ends_with(".json")
                    && !file_name.ends_with(".json.bak")
                    && !file_name.ends_with(".json.tmp")
                {
                    continue;
                }
                let data = fs::read(&path).map_err(|error| error.to_string())?;
                journal_entries.push((path, data));
            }
            load_latest_journals(journal_entries)
        }

        fn quarantine_path(
            &self,
            source: &Path,
            transaction_id: &str,
            index: usize,
        ) -> Result<PathBuf, String> {
            let parent = source
                .parent()
                .and_then(Path::parent)
                .ok_or("Unsafe installer file path.")?;
            let file_name = source
                .file_name()
                .ok_or("Installer file has no file name.")?;
            Ok(parent
                .join(".codex-monitor-repair")
                .join(transaction_id)
                .join(format!("{index}-{}", file_name.to_string_lossy())))
        }

        fn canonical_nsis_shortcut_path(&self) -> Result<Option<PathBuf>, String> {
            Ok(std::env::var_os("APPDATA").map(|app_data| {
                PathBuf::from(app_data)
                    .join(r"Microsoft\Windows\Start Menu\Programs\Codex Monitor.lnk")
            }))
        }
    }

    pub(super) fn detect_installer_kind() -> String {
        let backend = WindowsRepairBackend::new(std::env::temp_dir());
        match backend.scan_records() {
            Ok(records) => installer_kind_from_records(env!("CARGO_PKG_VERSION"), &records),
            Err(_) => "unknown".into(),
        }
    }

    fn predefined_key(hive: &RegistryHive) -> RegKey {
        match hive {
            RegistryHive::CurrentUser => RegKey::predef(HKEY_CURRENT_USER),
            RegistryHive::LocalMachine => RegKey::predef(HKEY_LOCAL_MACHINE),
        }
    }

    fn view_flag(view: RegistryView) -> u32 {
        match view {
            RegistryView::Registry32 => KEY_WOW64_32KEY,
            RegistryView::Registry64 => KEY_WOW64_64KEY,
        }
    }

    fn registry_type(value: u32) -> Result<winreg::enums::RegType, String> {
        match value {
            0 => Ok(REG_NONE),
            1 => Ok(REG_SZ),
            2 => Ok(REG_EXPAND_SZ),
            3 => Ok(REG_BINARY),
            4 => Ok(REG_DWORD),
            5 => Ok(REG_DWORD_BIG_ENDIAN),
            6 => Ok(REG_LINK),
            7 => Ok(REG_MULTI_SZ),
            8 => Ok(REG_RESOURCE_LIST),
            9 => Ok(REG_FULL_RESOURCE_DESCRIPTOR),
            10 => Ok(REG_RESOURCE_REQUIREMENTS_LIST),
            11 => Ok(REG_QWORD),
            _ => Err("Unsupported registry value type in repair snapshot.".into()),
        }
    }

    fn ensure_same_volume(source: &Path, destination: &Path) -> Result<(), String> {
        let source_prefix = source.components().next();
        let destination_prefix = destination.components().next();
        if source_prefix != destination_prefix {
            return Err("Installer quarantine must stay on the source volume.".into());
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn detect_installer_kind() -> String {
    platform::detect_installer_kind()
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn detect_installer_kind() -> String {
    "unknown".into()
}

#[tauri::command]
pub(crate) async fn preview_windows_installer_repair(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<WindowsInstallerRepairPreview, String> {
    let _guard = state.windows_installer_repair.lock().await;
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        let mut engine = RepairEngine::new(
            platform::WindowsRepairBackend::new(data_dir),
            env!("CARGO_PKG_VERSION"),
        );
        Ok(engine.preview())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app_handle;
        Ok(WindowsInstallerRepairPreview::unsupported())
    }
}

#[tauri::command]
pub(crate) async fn recover_windows_installer_repair(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<WindowsInstallerRepairResult, String> {
    let _guard = state.windows_installer_repair.lock().await;
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        RepairEngine::new(
            platform::WindowsRepairBackend::new(data_dir),
            env!("CARGO_PKG_VERSION"),
        )
        .recover()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app_handle;
        Ok(WindowsInstallerRepairResult::unsupported())
    }
}

#[tauri::command]
pub(crate) async fn apply_windows_installer_repair(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
    fingerprint: String,
    operation_id: String,
) -> Result<WindowsInstallerRepairResult, String> {
    let _guard = state.windows_installer_repair.lock().await;
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        RepairEngine::new(
            platform::WindowsRepairBackend::new(data_dir),
            env!("CARGO_PKG_VERSION"),
        )
        .apply(&fingerprint, &operation_id)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app_handle, fingerprint, operation_id);
        Ok(WindowsInstallerRepairResult::unsupported())
    }
}

#[tauri::command]
pub(crate) async fn rollback_windows_installer_repair(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
    transaction_id: String,
    post_fingerprint: String,
) -> Result<WindowsInstallerRepairResult, String> {
    let _guard = state.windows_installer_repair.lock().await;
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        RepairEngine::new(
            platform::WindowsRepairBackend::new(data_dir),
            env!("CARGO_PKG_VERSION"),
        )
        .rollback(&transaction_id, &post_fingerprint)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app_handle, transaction_id, post_fingerprint);
        Ok(WindowsInstallerRepairResult::unsupported())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeMap, HashMap};

    #[derive(Clone)]
    struct FakeBackend {
        observation: SystemObservation,
        manifests: HashMap<String, RepairManifest>,
        fail_methods: Vec<(&'static str, usize)>,
        calls: HashMap<&'static str, usize>,
        drift_on_observe: Option<usize>,
        drift_exe_on_observe: Option<usize>,
        drift_on_move: bool,
        mutations: usize,
    }

    impl FakeBackend {
        fn healthy_mixed(include_shortcut: bool) -> Self {
            let current_exe = r"C:\Users\Test\AppData\Local\Codex Monitor\codex-monitor.exe";
            let uninstall = r"C:\Users\Test\AppData\Local\Codex Monitor\uninstall.exe";
            let mut values = BTreeMap::new();
            for value_type in 0..=11 {
                values.insert(
                    format!("value-{value_type}"),
                    RawRegistryValue {
                        value_type,
                        data_base64: BASE64.encode([value_type as u8, 1, 2]),
                    },
                );
            }
            let msi_values = values.clone();
            values.insert("DisplayName".into(), raw_reg_sz(PRODUCT_NAME));
            values.insert(
                "UninstallString".into(),
                raw_reg_sz(&format!("\"{uninstall}\"")),
            );
            let msi = InstallerRecord {
                locator: RegistryLocator {
                    hive: RegistryHive::LocalMachine,
                    view: RegistryView::Registry64,
                    key_path: format!(r"{UNINSTALL_ROOT}\{{12345678-1234-1234-1234-123456789ABC}}"),
                },
                family: InstallerFamily::Msi,
                display_version: Some("1.2.3".into()),
                uninstall_string: Some(
                    "MsiExec.exe /I {12345678-1234-1234-1234-123456789ABC}".into(),
                ),
                install_location: Some(r"C:\Users\Test\AppData\Local\Codex Monitor".into()),
                product_code: Some("{12345678-1234-1234-1234-123456789ABC}".into()),
                has_subkeys: false,
                values: msi_values,
            };
            let nsis = InstallerRecord {
                locator: RegistryLocator {
                    hive: RegistryHive::CurrentUser,
                    view: RegistryView::Registry64,
                    key_path: format!(r"{UNINSTALL_ROOT}\Codex Monitor"),
                },
                family: InstallerFamily::Nsis,
                display_version: Some("1.2.2".into()),
                uninstall_string: Some(format!("\"{uninstall}\"")),
                install_location: Some(r"C:\Users\Test\AppData\Local\Codex Monitor".into()),
                product_code: None,
                has_subkeys: false,
                values,
            };
            let mut files = vec![
                file("currentExe", current_exe, None),
                file("nsisUninstaller", uninstall, None),
            ];
            if include_shortcut {
                files.push(file(
                    "nsisShortcut",
                    r"C:\Users\Test\Start Menu\Codex Monitor.lnk",
                    Some(current_exe),
                ));
            }
            Self {
                observation: SystemObservation {
                    current_version: "1.2.3".into(),
                    current_exe: current_exe.into(),
                    records: vec![msi, nsis],
                    files,
                    inspection_errors: Vec::new(),
                },
                manifests: HashMap::new(),
                fail_methods: Vec::new(),
                calls: HashMap::new(),
                drift_on_observe: None,
                drift_exe_on_observe: None,
                drift_on_move: false,
                mutations: 0,
            }
        }

        fn fail(mut self, method: &'static str, call: usize) -> Self {
            self.fail_methods.push((method, call));
            self
        }

        fn maybe_fail(&mut self, method: &'static str) -> Result<(), String> {
            let count = self.calls.entry(method).or_default();
            *count += 1;
            if self.fail_methods.contains(&(method, *count)) {
                return Err(format!("injected {method} failure"));
            }
            Ok(())
        }
    }

    impl RepairBackend for FakeBackend {
        fn observe(&mut self, _current_version: &str) -> Result<SystemObservation, String> {
            self.maybe_fail("observe")?;
            let count = self.calls["observe"];
            if self.drift_on_observe == Some(count) {
                self.observation.records[1].display_version = Some("9.9.9".into());
            }
            if self.drift_exe_on_observe == Some(count) {
                self.observation
                    .files
                    .iter_mut()
                    .find(|file| file.role == "currentExe")
                    .unwrap()
                    .sha256 = "changed-exe".into();
            }
            Ok(self.observation.clone())
        }

        fn move_file(
            &mut self,
            source: &Path,
            destination: &Path,
            expected: &FileSnapshot,
        ) -> Result<(), String> {
            self.maybe_fail("move")?;
            if self.drift_on_move {
                self.observation
                    .files
                    .iter_mut()
                    .find(|file| normalize_path(Path::new(&file.path)) == normalize_path(source))
                    .unwrap()
                    .sha256 = "changed-before-move".into();
                self.drift_on_move = false;
            }
            let source = normalize_path(source);
            if source != normalize_path(Path::new(&expected.path)) {
                return Err("expected source path mismatch".into());
            }
            let destination = destination.to_string_lossy().into_owned();
            let source_index = self
                .observation
                .files
                .iter()
                .position(|file| normalize_path(Path::new(&file.path)) == source);
            let destination_index = self.observation.files.iter().position(|file| {
                normalize_path(Path::new(&file.path)) == normalize_path(Path::new(&destination))
            });
            match (source_index, destination_index) {
                (Some(index), None)
                    if file_snapshot_matches(expected, &self.observation.files[index]) =>
                {
                    self.observation.files[index].path = destination;
                    self.mutations += 1;
                    Ok(())
                }
                (None, Some(index))
                    if file_snapshot_matches(
                        &snapshot_at_path(expected, &destination),
                        &self.observation.files[index],
                    ) =>
                {
                    Ok(())
                }
                (Some(_), Some(_)) => Err("both file locations exist".into()),
                (None, None) => Err("neither file location exists".into()),
                _ => Err("file state drifted".into()),
            }
        }

        fn delete_record(&mut self, record: &InstallerRecord) -> Result<(), String> {
            self.maybe_fail("delete")?;
            let Some(current) = self
                .observation
                .records
                .iter()
                .find(|candidate| candidate.locator == record.locator)
            else {
                return Ok(());
            };
            if record_digest(current) != record_digest(record) {
                return Err("record drifted before delete".into());
            }
            self.observation
                .records
                .retain(|candidate| candidate.locator != record.locator);
            self.mutations += 1;
            Ok(())
        }

        fn restore_record(&mut self, record: &InstallerRecord) -> Result<(), String> {
            self.maybe_fail("restore")?;
            if let Some(current) = self
                .observation
                .records
                .iter()
                .find(|candidate| candidate.locator == record.locator)
            {
                return if record_digest(current) == record_digest(record) {
                    Ok(())
                } else {
                    Err("record drifted before restore".into())
                };
            }
            self.observation.records.push(record.clone());
            self.mutations += 1;
            Ok(())
        }

        fn persist_manifest(&mut self, manifest: &RepairManifest) -> Result<(), String> {
            self.maybe_fail("persist")?;
            self.manifests
                .insert(manifest.transaction_id.clone(), manifest.clone());
            Ok(())
        }

        fn list_manifests(&mut self) -> Result<Vec<RepairManifest>, String> {
            self.maybe_fail("list")?;
            let manifests = self.manifests.values().cloned().collect::<Vec<_>>();
            for manifest in &manifests {
                validate_manifest(manifest)?;
            }
            Ok(manifests)
        }

        fn quarantine_path(
            &self,
            source: &Path,
            transaction_id: &str,
            index: usize,
        ) -> Result<PathBuf, String> {
            Ok(PathBuf::from(format!(
                r"C:\quarantine\{transaction_id}\{index}-{}",
                source.file_name().unwrap().to_string_lossy()
            )))
        }

        fn canonical_nsis_shortcut_path(&self) -> Result<Option<PathBuf>, String> {
            Ok(Some(PathBuf::from(
                r"C:\Users\Test\Start Menu\Codex Monitor.lnk",
            )))
        }
    }

    fn file(role: &str, path: &str, shortcut_target: Option<&str>) -> FileSnapshot {
        FileSnapshot {
            role: role.into(),
            path: path.into(),
            size: 100,
            sha256: format!("hash-{role}"),
            attributes: 0,
            shortcut_target: shortcut_target.map(str::to_string),
        }
    }

    fn raw_reg_sz(value: &str) -> RawRegistryValue {
        let bytes = value
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>();
        RawRegistryValue {
            value_type: 1,
            data_base64: BASE64.encode(bytes),
        }
    }

    fn crash_manifest(backend: &FakeBackend, transaction_id: &str) -> RepairManifest {
        let plan = build_repair_plan(&backend.observation).unwrap();
        let files = plan
            .files
            .iter()
            .enumerate()
            .map(|(index, file)| FileMoveSnapshot {
                source: file.clone(),
                quarantine_path: backend
                    .quarantine_path(Path::new(&file.path), transaction_id, index)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
            })
            .collect();
        RepairManifest {
            schema_version: SNAPSHOT_SCHEMA_VERSION,
            journal_revision: 3,
            transaction_id: transaction_id.into(),
            operation_id: format!("operation-{transaction_id}"),
            state: TransactionState::Applying,
            pre_fingerprint: plan.fingerprint,
            post_fingerprint: None,
            msi_digest: record_digest(&plan.msi),
            current_exe: plan.current_exe,
            nsis_record: plan.nsis,
            files,
            moved_file_count: 0,
            pending_file_move: None,
            registry_deleted: false,
            registry_delete_pending: false,
            last_error: None,
        }
    }

    fn assert_untrusted_recovery_is_zero_write(mut backend: FakeBackend, manifest: RepairManifest) {
        let mutations = backend.mutations;
        backend
            .manifests
            .insert(manifest.transaction_id.clone(), manifest);
        let observation = backend.observation.clone();
        let manifests = backend.manifests.clone();
        let mut engine = RepairEngine::new(backend, "1.2.3");
        let preview = engine.preview();
        assert_eq!(preview.status, "blocked");
        assert!(preview.recovery_required);
        assert_eq!(engine.backend.observation, observation);
        assert_eq!(engine.backend.manifests, manifests);
        assert_eq!(engine.backend.mutations, mutations);

        assert!(engine.recover().is_err());
        assert_eq!(engine.backend.observation, observation);
        assert_eq!(engine.backend.manifests, manifests);
        assert_eq!(engine.backend.mutations, mutations);
    }

    #[test]
    fn previews_only_verified_current_msi_and_older_hkcu_nsis() {
        assert!(!WindowsInstallerRepairPreview::unsupported().recovery_required);
        let mut engine = RepairEngine::new(FakeBackend::healthy_mixed(true), "1.2.3");
        let preview = engine.preview();
        assert_eq!(preview.status, "repairable");
        assert!(!preview.recovery_required);
        assert!(preview.fingerprint.is_some());
        assert_eq!(preview.records.len(), 2);
        assert_eq!(
            serde_json::to_value(&preview).unwrap()["recoveryRequired"],
            false
        );
    }

    #[test]
    fn blocked_preview_never_mutates() {
        let mut backend = FakeBackend::healthy_mixed(false);
        backend.observation.records[1].locator.hive = RegistryHive::LocalMachine;
        let mut engine = RepairEngine::new(backend, "1.2.3");
        let preview = engine.preview();
        assert_eq!(preview.status, "blocked");
        assert!(!preview.recovery_required);
        assert_eq!(engine.backend.mutations, 0);
        assert!(engine.backend.manifests.is_empty());
    }

    #[test]
    fn fingerprint_is_stable_across_record_order() {
        let backend = FakeBackend::healthy_mixed(true);
        let left = observation_fingerprint(&backend.observation);
        let mut right = backend.observation.clone();
        right.records.reverse();
        right.files.reverse();
        assert_eq!(left, observation_fingerprint(&right));
        right.records[1]
            .values
            .get_mut("value-11")
            .unwrap()
            .data_base64 = BASE64.encode([9]);
        assert_ne!(left, observation_fingerprint(&right));
    }

    #[test]
    fn state_drift_after_preview_is_zero_write() {
        let mut backend = FakeBackend::healthy_mixed(true);
        let fingerprint = observation_fingerprint(&backend.observation);
        backend.drift_on_observe = Some(1);
        let mut engine = RepairEngine::new(backend, "1.2.3");
        let error = engine.apply(&fingerprint, "operation-1").unwrap_err();
        assert!(error.contains("changed after preview") || error.contains("older version"));
        assert_eq!(engine.backend.mutations, 0);
    }

    #[test]
    fn file_drift_at_move_boundary_is_zero_write() {
        let mut backend = FakeBackend::healthy_mixed(false);
        let pre = observation_fingerprint(&backend.observation);
        backend.drift_on_move = true;
        let mut engine = RepairEngine::new(backend, "1.2.3");
        let error = engine.apply(&pre, "operation-file-drift").unwrap_err();
        assert!(error.contains("rolled back") || error.contains("state drifted"));
        assert_eq!(engine.backend.mutations, 0);
    }

    #[test]
    fn unknown_registration_never_degrades_to_a_known_kind() {
        let mut backend = FakeBackend::healthy_mixed(false);
        backend.observation.records.push(InstallerRecord {
            locator: RegistryLocator {
                hive: RegistryHive::CurrentUser,
                view: RegistryView::Registry64,
                key_path: format!(r"{UNINSTALL_ROOT}\unknown"),
            },
            family: InstallerFamily::Unknown,
            display_version: None,
            uninstall_string: None,
            install_location: None,
            product_code: None,
            has_subkeys: false,
            values: BTreeMap::new(),
        });
        assert_eq!(
            installer_kind_from_records("1.2.3", &backend.observation.records),
            "unknown"
        );
    }

    #[test]
    fn current_exe_drift_during_verify_triggers_rollback() {
        let backend = FakeBackend::healthy_mixed(false);
        let pre = observation_fingerprint(&backend.observation);
        let mut backend = backend;
        backend.drift_exe_on_observe = Some(2);
        let mut engine = RepairEngine::new(backend, "1.2.3");
        let error = engine.apply(&pre, "operation-exe-drift").unwrap_err();
        assert!(error.contains("rolled back") || error.contains("current executable changed"));
        assert!(engine
            .backend
            .observation
            .records
            .iter()
            .any(|record| record.family == InstallerFamily::Nsis));
    }

    #[test]
    fn apply_in_memory_automatic_rollback_restores_every_mutation_failure() {
        for (method, call) in [("move", 1), ("move", 2), ("delete", 1), ("observe", 2)] {
            let backend = FakeBackend::healthy_mixed(true).fail(method, call);
            let pre = observation_fingerprint(&backend.observation);
            let mut engine = RepairEngine::new(backend, "1.2.3");
            let result = engine.apply(&pre, &format!("operation-{method}-{call}"));
            assert!(result.is_err(), "{method} {call} unexpectedly succeeded");
            assert_eq!(observation_fingerprint(&engine.backend.observation), pre);
        }
    }

    #[test]
    fn rollback_continues_when_rollback_journal_write_fails() {
        let backend = FakeBackend::healthy_mixed(false)
            .fail("persist", 5)
            .fail("persist", 6);
        let pre = observation_fingerprint(&backend.observation);
        let mut engine = RepairEngine::new(backend, "1.2.3");
        let error = engine.apply(&pre, "operation-journal-drift").unwrap_err();
        assert!(error.contains("journal error"));
        assert_eq!(observation_fingerprint(&engine.backend.observation), pre);
    }

    #[test]
    fn snapshot_write_failure_happens_before_any_mutation() {
        let backend = FakeBackend::healthy_mixed(false).fail("persist", 1);
        let pre = observation_fingerprint(&backend.observation);
        let mut engine = RepairEngine::new(backend, "1.2.3");
        assert!(engine.apply(&pre, "operation-snapshot-failure").is_err());
        assert_eq!(engine.backend.mutations, 0);
        assert_eq!(observation_fingerprint(&engine.backend.observation), pre);
    }

    #[test]
    fn pending_move_preview_is_read_only_then_explicit_recover_restores_pre_state() {
        let mut backend = FakeBackend::healthy_mixed(false);
        let pre = observation_fingerprint(&backend.observation);
        let mut manifest = crash_manifest(&backend, "crash-move-applied");
        manifest.pending_file_move = Some(0);
        let file = manifest.files[0].clone();
        backend
            .move_file(
                Path::new(&file.source.path),
                Path::new(&file.quarantine_path),
                &file.source,
            )
            .unwrap();
        backend
            .manifests
            .insert(manifest.transaction_id.clone(), manifest);
        let observation_after_crash = backend.observation.clone();
        let manifests_after_crash = backend.manifests.clone();
        let mutations_after_crash = backend.mutations;

        let mut engine = RepairEngine::new(backend, "1.2.3");
        let preview = engine.preview();
        assert_eq!(preview.status, "blocked");
        assert!(preview.recovery_required);
        assert_eq!(
            serde_json::to_value(&preview).unwrap()["recoveryRequired"],
            true
        );
        assert_eq!(engine.backend.observation, observation_after_crash);
        assert_eq!(engine.backend.manifests, manifests_after_crash);
        assert_eq!(engine.backend.mutations, mutations_after_crash);

        let recovered = engine.recover().unwrap();
        assert_eq!(recovered.status, "rolledBack");
        assert_eq!(observation_fingerprint(&engine.backend.observation), pre);
    }

    #[test]
    fn pending_move_not_started_preview_is_read_only() {
        let mut backend = FakeBackend::healthy_mixed(false);
        let pre = observation_fingerprint(&backend.observation);
        let mut manifest = crash_manifest(&backend, "crash-move-pending");
        manifest.pending_file_move = Some(0);
        backend
            .manifests
            .insert(manifest.transaction_id.clone(), manifest);
        let observation_before_preview = backend.observation.clone();
        let manifests_before_preview = backend.manifests.clone();
        let mutations_before_preview = backend.mutations;

        let mut engine = RepairEngine::new(backend, "1.2.3");
        let preview = engine.preview();
        assert_eq!(preview.status, "blocked");
        assert!(preview.recovery_required);
        assert_eq!(engine.backend.observation, observation_before_preview);
        assert_eq!(engine.backend.manifests, manifests_before_preview);
        assert_eq!(engine.backend.mutations, mutations_before_preview);
        assert_eq!(observation_fingerprint(&engine.backend.observation), pre);
    }

    #[test]
    fn pending_registry_delete_preview_is_read_only() {
        let mut backend = FakeBackend::healthy_mixed(false);
        let pre = observation_fingerprint(&backend.observation);
        let mut manifest = crash_manifest(&backend, "crash-registry-delete");
        let file = manifest.files[0].clone();
        backend
            .move_file(
                Path::new(&file.source.path),
                Path::new(&file.quarantine_path),
                &file.source,
            )
            .unwrap();
        manifest.moved_file_count = 1;
        manifest.registry_delete_pending = true;
        backend.delete_record(&manifest.nsis_record).unwrap();
        backend
            .manifests
            .insert(manifest.transaction_id.clone(), manifest);
        let observation_after_crash = backend.observation.clone();
        let manifests_after_crash = backend.manifests.clone();
        let mutations_after_crash = backend.mutations;

        let mut engine = RepairEngine::new(backend, "1.2.3");
        let preview = engine.preview();
        assert_eq!(preview.status, "blocked");
        assert!(preview.recovery_required);
        assert_eq!(engine.backend.observation, observation_after_crash);
        assert_eq!(engine.backend.manifests, manifests_after_crash);
        assert_eq!(engine.backend.mutations, mutations_after_crash);
        assert_ne!(observation_fingerprint(&engine.backend.observation), pre);
    }

    #[test]
    fn rollback_failed_preview_is_read_only_then_explicit_recover_succeeds() {
        let mut backend = FakeBackend::healthy_mixed(false);
        let pre = observation_fingerprint(&backend.observation);
        let mut manifest = crash_manifest(&backend, "crash-rollback-failed");
        let file = manifest.files[0].clone();
        backend
            .move_file(
                Path::new(&file.source.path),
                Path::new(&file.quarantine_path),
                &file.source,
            )
            .unwrap();
        manifest.moved_file_count = 1;
        manifest.state = TransactionState::RollbackFailed;
        backend
            .manifests
            .insert(manifest.transaction_id.clone(), manifest);
        let observation_after_failure = backend.observation.clone();
        let manifests_after_failure = backend.manifests.clone();
        let mutations_after_failure = backend.mutations;

        let mut engine = RepairEngine::new(backend, "1.2.3");
        let preview = engine.preview();
        assert_eq!(preview.status, "blocked");
        assert!(preview.recovery_required);
        assert_eq!(engine.backend.observation, observation_after_failure);
        assert_eq!(engine.backend.manifests, manifests_after_failure);
        assert_eq!(engine.backend.mutations, mutations_after_failure);

        let recovered = engine.recover().unwrap();
        assert_eq!(recovered.status, "rolledBack");
        assert_eq!(observation_fingerprint(&engine.backend.observation), pre);
    }

    #[test]
    fn disk_manifest_arbitrary_file_or_quarantine_is_zero_write() {
        for variant in 0..2 {
            let backend = FakeBackend::healthy_mixed(false);
            let mut manifest = crash_manifest(&backend, &format!("malicious-file-{variant}"));
            manifest.pending_file_move = Some(0);
            if variant == 0 {
                manifest.files[0].source.path = r"C:\Users\Test\Documents\arbitrary.txt".into();
            } else {
                manifest.files[0].quarantine_path = r"C:\Users\Test\Documents\stolen.txt".into();
            }
            assert_untrusted_recovery_is_zero_write(backend, manifest);
        }
    }

    #[test]
    fn disk_manifest_registry_scope_escape_is_zero_write() {
        for variant in 0..2 {
            let backend = FakeBackend::healthy_mixed(false);
            let mut manifest = crash_manifest(&backend, &format!("malicious-registry-{variant}"));
            manifest.registry_delete_pending = true;
            if variant == 0 {
                manifest.nsis_record.locator.hive = RegistryHive::LocalMachine;
            } else {
                manifest.nsis_record.locator.key_path =
                    r"SOFTWARE\Codex Monitor\OutsideUninstall".into();
            }
            assert_untrusted_recovery_is_zero_write(backend, manifest);
        }
    }

    #[test]
    fn disk_manifest_msi_or_current_exe_drift_is_zero_write() {
        for variant in 0..2 {
            let mut backend = FakeBackend::healthy_mixed(false);
            let mut manifest = crash_manifest(&backend, &format!("malicious-owner-{variant}"));
            manifest.pending_file_move = Some(0);
            if variant == 0 {
                backend.observation.records[0].display_version = Some("9.9.9".into());
            } else {
                backend
                    .observation
                    .files
                    .iter_mut()
                    .find(|file| file.role == "currentExe")
                    .unwrap()
                    .sha256 = "drifted-current-exe".into();
            }
            assert_untrusted_recovery_is_zero_write(backend, manifest);
        }
    }

    #[test]
    fn direct_apply_existing_operation_recovers_other_partial_first() {
        let mut backend = FakeBackend::healthy_mixed(false);
        let pre = observation_fingerprint(&backend.observation);
        let mut completed = crash_manifest(&backend, "completed-old-operation");
        completed.state = TransactionState::Completed;
        completed.moved_file_count = completed.files.len();
        completed.registry_deleted = true;
        completed.post_fingerprint = Some("completed-post-fingerprint".into());
        let completed_operation_id = completed.operation_id.clone();

        let mut partial = crash_manifest(&backend, "partial-other-operation");
        partial.pending_file_move = Some(0);
        let file = partial.files[0].clone();
        backend
            .move_file(
                Path::new(&file.source.path),
                Path::new(&file.quarantine_path),
                &file.source,
            )
            .unwrap();
        backend
            .manifests
            .insert(completed.transaction_id.clone(), completed);
        backend
            .manifests
            .insert(partial.transaction_id.clone(), partial);

        let mut engine = RepairEngine::new(backend, "1.2.3");
        let result = engine
            .apply("unused-existing-fingerprint", &completed_operation_id)
            .unwrap();
        assert_eq!(result.status, "completed");
        assert_eq!(observation_fingerprint(&engine.backend.observation), pre);
    }

    #[test]
    fn journal_candidates_select_latest_tmp_and_reject_orphans() {
        let backend = FakeBackend::healthy_mixed(false);
        let mut backup = crash_manifest(&backend, "journal-candidate");
        backup.journal_revision = 4;
        let mut temp = backup.clone();
        temp.journal_revision = 5;
        temp.state = TransactionState::RollingBack;
        let backup_candidate = parse_journal_candidate(
            Path::new("journal-candidate.json.bak"),
            &serde_json::to_vec(&backup).unwrap(),
        )
        .unwrap();
        let temp_candidate = parse_journal_candidate(
            Path::new("journal-candidate.json.tmp"),
            &serde_json::to_vec(&temp).unwrap(),
        )
        .unwrap();
        let selected = select_latest_journals(vec![backup_candidate, temp_candidate]).unwrap();
        assert_eq!(selected[0].journal_revision, 5);
        assert_eq!(selected[0].state, TransactionState::RollingBack);

        assert!(parse_journal_candidate(
            Path::new("orphan.json.tmp"),
            br#"{"transactionId":"different"}"#,
        )
        .is_err());
        assert!(
            parse_journal_candidate(Path::new("journal-candidate.json.bak"), b"not-json",).is_err()
        );
    }

    #[test]
    fn valid_primary_survives_truncated_tmp_candidate() {
        let backend = FakeBackend::healthy_mixed(false);
        let primary = crash_manifest(&backend, "truncated-tmp-recovery");
        let selected = load_latest_journals(vec![
            (
                PathBuf::from("truncated-tmp-recovery.json"),
                serde_json::to_vec(&primary).unwrap(),
            ),
            (
                PathBuf::from("truncated-tmp-recovery.json.tmp"),
                b"{\"schemaVersion\":".to_vec(),
            ),
        ])
        .unwrap();
        assert_eq!(selected, vec![primary]);
    }

    #[test]
    fn regular_file_validation_rejects_reparse_before_read() {
        assert!(validate_regular_file_entry(true, false, 0).is_ok());
        assert!(validate_regular_file_entry(true, true, 0).is_err());
        assert!(validate_regular_file_entry(true, false, REPARSE_POINT_ATTRIBUTE).is_err());
        assert!(validate_regular_file_entry(false, false, 0).is_err());
    }

    #[test]
    fn apply_and_explicit_rollback_are_idempotent_and_preserve_raw_values() {
        let backend = FakeBackend::healthy_mixed(true);
        let pre = observation_fingerprint(&backend.observation);
        let expected_raw = backend.observation.records[1].values.clone();
        let mut engine = RepairEngine::new(backend, "1.2.3");
        let completed = engine.apply(&pre, "operation-success").unwrap();
        assert_eq!(completed.status, "completed");
        let repeated = engine.apply(&pre, "operation-success").unwrap();
        assert_eq!(repeated.transaction_id, completed.transaction_id);
        let transaction_id = completed.transaction_id.unwrap();
        let post = completed.fingerprint.unwrap();
        let rolled_back = engine.rollback(&transaction_id, &post).unwrap();
        assert_eq!(rolled_back.status, "rolledBack");
        let repeated_rollback = engine.rollback(&transaction_id, &post).unwrap();
        assert_eq!(repeated_rollback.status, "rolledBack");
        let nsis = engine
            .backend
            .observation
            .records
            .iter()
            .find(|record| record.family == InstallerFamily::Nsis)
            .unwrap();
        assert_eq!(nsis.values, expected_raw);
        assert_eq!(observation_fingerprint(&engine.backend.observation), pre);
    }

    #[test]
    fn explicit_rollback_refuses_post_repair_drift() {
        let backend = FakeBackend::healthy_mixed(false);
        let pre = observation_fingerprint(&backend.observation);
        let mut engine = RepairEngine::new(backend, "1.2.3");
        let completed = engine.apply(&pre, "operation-drift").unwrap();
        engine.backend.observation.records[0].display_version = Some("2.0.0".into());
        let error = engine
            .rollback(
                completed.transaction_id.as_deref().unwrap(),
                completed.fingerprint.as_deref().unwrap(),
            )
            .unwrap_err();
        assert!(error.contains("changed after repair"));
    }

    #[test]
    fn strict_uninstall_parser_rejects_commands_and_relative_paths() {
        assert!(parse_strict_uninstall_path(r#""C:\App\uninstall.exe""#).is_some());
        assert!(parse_strict_uninstall_path(r#""C:\App\uninstall.exe" /S"#).is_none());
        assert!(parse_strict_uninstall_path("uninstall.exe").is_none());
    }
}

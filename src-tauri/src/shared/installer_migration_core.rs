use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub(crate) const INSTALLER_MIGRATION_SCHEMA_VERSION: u32 = 1;
pub(crate) const MAX_MIGRATION_LIFETIME_MS: u64 = 30 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS: u64 = 60 * 1_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum InstallerFamily {
    Msi,
    Nsis,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum InstallerScope {
    PerMachine,
    PerUser,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum InstallerUiMode {
    Interactive,
    Passive,
    Silent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MigrationTarget {
    pub(crate) family: InstallerFamily,
    pub(crate) version: String,
    pub(crate) artifact_path: String,
    pub(crate) artifact_size: u64,
    pub(crate) artifact_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MigrationIntent {
    pub(crate) schema_version: u32,
    pub(crate) intent_id: String,
    pub(crate) nonce: String,
    pub(crate) created_at_unix_ms: u64,
    pub(crate) expires_at_unix_ms: u64,
    pub(crate) adapter_family: InstallerFamily,
    pub(crate) target: MigrationTarget,
    pub(crate) scope: InstallerScope,
    pub(crate) ui_mode: InstallerUiMode,
    pub(crate) parent_pid: u32,
    pub(crate) original_user_sid: String,
    pub(crate) original_session_id: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MigrationContinuation {
    pub(crate) schema_version: u32,
    pub(crate) continuation_id: String,
    pub(crate) intent_id: String,
    pub(crate) intent_digest: String,
    pub(crate) target_family: InstallerFamily,
    pub(crate) target_artifact_sha256: String,
    pub(crate) one_time_grant: String,
    pub(crate) created_at_unix_ms: u64,
    pub(crate) expires_at_unix_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum MigrationContractError {
    InvalidJson(String),
    InvalidSchemaVersion,
    InvalidIdentifier(&'static str),
    InvalidTimestamp(&'static str),
    InvalidAdapterFamily,
    InvalidScope,
    InvalidTargetVersion,
    InvalidArtifactPath,
    InvalidArtifactSize,
    InvalidArtifactSha256,
    InvalidParentPid,
    InvalidOriginalUserSid,
    InvalidOriginalSessionId,
    IntentIdMismatch,
    IntentDigestMismatch,
    TargetFamilyMismatch,
    ArtifactHashMismatch,
    GrantMismatch,
}

impl MigrationIntent {
    pub(crate) fn validate(&self, now_unix_ms: u64) -> Result<(), MigrationContractError> {
        self.validate_for_recovery()?;
        validate_time_window_active(
            self.created_at_unix_ms,
            self.expires_at_unix_ms,
            now_unix_ms,
        )
    }

    pub(crate) fn validate_for_recovery(&self) -> Result<(), MigrationContractError> {
        validate_schema(self.schema_version)?;
        validate_uuid_like(&self.intent_id, "intentId")?;
        validate_uuid_like(&self.nonce, "nonce")?;
        validate_time_window_shape(self.created_at_unix_ms, self.expires_at_unix_ms)?;

        if self.adapter_family != self.target.family {
            return Err(MigrationContractError::InvalidAdapterFamily);
        }
        match (self.target.family, self.scope) {
            (InstallerFamily::Msi, InstallerScope::PerMachine)
            | (InstallerFamily::Nsis, InstallerScope::PerUser) => {}
            _ => return Err(MigrationContractError::InvalidScope),
        }
        validate_version(&self.target.version)?;
        validate_artifact_path(&self.target.artifact_path, self.target.family)?;
        if self.target.artifact_size == 0 {
            return Err(MigrationContractError::InvalidArtifactSize);
        }
        validate_sha256(&self.target.artifact_sha256)?;
        if self.parent_pid == 0 {
            return Err(MigrationContractError::InvalidParentPid);
        }
        validate_sid(&self.original_user_sid)?;
        if self.original_session_id == 0 {
            return Err(MigrationContractError::InvalidOriginalSessionId);
        }
        Ok(())
    }

    pub(crate) fn canonical_bytes(&self) -> Result<Vec<u8>, MigrationContractError> {
        serde_json::to_vec(self)
            .map_err(|error| MigrationContractError::InvalidJson(error.to_string()))
    }

    pub(crate) fn digest(&self) -> Result<String, MigrationContractError> {
        Ok(format!("{:x}", Sha256::digest(self.canonical_bytes()?)))
    }
}

impl MigrationContinuation {
    pub(crate) fn validate_for_intent(
        &self,
        intent: &MigrationIntent,
        expected_one_time_grant: &str,
        now_unix_ms: u64,
    ) -> Result<(), MigrationContractError> {
        intent.validate(now_unix_ms)?;
        self.validate_for_intent_recovery(intent, expected_one_time_grant)?;
        validate_time_window_active(
            self.created_at_unix_ms,
            self.expires_at_unix_ms,
            now_unix_ms,
        )
    }

    pub(crate) fn validate_for_intent_recovery(
        &self,
        intent: &MigrationIntent,
        expected_one_time_grant: &str,
    ) -> Result<(), MigrationContractError> {
        intent.validate_for_recovery()?;
        validate_schema(self.schema_version)?;
        validate_uuid_like(&self.continuation_id, "continuationId")?;
        validate_uuid_like(&self.intent_id, "intentId")?;
        validate_uuid_like(&self.one_time_grant, "oneTimeGrant")?;
        validate_uuid_like(expected_one_time_grant, "expectedOneTimeGrant")?;
        validate_time_window_shape(self.created_at_unix_ms, self.expires_at_unix_ms)?;
        if self.created_at_unix_ms < intent.created_at_unix_ms
            || self.expires_at_unix_ms > intent.expires_at_unix_ms
        {
            return Err(MigrationContractError::InvalidTimestamp(
                "continuationWindow",
            ));
        }
        if self.intent_id != intent.intent_id {
            return Err(MigrationContractError::IntentIdMismatch);
        }
        if self.intent_digest != intent.digest()? {
            return Err(MigrationContractError::IntentDigestMismatch);
        }
        if self.target_family != intent.target.family {
            return Err(MigrationContractError::TargetFamilyMismatch);
        }
        validate_sha256(&self.target_artifact_sha256)?;
        if self.target_artifact_sha256 != intent.target.artifact_sha256 {
            return Err(MigrationContractError::ArtifactHashMismatch);
        }
        if self.one_time_grant != expected_one_time_grant {
            return Err(MigrationContractError::GrantMismatch);
        }
        Ok(())
    }

    pub(crate) fn canonical_bytes(&self) -> Result<Vec<u8>, MigrationContractError> {
        serde_json::to_vec(self)
            .map_err(|error| MigrationContractError::InvalidJson(error.to_string()))
    }
}

pub(crate) fn parse_intent(
    bytes: &[u8],
    now_unix_ms: u64,
) -> Result<MigrationIntent, MigrationContractError> {
    let intent: MigrationIntent = serde_json::from_slice(bytes)
        .map_err(|error| MigrationContractError::InvalidJson(error.to_string()))?;
    intent.validate(now_unix_ms)?;
    Ok(intent)
}

pub(crate) fn parse_continuation(
    bytes: &[u8],
    intent: &MigrationIntent,
    expected_one_time_grant: &str,
    now_unix_ms: u64,
) -> Result<MigrationContinuation, MigrationContractError> {
    let continuation: MigrationContinuation = serde_json::from_slice(bytes)
        .map_err(|error| MigrationContractError::InvalidJson(error.to_string()))?;
    continuation.validate_for_intent(intent, expected_one_time_grant, now_unix_ms)?;
    Ok(continuation)
}

fn validate_schema(schema_version: u32) -> Result<(), MigrationContractError> {
    if schema_version == INSTALLER_MIGRATION_SCHEMA_VERSION {
        Ok(())
    } else {
        Err(MigrationContractError::InvalidSchemaVersion)
    }
}

fn validate_uuid_like(value: &str, field: &'static str) -> Result<(), MigrationContractError> {
    let parsed = uuid::Uuid::parse_str(value)
        .map_err(|_| MigrationContractError::InvalidIdentifier(field))?;
    if parsed.hyphenated().to_string() != value {
        return Err(MigrationContractError::InvalidIdentifier(field));
    }
    Ok(())
}

fn validate_time_window_shape(
    created_at_unix_ms: u64,
    expires_at_unix_ms: u64,
) -> Result<(), MigrationContractError> {
    if created_at_unix_ms == 0 || expires_at_unix_ms <= created_at_unix_ms {
        return Err(MigrationContractError::InvalidTimestamp("ordering"));
    }
    if expires_at_unix_ms - created_at_unix_ms > MAX_MIGRATION_LIFETIME_MS {
        return Err(MigrationContractError::InvalidTimestamp("lifetime"));
    }
    Ok(())
}

fn validate_time_window_active(
    created_at_unix_ms: u64,
    expires_at_unix_ms: u64,
    now_unix_ms: u64,
) -> Result<(), MigrationContractError> {
    validate_time_window_shape(created_at_unix_ms, expires_at_unix_ms)?;
    if created_at_unix_ms > now_unix_ms.saturating_add(MAX_CLOCK_SKEW_MS) {
        return Err(MigrationContractError::InvalidTimestamp("createdAt"));
    }
    if expires_at_unix_ms <= now_unix_ms {
        return Err(MigrationContractError::InvalidTimestamp("expired"));
    }
    Ok(())
}

fn validate_version(version: &str) -> Result<(), MigrationContractError> {
    if version.is_empty()
        || version.len() > 64
        || !version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'+' | b'_'))
        || !version.bytes().any(|byte| byte.is_ascii_digit())
    {
        return Err(MigrationContractError::InvalidTargetVersion);
    }
    Ok(())
}

fn validate_artifact_path(
    path: &str,
    family: InstallerFamily,
) -> Result<(), MigrationContractError> {
    if path.is_empty()
        || path.len() > 32_767
        || path.bytes().any(|byte| byte == 0 || byte < 0x20)
        || path.starts_with(r"\\?\")
        || path.starts_with(r"\\.\")
        || !is_absolute_windows_path(path)
        || has_alternate_data_stream(path)
        || has_unsafe_path_component(path)
    {
        return Err(MigrationContractError::InvalidArtifactPath);
    }
    let lower = path.to_ascii_lowercase();
    let expected_extension = match family {
        InstallerFamily::Msi => ".msi",
        InstallerFamily::Nsis => ".exe",
    };
    if !lower.ends_with(expected_extension) {
        return Err(MigrationContractError::InvalidArtifactPath);
    }
    Ok(())
}

fn is_absolute_windows_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    let drive_absolute = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/');
    let unc_absolute = path.starts_with(r"\\")
        && path[2..]
            .split(['\\', '/'])
            .filter(|component| !component.is_empty())
            .count()
            >= 3;
    drive_absolute || unc_absolute
}

fn has_alternate_data_stream(path: &str) -> bool {
    path.char_indices()
        .any(|(index, character)| character == ':' && index != 1)
}

fn has_unsafe_path_component(path: &str) -> bool {
    path.split(['\\', '/'])
        .any(|component| matches!(component, "." | ".."))
}

fn validate_sha256(value: &str) -> Result<(), MigrationContractError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(MigrationContractError::InvalidArtifactSha256);
    }
    Ok(())
}

fn validate_sid(value: &str) -> Result<(), MigrationContractError> {
    if value.len() > 184 {
        return Err(MigrationContractError::InvalidOriginalUserSid);
    }
    let mut parts = value.split('-');
    if parts.next() != Some("S")
        || parts.clone().count() < 3
        || parts.any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(MigrationContractError::InvalidOriginalUserSid);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOW: u64 = 1_750_000_000_000;
    const INTENT_ID: &str = "11111111-1111-4111-8111-111111111111";
    const NONCE: &str = "abcdef12-2222-4222-8222-222222222222";
    const CONTINUATION_ID: &str = "33333333-3333-4333-8333-333333333333";
    const GRANT: &str = "44444444-4444-4444-8444-444444444444";
    const OTHER_GRANT: &str = "55555555-5555-4555-8555-555555555555";
    const HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn valid_intent(family: InstallerFamily) -> MigrationIntent {
        let (artifact_path, scope) = match family {
            InstallerFamily::Msi => (
                r"C:\ProgramData\CodexMonitor\target.msi",
                InstallerScope::PerMachine,
            ),
            InstallerFamily::Nsis => (r"C:\Users\tester\target.exe", InstallerScope::PerUser),
        };
        MigrationIntent {
            schema_version: INSTALLER_MIGRATION_SCHEMA_VERSION,
            intent_id: INTENT_ID.into(),
            nonce: NONCE.into(),
            created_at_unix_ms: NOW - 1_000,
            expires_at_unix_ms: NOW + 60_000,
            adapter_family: family,
            target: MigrationTarget {
                family,
                version: "0.7.91".into(),
                artifact_path: artifact_path.into(),
                artifact_size: 42,
                artifact_sha256: HASH.into(),
            },
            scope,
            ui_mode: InstallerUiMode::Interactive,
            parent_pid: 42,
            original_user_sid: "S-1-5-21-1000".into(),
            original_session_id: 1,
        }
    }

    fn valid_continuation(intent: &MigrationIntent) -> MigrationContinuation {
        MigrationContinuation {
            schema_version: INSTALLER_MIGRATION_SCHEMA_VERSION,
            continuation_id: CONTINUATION_ID.into(),
            intent_id: intent.intent_id.clone(),
            intent_digest: intent.digest().unwrap(),
            target_family: intent.target.family,
            target_artifact_sha256: intent.target.artifact_sha256.clone(),
            one_time_grant: GRANT.into(),
            created_at_unix_ms: NOW,
            expires_at_unix_ms: NOW + 30_000,
        }
    }

    #[test]
    fn validates_msi_and_nsis_intents() {
        for family in [InstallerFamily::Msi, InstallerFamily::Nsis] {
            let intent = valid_intent(family);
            assert_eq!(
                parse_intent(&intent.canonical_bytes().unwrap(), NOW).unwrap(),
                intent
            );
        }
    }

    #[test]
    fn rejects_unknown_intent_and_target_fields() {
        let mut value = serde_json::to_value(valid_intent(InstallerFamily::Msi)).unwrap();
        value["unexpected"] = json!(true);
        assert!(matches!(
            parse_intent(&serde_json::to_vec(&value).unwrap(), NOW),
            Err(MigrationContractError::InvalidJson(_))
        ));

        let mut value = serde_json::to_value(valid_intent(InstallerFamily::Msi)).unwrap();
        value["target"]["unexpected"] = json!(true);
        assert!(matches!(
            parse_intent(&serde_json::to_vec(&value).unwrap(), NOW),
            Err(MigrationContractError::InvalidJson(_))
        ));
    }

    #[test]
    fn rejects_unknown_continuation_fields() {
        let intent = valid_intent(InstallerFamily::Msi);
        let mut value = serde_json::to_value(valid_continuation(&intent)).unwrap();
        value["unexpected"] = json!(true);
        assert!(matches!(
            parse_continuation(&serde_json::to_vec(&value).unwrap(), &intent, GRANT, NOW),
            Err(MigrationContractError::InvalidJson(_))
        ));
    }

    #[test]
    fn rejects_unknown_family_and_non_v1_schemas() {
        let mut value = serde_json::to_value(valid_intent(InstallerFamily::Msi)).unwrap();
        value["target"]["family"] = json!("unknown");
        assert!(matches!(
            parse_intent(&serde_json::to_vec(&value).unwrap(), NOW),
            Err(MigrationContractError::InvalidJson(_))
        ));

        for schema_version in [0, 2] {
            let mut intent = valid_intent(InstallerFamily::Msi);
            intent.schema_version = schema_version;
            assert_eq!(
                intent.validate(NOW),
                Err(MigrationContractError::InvalidSchemaVersion)
            );

            let valid_intent = valid_intent(InstallerFamily::Msi);
            let mut continuation = valid_continuation(&valid_intent);
            continuation.schema_version = schema_version;
            assert_eq!(
                continuation.validate_for_intent(&valid_intent, GRANT, NOW),
                Err(MigrationContractError::InvalidSchemaVersion)
            );
        }
    }

    #[test]
    fn rejects_family_and_scope_mismatches() {
        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.adapter_family = InstallerFamily::Nsis;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidAdapterFamily)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.scope = InstallerScope::PerUser;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidScope)
        );

        let mut intent = valid_intent(InstallerFamily::Nsis);
        intent.scope = InstallerScope::PerMachine;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidScope)
        );
    }

    #[test]
    fn rejects_invalid_path_hash_size_version_pid_and_sid() {
        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.target.artifact_path = r"relative\target.msi".into();
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidArtifactPath)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.target.artifact_path = r"C:\stage\..\target.msi".into();
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidArtifactPath)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.target.artifact_sha256 = HASH.to_ascii_uppercase();
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidArtifactSha256)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.target.artifact_size = 0;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidArtifactSize)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.target.version.clear();
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidTargetVersion)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.parent_pid = 0;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidParentPid)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.original_user_sid = "not-a-sid".into();
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidOriginalUserSid)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.original_user_sid = format!("S-1-5-{}", "1".repeat(180));
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidOriginalUserSid)
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.original_session_id = 0;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidOriginalSessionId)
        );
    }

    #[test]
    fn rejects_windows_device_namespace_artifact_paths() {
        for path in [
            r"\\?\C:\ProgramData\CodexMonitor\target.msi",
            r"\\.\C:\ProgramData\CodexMonitor\target.msi",
        ] {
            let mut intent = valid_intent(InstallerFamily::Msi);
            intent.target.artifact_path = path.into();
            assert_eq!(
                intent.validate(NOW),
                Err(MigrationContractError::InvalidArtifactPath)
            );
        }
    }

    #[test]
    fn rejects_alternate_data_stream_artifact_paths() {
        for path in [
            r"C:\ProgramData\CodexMonitor\target.msi:payload.msi",
            r"\\server\share\target.msi:payload.msi",
        ] {
            let mut intent = valid_intent(InstallerFamily::Msi);
            intent.target.artifact_path = path.into();
            assert_eq!(
                intent.validate(NOW),
                Err(MigrationContractError::InvalidArtifactPath)
            );
        }
    }

    #[test]
    fn rejects_invalid_ids_and_time_windows() {
        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.intent_id = "not-a-uuid".into();
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidIdentifier("intentId"))
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.nonce = NONCE.to_ascii_uppercase();
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidIdentifier("nonce"))
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.expires_at_unix_ms = intent.created_at_unix_ms;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidTimestamp("ordering"))
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.expires_at_unix_ms = intent.created_at_unix_ms + MAX_MIGRATION_LIFETIME_MS + 1;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidTimestamp("lifetime"))
        );

        let mut intent = valid_intent(InstallerFamily::Msi);
        intent.expires_at_unix_ms = NOW;
        assert_eq!(
            intent.validate(NOW),
            Err(MigrationContractError::InvalidTimestamp("expired"))
        );
    }

    #[test]
    fn canonical_serialization_and_digest_ignore_input_field_order() {
        let intent = valid_intent(InstallerFamily::Msi);
        let reordered = format!(
            "{{\"target\":{},\"schemaVersion\":1,\"intentId\":\"{}\",\"nonce\":\"{}\",\"createdAtUnixMs\":{},\"expiresAtUnixMs\":{},\"adapterFamily\":\"msi\",\"scope\":\"perMachine\",\"uiMode\":\"interactive\",\"parentPid\":42,\"originalUserSid\":\"S-1-5-21-1000\",\"originalSessionId\":1}}",
            serde_json::to_string(&intent.target).unwrap(),
            INTENT_ID,
            NONCE,
            NOW - 1_000,
            NOW + 60_000,
        );
        let parsed = parse_intent(reordered.as_bytes(), NOW).unwrap();
        assert_eq!(
            parsed.canonical_bytes().unwrap(),
            intent.canonical_bytes().unwrap()
        );
        assert_eq!(parsed.digest().unwrap(), intent.digest().unwrap());
    }

    #[test]
    fn intent_contains_no_source_mutation_authority() {
        let json = String::from_utf8(
            valid_intent(InstallerFamily::Msi)
                .canonical_bytes()
                .unwrap(),
        )
        .unwrap();
        assert!(!json.contains("source"));
        assert!(!json.contains("grant"));
        assert!(!json.contains("delete"));
        assert!(!json.contains("uninstall"));
    }

    #[test]
    fn continuation_binds_intent_target_artifact_grant_and_expiry() {
        let intent = valid_intent(InstallerFamily::Msi);
        let continuation = valid_continuation(&intent);
        continuation
            .validate_for_intent(&intent, GRANT, NOW)
            .unwrap();
        assert_eq!(
            parse_continuation(
                &continuation.canonical_bytes().unwrap(),
                &intent,
                GRANT,
                NOW,
            )
            .unwrap(),
            continuation
        );

        let mut changed = continuation.clone();
        changed.intent_digest = "a".repeat(64);
        assert_eq!(
            changed.validate_for_intent(&intent, GRANT, NOW),
            Err(MigrationContractError::IntentDigestMismatch)
        );

        let mut changed = continuation.clone();
        changed.target_family = InstallerFamily::Nsis;
        assert_eq!(
            changed.validate_for_intent(&intent, GRANT, NOW),
            Err(MigrationContractError::TargetFamilyMismatch)
        );

        let mut changed = continuation.clone();
        changed.target_artifact_sha256 = "a".repeat(64);
        assert_eq!(
            changed.validate_for_intent(&intent, GRANT, NOW),
            Err(MigrationContractError::ArtifactHashMismatch)
        );

        assert_eq!(
            continuation.validate_for_intent(&intent, OTHER_GRANT, NOW),
            Err(MigrationContractError::GrantMismatch)
        );

        assert_eq!(
            continuation.validate_for_intent(&intent, GRANT, continuation.expires_at_unix_ms),
            Err(MigrationContractError::InvalidTimestamp("expired"))
        );
        intent.validate_for_recovery().unwrap();
        continuation
            .validate_for_intent_recovery(&intent, GRANT)
            .unwrap();
    }

    #[test]
    fn continuation_rejects_invalid_id_grant_and_window() {
        let intent = valid_intent(InstallerFamily::Msi);
        let mut continuation = valid_continuation(&intent);
        continuation.continuation_id = "bad".into();
        assert_eq!(
            continuation.validate_for_intent(&intent, GRANT, NOW),
            Err(MigrationContractError::InvalidIdentifier("continuationId"))
        );

        let mut continuation = valid_continuation(&intent);
        continuation.one_time_grant = "bad".into();
        assert_eq!(
            continuation.validate_for_intent(&intent, GRANT, NOW),
            Err(MigrationContractError::InvalidIdentifier("oneTimeGrant"))
        );

        let mut continuation = valid_continuation(&intent);
        continuation.expires_at_unix_ms = intent.expires_at_unix_ms + 1;
        assert_eq!(
            continuation.validate_for_intent(&intent, GRANT, NOW),
            Err(MigrationContractError::InvalidTimestamp(
                "continuationWindow"
            ))
        );
    }
}

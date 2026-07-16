#[allow(dead_code)]
#[path = "../shared/installer_migration_core.rs"]
mod installer_migration_core;

use installer_migration_core::{parse_intent, INSTALLER_MIGRATION_SCHEMA_VERSION};
use serde_json::json;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_CONTRACT_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
enum CliCommand {
    ContractVersion,
    ValidateIntent { path: PathBuf },
    Help,
}

fn main() {
    match run(std::env::args_os().skip(1)) {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    }
}

fn run(args: impl IntoIterator<Item = OsString>) -> Result<String, String> {
    match parse_args(args)? {
        CliCommand::ContractVersion => Ok(json!({
            "schemaVersion": INSTALLER_MIGRATION_SCHEMA_VERSION,
            "status": "ready"
        })
        .to_string()),
        CliCommand::ValidateIntent { path } => {
            let bytes = read_contract_file(&path)?;
            let intent = parse_intent(&bytes, now_unix_ms()?)
                .map_err(|error| format!("Installer migration intent is invalid: {error:?}"))?;
            Ok(json!({
                "intentId": intent.intent_id,
                "schemaVersion": intent.schema_version,
                "status": "valid",
                "targetFamily": intent.target.family
            })
            .to_string())
        }
        CliCommand::Help => Ok(usage()),
    }
}

fn parse_args(args: impl IntoIterator<Item = OsString>) -> Result<CliCommand, String> {
    let mut args = args.into_iter();
    let Some(command) = args.next() else {
        return Err(usage());
    };
    match command.to_string_lossy().as_ref() {
        "contract-version" => {
            ensure_no_extra_args(args)?;
            Ok(CliCommand::ContractVersion)
        }
        "validate-intent" => {
            let flag = args.next().ok_or_else(usage)?;
            if flag != "--intent" {
                return Err(usage());
            }
            let path = args.next().map(PathBuf::from).ok_or_else(usage)?;
            ensure_no_extra_args(args)?;
            Ok(CliCommand::ValidateIntent { path })
        }
        "help" | "--help" | "-h" => {
            ensure_no_extra_args(args)?;
            Ok(CliCommand::Help)
        }
        _ => Err(usage()),
    }
}

fn ensure_no_extra_args(mut args: impl Iterator<Item = OsString>) -> Result<(), String> {
    if args.next().is_some() {
        Err(usage())
    } else {
        Ok(())
    }
}

fn read_contract_file(path: &Path) -> Result<Vec<u8>, String> {
    if !path.is_absolute() {
        return Err("Installer migration contract path must be absolute.".into());
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Failed to inspect installer migration contract: {error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || is_reparse_point(&metadata) {
        return Err("Installer migration contract must be a regular non-reparse file.".into());
    }
    if metadata.len() == 0 || metadata.len() > MAX_CONTRACT_BYTES {
        return Err("Installer migration contract size is outside the allowed range.".into());
    }
    let bytes = fs::read(path)
        .map_err(|error| format!("Failed to read installer migration contract: {error}"))?;
    if bytes.len() as u64 != metadata.len() || bytes.len() as u64 > MAX_CONTRACT_BYTES {
        return Err("Installer migration contract changed while it was read.".into());
    }
    Ok(bytes)
}

#[cfg(target_os = "windows")]
fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x400 != 0
}

#[cfg(not(target_os = "windows"))]
fn is_reparse_point(_metadata: &fs::Metadata) -> bool {
    false
}

fn now_unix_ms() -> Result<u64, String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "System clock is before the Unix epoch.".to_string())?
        .as_millis();
    u64::try_from(millis).map_err(|_| "System clock value is too large.".to_string())
}

fn usage() -> String {
    "USAGE:\n  codex_monitor_installer_migrator contract-version\n  codex_monitor_installer_migrator validate-intent --intent <absolute-json-path>\n\nM1 validates contracts only. It does not migrate, grant continuation, or modify installer state."
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_the_bounded_m1_command_surface() {
        assert_eq!(
            parse_args([OsString::from("contract-version")]).unwrap(),
            CliCommand::ContractVersion
        );
        assert_eq!(
            parse_args([
                OsString::from("validate-intent"),
                OsString::from("--intent"),
                OsString::from(r"C:\staging\intent.json"),
            ])
            .unwrap(),
            CliCommand::ValidateIntent {
                path: PathBuf::from(r"C:\staging\intent.json")
            }
        );
        for args in [
            vec![OsString::from("orchestrate")],
            vec![OsString::from("validate-continuation")],
            vec![
                OsString::from("validate-intent"),
                OsString::from("--intent"),
                OsString::from("intent.json"),
                OsString::from("--allow-migration"),
            ],
        ] {
            assert!(parse_args(args).is_err());
        }
    }

    #[test]
    fn contract_version_output_contains_no_migration_authority() {
        let output = run([OsString::from("contract-version")]).unwrap();
        assert!(output.contains(r#""schemaVersion":1"#));
        assert!(!output.contains("grant"));
        assert!(!output.contains("allow"));
    }
}

use std::path::Path;

use toml_edit::{value, Document, Item, Table};

use crate::files::ops::{read_with_policy, write_with_policy};
use crate::files::policy::{policy_for, FileKind, FileScope};

const LEGACY_NATIVE_MARKDOWN_IMPORT_FLAG: &str = "native_markdown_imported";

pub(crate) fn load_global_config_document(codex_home: &Path) -> Result<(bool, Document), String> {
    let policy = policy_for(FileScope::Global, FileKind::Config)?;
    let root = codex_home.to_path_buf();
    let response = read_with_policy(&root, policy)?;
    let document = if response.exists {
        parse_document(response.content.as_str())?
    } else {
        Document::new()
    };
    Ok((response.exists, document))
}

pub(crate) fn persist_global_config_document(
    codex_home: &Path,
    document: &Document,
) -> Result<(), String> {
    let policy = policy_for(FileScope::Global, FileKind::Config)?;
    let root = codex_home.to_path_buf();
    let mut document = document.clone();
    remove_legacy_agents_import_marker(&mut document);
    let mut rendered = document.to_string();
    if !rendered.ends_with('\n') {
        rendered.push('\n');
    }
    write_with_policy(&root, policy, rendered.as_str())
}

pub(crate) fn parse_document(contents: &str) -> Result<Document, String> {
    if contents.trim().is_empty() {
        return Ok(Document::new());
    }
    contents
        .parse::<Document>()
        .map_err(|err| format!("Failed to parse config.toml: {err}"))
}

pub(crate) fn ensure_table<'a>(
    document: &'a mut Document,
    key: &str,
) -> Result<&'a mut Table, String> {
    if document.get(key).is_none() {
        document[key] = Item::Table(Table::new());
    }
    document[key]
        .as_table_mut()
        .ok_or_else(|| format!("`{key}` must be a table in config.toml"))
}

pub(crate) fn read_feature_flag(document: &Document, key: &str) -> Option<bool> {
    document
        .get("features")
        .and_then(Item::as_table_like)
        .and_then(|table| table.get(key))
        .and_then(Item::as_bool)
}

pub(crate) fn set_feature_flag(
    document: &mut Document,
    key: &str,
    enabled: bool,
) -> Result<(), String> {
    let features = ensure_table(document, "features")?;
    features[key] = value(enabled);
    Ok(())
}

pub(crate) fn read_top_level_string(document: &Document, key: &str) -> Option<String> {
    let value = document.get(key).and_then(Item::as_str)?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn read_top_level_positive_integer(document: &Document, key: &str) -> Option<u64> {
    let value = document.get(key).and_then(Item::as_integer)?;
    u64::try_from(value).ok().filter(|value| *value > 0)
}

pub(crate) fn read_nested_string(document: &Document, path: &[&str]) -> Option<String> {
    let (last, parents) = path.split_last()?;
    let mut item = document.get(parents.first()?)?;
    for key in parents.iter().skip(1) {
        item = item.as_table_like()?.get(key)?;
    }
    let value = item.as_table_like()?.get(last)?.as_str()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn set_top_level_string(document: &mut Document, key: &str, value_raw: Option<&str>) {
    let Some(value_raw) = value_raw else {
        let _ = document.remove(key);
        return;
    };
    let trimmed = value_raw.trim();
    if trimmed.is_empty() {
        let _ = document.remove(key);
        return;
    }
    document[key] = value(trimmed);
}

pub(crate) fn remove_legacy_agents_import_marker(document: &mut Document) -> bool {
    document
        .get_mut("agents")
        .and_then(Item::as_table_mut)
        .and_then(|agents| agents.remove(LEGACY_NATIVE_MARKDOWN_IMPORT_FLAG))
        .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("codex-monitor-config-{prefix}-{nonce}"));
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn persist_global_config_document_removes_legacy_agents_import_marker() {
        let codex_home = temp_dir("legacy-agents-marker");
        let document: Document = r#"
[agents]
native_markdown_imported = true
max_threads = 8

[agents.researcher]
config_file = "agents/researcher.toml"
"#
        .parse()
        .expect("parse");

        persist_global_config_document(&codex_home, &document).expect("persist");

        let config = std::fs::read_to_string(codex_home.join("config.toml")).expect("read config");
        assert!(!config.contains("native_markdown_imported"));
        assert!(config.contains("max_threads = 8"));
        assert!(config.contains("[agents.researcher]"));

        let _ = std::fs::remove_dir_all(codex_home);
    }
}

use std::path::Path;

use toml_edit::{value, Document, Item, Table};

use crate::files::io::TextFileResponse;
use crate::files::ops::{
    read_with_policy, write_with_policy, write_with_policy_atomic_if_unchanged,
};
use crate::files::policy::{policy_for, FileKind, FileScope};

const LEGACY_NATIVE_MARKDOWN_IMPORT_FLAG: &str = "native_markdown_imported";

#[derive(Clone)]
pub(crate) struct GlobalConfigSnapshot {
    pub(crate) document: Document,
    original: TextFileResponse,
}

pub(crate) fn load_global_config_snapshot(
    codex_home: &Path,
) -> Result<GlobalConfigSnapshot, String> {
    let policy = policy_for(FileScope::Global, FileKind::Config)?;
    let root = codex_home.to_path_buf();
    let response = read_with_policy(&root, policy)?;
    let document = if response.exists {
        parse_document(response.content.as_str())?
    } else {
        Document::new()
    };
    Ok(GlobalConfigSnapshot {
        document,
        original: response,
    })
}

pub(crate) fn load_global_config_document(codex_home: &Path) -> Result<(bool, Document), String> {
    let snapshot = load_global_config_snapshot(codex_home)?;
    Ok((snapshot.original.exists, snapshot.document))
}

fn render_global_config_document(document: &Document, remove_legacy_marker: bool) -> String {
    let mut document = document.clone();
    if remove_legacy_marker {
        remove_legacy_agents_import_marker(&mut document);
    }
    let mut rendered = document.to_string();
    if !rendered.ends_with('\n') {
        rendered.push('\n');
    }
    rendered
}

pub(crate) fn persist_global_config_document(
    codex_home: &Path,
    document: &Document,
) -> Result<(), String> {
    let policy = policy_for(FileScope::Global, FileKind::Config)?;
    let root = codex_home.to_path_buf();
    let rendered = render_global_config_document(document, true);
    write_with_policy(&root, policy, rendered.as_str())
}

#[allow(dead_code)]
pub(crate) fn persist_global_config_document_if_unchanged(
    codex_home: &Path,
    snapshot: &GlobalConfigSnapshot,
    document: &Document,
) -> Result<(), String> {
    let policy = policy_for(FileScope::Global, FileKind::Config)?;
    let root = codex_home.to_path_buf();
    let rendered = render_global_config_document(document, false);
    write_with_policy_atomic_if_unchanged(&root, policy, rendered.as_str(), &snapshot.original)
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

pub(crate) fn set_top_level_positive_integer(
    document: &mut Document,
    key: &str,
    value_raw: Option<u64>,
) -> Result<(), String> {
    let Some(value_raw) = value_raw.filter(|value| *value > 0) else {
        let _ = document.remove(key);
        return Ok(());
    };
    let value_raw = i64::try_from(value_raw)
        .map_err(|_| format!("`{key}` exceeds the supported config.toml integer range"))?;
    document[key] = value(value_raw);
    Ok(())
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

    #[test]
    fn top_level_positive_integer_round_trips_and_clears() {
        let mut document = parse_document("model = \"gpt-5\"\n").expect("parse");

        set_top_level_positive_integer(&mut document, "tool_output_token_limit", Some(8_000))
            .expect("set limit");
        assert_eq!(
            read_top_level_positive_integer(&document, "tool_output_token_limit"),
            Some(8_000)
        );
        assert_eq!(
            read_top_level_string(&document, "model"),
            Some("gpt-5".to_string())
        );

        set_top_level_positive_integer(&mut document, "tool_output_token_limit", None)
            .expect("clear limit");
        assert_eq!(
            read_top_level_positive_integer(&document, "tool_output_token_limit"),
            None
        );
        assert_eq!(
            read_top_level_string(&document, "model"),
            Some("gpt-5".to_string())
        );
    }
}

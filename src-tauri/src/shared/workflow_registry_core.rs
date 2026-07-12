use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

const MAX_SKILL_FILE_BYTES: u64 = 512 * 1024;
const MAX_SCAN_DEPTH: usize = 5;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowRegistrySkill {
    name: String,
    path: String,
    description: Option<String>,
    scope: String,
    provider_kinds: Vec<String>,
    model_patterns: Vec<String>,
    trigger_keywords: Vec<String>,
    capability_requirements: Vec<String>,
    fallback: Option<String>,
    priority: i64,
    trust_level: String,
    source: String,
    instructions: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowRegistryAgent {
    name: String,
    path: String,
    description: Option<String>,
    scope: String,
    provider_kinds: Vec<String>,
    model_patterns: Vec<String>,
    capability_requirements: Vec<String>,
    trigger_keywords: Vec<String>,
    fallback: Option<String>,
    priority: i64,
    trust_level: String,
    source: String,
    developer_instructions: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowRegistrySnapshot {
    fingerprint: String,
    skills: Vec<WorkflowRegistrySkill>,
    agents: Vec<WorkflowRegistryAgent>,
    source_paths: Vec<String>,
    errors: Vec<String>,
    cache_hit: bool,
}

#[derive(Clone)]
struct CachedRegistry {
    fingerprint: String,
    snapshot: WorkflowRegistrySnapshot,
}

#[derive(Clone, Copy)]
enum RegistrySource {
    Global,
    User,
    Project,
    Native,
}

impl RegistrySource {
    fn label(self) -> &'static str {
        match self {
            Self::Global => "global",
            Self::User => "user",
            Self::Project => "project",
            Self::Native => "native",
        }
    }

    fn priority(self) -> u8 {
        match self {
            Self::Global => 0,
            Self::User => 1,
            Self::Native => 2,
            Self::Project => 3,
        }
    }
}

fn registry_cache() -> &'static Mutex<HashMap<String, CachedRegistry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedRegistry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn normalized_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn parse_inline_list(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    let unwrapped = trimmed
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(trimmed);
    unwrapped
        .split(',')
        .map(|item| item.trim().trim_matches(['"', '\'']).to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn parse_frontmatter(content: &str) -> (BTreeMap<String, String>, String) {
    let normalized = content.replace("\r\n", "\n");
    let mut lines = normalized.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (BTreeMap::new(), normalized);
    }
    let mut metadata = BTreeMap::new();
    let mut body_start = None;
    let mut offset = 4;
    for line in normalized[4..].split_inclusive('\n') {
        if line.trim() == "---" {
            body_start = Some(offset + line.len());
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            metadata.insert(
                key.trim().replace('-', "_").to_ascii_lowercase(),
                value.trim().trim_matches(['"', '\'']).to_string(),
            );
        }
        offset += line.len();
    }
    let body = body_start
        .and_then(|start| normalized.get(start..))
        .unwrap_or("")
        .trim()
        .to_string();
    (metadata, body)
}

fn metadata_list(metadata: &BTreeMap<String, String>, key: &str) -> Vec<String> {
    metadata
        .get(key)
        .map(|value| parse_inline_list(value))
        .unwrap_or_default()
}

fn metadata_scope(metadata: &BTreeMap<String, String>) -> String {
    match metadata.get("scope").map(String::as_str) {
        Some("provider") => "provider".to_string(),
        Some("model") => "model".to_string(),
        _ => "public".to_string(),
    }
}

fn metadata_priority(metadata: &BTreeMap<String, String>) -> i64 {
    metadata
        .get("priority")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
}

fn collect_skill_files(root: &Path, depth: usize, output: &mut Vec<PathBuf>) {
    if depth > MAX_SCAN_DEPTH || !root.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if matches!(name.as_str(), ".git" | "node_modules" | "target") {
                continue;
            }
            collect_skill_files(&path, depth + 1, output);
        } else if entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case("SKILL.md")
        {
            output.push(path);
        }
    }
}

fn collect_agent_files(root: &Path, output: &mut Vec<PathBuf>) {
    if !root.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    output.extend(entries.flatten().filter_map(|entry| {
        let path = entry.path();
        path.extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("toml"))
            .then_some(path)
    }));
}

fn file_fingerprint(path: &Path, hasher: &mut Sha256) {
    hasher.update(normalized_path(path).as_bytes());
    if let Ok(metadata) = fs::metadata(path) {
        hasher.update(metadata.len().to_le_bytes());
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                hasher.update(duration.as_nanos().to_le_bytes());
            }
        }
    }
}

fn read_skill(path: &Path, source: RegistrySource) -> Result<WorkflowRegistrySkill, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_SKILL_FILE_BYTES {
        return Err(format!(
            "skill file exceeds limit: {}",
            normalized_path(path)
        ));
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let (frontmatter, instructions) = parse_frontmatter(&content);
    let name = frontmatter
        .get("name")
        .cloned()
        .or_else(|| {
            path.parent()
                .and_then(Path::file_name)
                .map(|value| value.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "skill".to_string());
    Ok(WorkflowRegistrySkill {
        name,
        path: normalized_path(path),
        description: frontmatter.get("description").cloned(),
        scope: metadata_scope(&frontmatter),
        provider_kinds: metadata_list(&frontmatter, "provider_kinds"),
        model_patterns: metadata_list(&frontmatter, "model_patterns"),
        trigger_keywords: metadata_list(&frontmatter, "trigger_keywords"),
        capability_requirements: metadata_list(&frontmatter, "capability_requirements"),
        fallback: frontmatter
            .get("fallback")
            .cloned()
            .filter(|value| !value.is_empty()),
        priority: metadata_priority(&frontmatter),
        trust_level: frontmatter
            .get("trust_level")
            .cloned()
            .unwrap_or_else(|| "prompt".to_string()),
        source: source.label().to_string(),
        instructions,
    })
}

fn read_agent(path: &Path, source: RegistrySource) -> Result<WorkflowRegistryAgent, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let document = content
        .parse::<toml_edit::Document>()
        .map_err(|error| error.to_string())?;
    let name = document
        .get("name")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .or_else(|| {
            path.file_stem()
                .map(|value| value.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "agent".to_string());
    let string_array = |key: &str| {
        document
            .get(key)
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };
    Ok(WorkflowRegistryAgent {
        name,
        path: normalized_path(path),
        description: document
            .get("description")
            .and_then(|value| value.as_str())
            .map(str::to_string),
        scope: document
            .get("scope")
            .and_then(|value| value.as_str())
            .filter(|value| matches!(*value, "provider" | "model"))
            .unwrap_or("public")
            .to_string(),
        provider_kinds: string_array("provider_kinds"),
        model_patterns: string_array("model_patterns"),
        capability_requirements: string_array("capability_requirements"),
        trigger_keywords: string_array("trigger_keywords"),
        fallback: document
            .get("fallback")
            .and_then(|value| value.as_str())
            .map(str::to_string),
        priority: document
            .get("priority")
            .and_then(|value| value.as_integer())
            .unwrap_or(0),
        trust_level: document
            .get("trust_level")
            .and_then(|value| value.as_str())
            .filter(|value| matches!(*value, "trusted" | "prompt" | "untrusted"))
            .unwrap_or("prompt")
            .to_string(),
        source: source.label().to_string(),
        developer_instructions: document
            .get("developer_instructions")
            .and_then(|value| value.as_str())
            .map(str::to_string),
    })
}

fn collect_native_paths(value: &Value, output: &mut Vec<PathBuf>) {
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                if key.eq_ignore_ascii_case("path") {
                    if let Some(raw) = value.as_str() {
                        let path = PathBuf::from(raw);
                        let skill_path = if path.is_dir() {
                            path.join("SKILL.md")
                        } else {
                            path
                        };
                        if skill_path.is_file()
                            && skill_path.file_name().is_some_and(|name| {
                                name.to_string_lossy().eq_ignore_ascii_case("SKILL.md")
                            })
                        {
                            output.push(skill_path);
                        }
                    }
                }
                collect_native_paths(value, output);
            }
        }
        Value::Array(items) => items
            .iter()
            .for_each(|item| collect_native_paths(item, output)),
        _ => {}
    }
}

pub(crate) fn native_skill_paths(value: &Value) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    collect_native_paths(value, &mut paths);
    paths.sort();
    paths.dedup();
    paths
}

pub(crate) fn build_registry_snapshot(
    codex_home: &Path,
    user_home: Option<&Path>,
    workspace_path: &Path,
    native_paths: &[PathBuf],
) -> WorkflowRegistrySnapshot {
    let roots = [
        (codex_home.join("skills"), RegistrySource::Global),
        (
            user_home
                .map(|home| home.join(".agents").join("skills"))
                .unwrap_or_default(),
            RegistrySource::User,
        ),
        (
            workspace_path.join(".agents").join("skills"),
            RegistrySource::Project,
        ),
        (
            workspace_path.join(".codex").join("skills"),
            RegistrySource::Project,
        ),
    ];
    let agent_roots = [
        (codex_home.join("agents"), RegistrySource::Global),
        (
            workspace_path.join(".codex").join("agents"),
            RegistrySource::Project,
        ),
    ];
    let mut skill_files = Vec::new();
    for (root, source) in &roots {
        let mut files = Vec::new();
        collect_skill_files(root, 0, &mut files);
        skill_files.extend(files.into_iter().map(|path| (path, *source)));
    }
    skill_files.extend(
        native_paths
            .iter()
            .cloned()
            .map(|path| (path, RegistrySource::Native)),
    );
    let mut agent_files = Vec::new();
    for (root, source) in &agent_roots {
        let mut files = Vec::new();
        collect_agent_files(root, &mut files);
        agent_files.extend(files.into_iter().map(|path| (path, *source)));
    }
    skill_files.sort_by(|left, right| left.0.cmp(&right.0));
    skill_files.dedup_by(|left, right| left.0 == right.0);
    agent_files.sort_by(|left, right| left.0.cmp(&right.0));

    let mut hasher = Sha256::new();
    skill_files
        .iter()
        .for_each(|(path, _)| file_fingerprint(path, &mut hasher));
    agent_files
        .iter()
        .for_each(|(path, _)| file_fingerprint(path, &mut hasher));
    let fingerprint = format!("{:x}", hasher.finalize());
    let cache_key = format!(
        "{}|{}",
        normalized_path(codex_home),
        normalized_path(workspace_path)
    );
    if let Ok(cache) = registry_cache().lock() {
        if let Some(cached) = cache.get(&cache_key) {
            if cached.fingerprint == fingerprint {
                let mut snapshot = cached.snapshot.clone();
                snapshot.cache_hit = true;
                return snapshot;
            }
        }
    }

    let mut errors = Vec::new();
    let mut skills_by_name: HashMap<String, (u8, WorkflowRegistrySkill)> = HashMap::new();
    let mut seen_paths = HashSet::new();
    for (path, source) in skill_files {
        let normalized = normalized_path(&path);
        if !seen_paths.insert(normalized) {
            continue;
        }
        match read_skill(&path, source) {
            Ok(skill) => {
                let key = skill.name.to_ascii_lowercase();
                let replace = skills_by_name
                    .get(&key)
                    .is_none_or(|(priority, _)| source.priority() >= *priority);
                if replace {
                    skills_by_name.insert(key, (source.priority(), skill));
                }
            }
            Err(error) => errors.push(error),
        }
    }
    let mut skills = skills_by_name
        .into_values()
        .map(|(_, skill)| skill)
        .collect::<Vec<_>>();
    skills.sort_by(|left, right| left.name.cmp(&right.name));

    let mut agents = Vec::new();
    for (path, source) in agent_files {
        match read_agent(&path, source) {
            Ok(agent) => agents.push(agent),
            Err(error) => errors.push(error),
        }
    }
    agents.sort_by(|left, right| left.name.cmp(&right.name));
    let source_paths = roots
        .iter()
        .map(|(path, _)| path)
        .chain(agent_roots.iter().map(|(path, _)| path))
        .filter(|path| path.is_dir())
        .map(|path| normalized_path(path))
        .collect::<Vec<_>>();
    let snapshot = WorkflowRegistrySnapshot {
        fingerprint: fingerprint.clone(),
        skills,
        agents,
        source_paths,
        errors,
        cache_hit: false,
    };
    if let Ok(mut cache) = registry_cache().lock() {
        cache.insert(
            cache_key,
            CachedRegistry {
                fingerprint,
                snapshot: snapshot.clone(),
            },
        );
    }
    snapshot
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir().join(format!("codex-monitor-workflow-{label}-{nonce}"))
    }

    #[test]
    fn registry_prefers_project_skill_and_parses_metadata() {
        let root = temp_root("precedence");
        let codex_home = root.join("codex");
        let workspace = root.join("workspace");
        let global = codex_home.join("skills").join("diagnose");
        let project = workspace.join(".agents").join("skills").join("diagnose");
        fs::create_dir_all(&global).expect("global skill dir");
        fs::create_dir_all(&project).expect("project skill dir");
        fs::write(global.join("SKILL.md"), "---\nname: diagnose\n---\nglobal")
            .expect("global skill");
        fs::write(
            project.join("SKILL.md"),
            "---\nname: diagnose\nscope: provider\nprovider_kinds: [opencode]\ntrigger_keywords: [失败, 排查]\npriority: 7\n---\nproject",
        )
        .expect("project skill");

        let snapshot = build_registry_snapshot(&codex_home, None, &workspace, &[]);

        assert_eq!(snapshot.skills.len(), 1);
        assert_eq!(snapshot.skills[0].source, "project");
        assert_eq!(snapshot.skills[0].scope, "provider");
        assert_eq!(snapshot.skills[0].provider_kinds, vec!["opencode"]);
        assert_eq!(snapshot.skills[0].instructions, "project");
        assert_eq!(snapshot.skills[0].priority, 7);
        let cached = build_registry_snapshot(&codex_home, None, &workspace, &[]);
        assert!(cached.cache_hit);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn registry_reads_agent_contracts() {
        let root = temp_root("agents");
        let codex_home = root.join("codex");
        let workspace = root.join("workspace");
        let agents = codex_home.join("agents");
        fs::create_dir_all(&agents).expect("agents dir");
        fs::create_dir_all(&workspace).expect("workspace dir");
        fs::write(
            agents.join("reviewer.toml"),
            "name = \"reviewer\"\ndescription = \"Review changes\"\nscope = \"model\"\nmodel_patterns = [\"gpt\"]\n",
        )
        .expect("agent");

        let snapshot = build_registry_snapshot(&codex_home, None, &workspace, &[]);

        assert_eq!(snapshot.agents.len(), 1);
        assert_eq!(snapshot.agents[0].name, "reviewer");
        assert_eq!(snapshot.agents[0].scope, "model");
        assert_eq!(snapshot.agents[0].model_patterns, vec!["gpt"]);
        assert_eq!(snapshot.agents[0].trust_level, "prompt");
        let _ = fs::remove_dir_all(root);
    }
}

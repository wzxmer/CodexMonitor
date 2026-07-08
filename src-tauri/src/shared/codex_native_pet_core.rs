use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::codex::home as codex_home;
use crate::types::AppSettings;

const GLOBAL_STATE_FILE: &str = ".codex-global-state.json";
const PERSISTED_ATOM_STATE_KEY: &str = "electron-persisted-atom-state";
const OVERLAY_OPEN_KEY: &str = "electron-avatar-overlay-open";
const SELECTED_AVATAR_ID_KEY: &str = "selected-avatar-id";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNativePet {
    pub(crate) id: String,
    pub(crate) display_name: String,
    #[serde(default)]
    pub(crate) description: Option<String>,
    pub(crate) directory: String,
    pub(crate) spritesheet_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexNativePetState {
    pub(crate) enabled: bool,
    #[serde(default)]
    pub(crate) selected_avatar_id: Option<String>,
    pub(crate) codex_home: String,
    pub(crate) global_state_path: String,
    pub(crate) pets_dir: String,
    pub(crate) pets: Vec<CodexNativePet>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetJson {
    id: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    spritesheet_path: Option<String>,
}

fn codex_home_path(settings: &AppSettings) -> Result<PathBuf, String> {
    codex_home::resolve_settings_codex_home(settings)
        .or_else(|| codex_home::resolve_home_dir().map(|home| home.join(".codex")))
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
}

fn global_state_path(settings: &AppSettings) -> Result<PathBuf, String> {
    Ok(codex_home_path(settings)?.join(GLOBAL_STATE_FILE))
}

fn read_global_state(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Codex global state: {error}"))?;
    serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse Codex global state: {error}"))
}

fn write_global_state(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create Codex state directory: {error}"))?;
    }
    let raw = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize Codex global state: {error}"))?;
    fs::write(path, raw).map_err(|error| format!("Failed to write Codex global state: {error}"))
}

fn persisted_state_mut(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    let root = value.as_object_mut().expect("global state object");
    let persisted = root
        .entry(PERSISTED_ATOM_STATE_KEY.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !persisted.is_object() {
        *persisted = Value::Object(Map::new());
    }
    persisted
        .as_object_mut()
        .expect("persisted atom state object")
}

fn persisted_state(value: &Value) -> Option<&Map<String, Value>> {
    value
        .as_object()
        .and_then(|root| root.get(PERSISTED_ATOM_STATE_KEY))
        .and_then(Value::as_object)
}

fn read_enabled(value: &Value) -> bool {
    persisted_state(value)
        .and_then(|state| state.get(OVERLAY_OPEN_KEY))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn read_selected_avatar_id(value: &Value) -> Option<String> {
    persisted_state(value)
        .and_then(|state| state.get(SELECTED_AVATAR_ID_KEY))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn set_enabled(value: &mut Value, enabled: bool) {
    persisted_state_mut(value).insert(OVERLAY_OPEN_KEY.to_string(), Value::Bool(enabled));
}

fn set_selected_avatar_id(value: &mut Value, avatar_id: &str) {
    persisted_state_mut(value).insert(
        SELECTED_AVATAR_ID_KEY.to_string(),
        Value::String(avatar_id.to_string()),
    );
}

fn pet_display_name_from_dir(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pet")
        .to_string()
}

fn list_native_pets(pets_dir: &Path) -> Vec<CodexNativePet> {
    let Ok(entries) = fs::read_dir(pets_dir) else {
        return Vec::new();
    };
    let mut pets = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let directory = entry.path();
            if !directory.is_dir() {
                return None;
            }
            let pet_json_path = directory.join("pet.json");
            let raw = fs::read_to_string(&pet_json_path).ok()?;
            let pet_json: PetJson = serde_json::from_str(&raw).ok()?;
            let spritesheet = pet_json
                .spritesheet_path
                .unwrap_or_else(|| "spritesheet.webp".to_string());
            let spritesheet_path = directory.join(&spritesheet);
            if !spritesheet_path.exists() {
                return None;
            }
            Some(CodexNativePet {
                id: pet_json.id,
                display_name: pet_json
                    .display_name
                    .unwrap_or_else(|| pet_display_name_from_dir(&directory)),
                description: pet_json.description,
                directory: directory.to_string_lossy().to_string(),
                spritesheet_path: spritesheet_path.to_string_lossy().to_string(),
            })
        })
        .collect::<Vec<_>>();
    pets.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    pets
}

pub(crate) fn get_codex_native_pet_state_core(
    settings: &AppSettings,
) -> Result<CodexNativePetState, String> {
    let codex_home = codex_home_path(settings)?;
    let state_path = codex_home.join(GLOBAL_STATE_FILE);
    let pets_dir = codex_home.join("pets");
    let state = read_global_state(&state_path)?;
    Ok(CodexNativePetState {
        enabled: read_enabled(&state),
        selected_avatar_id: read_selected_avatar_id(&state),
        codex_home: codex_home.to_string_lossy().to_string(),
        global_state_path: state_path.to_string_lossy().to_string(),
        pets_dir: pets_dir.to_string_lossy().to_string(),
        pets: list_native_pets(&pets_dir),
    })
}

pub(crate) fn set_codex_native_pet_enabled_core(
    settings: &AppSettings,
    enabled: bool,
) -> Result<CodexNativePetState, String> {
    let state_path = global_state_path(settings)?;
    let mut state = read_global_state(&state_path)?;
    set_enabled(&mut state, enabled);
    write_global_state(&state_path, &state)?;
    get_codex_native_pet_state_core(settings)
}

pub(crate) fn set_codex_native_pet_selected_core(
    settings: &AppSettings,
    avatar_id: &str,
) -> Result<CodexNativePetState, String> {
    let trimmed = avatar_id.trim();
    if trimmed.is_empty() {
        return Err("Avatar id is required".to_string());
    }
    let state_path = global_state_path(settings)?;
    let mut state = read_global_state(&state_path)?;
    set_selected_avatar_id(&mut state, trimmed);
    write_global_state(&state_path, &state)?;
    get_codex_native_pet_state_core(settings)
}

pub(crate) fn wake_codex_native_pet_core(
    settings: &AppSettings,
) -> Result<CodexNativePetState, String> {
    set_codex_native_pet_enabled_core(settings, true)
}

pub(crate) fn import_codex_native_pet_core(
    settings: &AppSettings,
    source_dir: &str,
) -> Result<CodexNativePetState, String> {
    let source = PathBuf::from(source_dir);
    if !source.is_dir() {
        return Err("Select a Codex pet directory".to_string());
    }
    let pet_json_path = source.join("pet.json");
    if !pet_json_path.exists() {
        return Err("Pet directory must include pet.json".to_string());
    }
    let raw = fs::read_to_string(&pet_json_path)
        .map_err(|error| format!("Failed to read pet.json: {error}"))?;
    let pet_json: PetJson =
        serde_json::from_str(&raw).map_err(|error| format!("Failed to parse pet.json: {error}"))?;
    let spritesheet = pet_json
        .spritesheet_path
        .clone()
        .unwrap_or_else(|| "spritesheet.webp".to_string());
    if !source.join(&spritesheet).exists() {
        return Err("Pet directory must include spritesheet.webp".to_string());
    }

    let codex_home = codex_home_path(settings)?;
    let pets_dir = codex_home.join("pets");
    fs::create_dir_all(&pets_dir)
        .map_err(|error| format!("Failed to create Codex pets directory: {error}"))?;
    let preferred_dir = source
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(pet_json.id.as_str());
    let target = unique_pet_target_dir(&pets_dir, preferred_dir);
    fs::create_dir_all(&target)
        .map_err(|error| format!("Failed to create pet directory: {error}"))?;
    fs::copy(&pet_json_path, target.join("pet.json"))
        .map_err(|error| format!("Failed to copy pet.json: {error}"))?;
    fs::copy(source.join(&spritesheet), target.join(&spritesheet))
        .map_err(|error| format!("Failed to copy spritesheet: {error}"))?;

    set_codex_native_pet_selected_core(settings, &pet_json.id)
}

fn unique_pet_target_dir(pets_dir: &Path, preferred: &str) -> PathBuf {
    let sanitized = preferred
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let base = if sanitized.is_empty() {
        "custom-pet".to_string()
    } else {
        sanitized
    };
    let mut candidate = pets_dir.join(&base);
    if !candidate.exists() {
        return candidate;
    }
    for index in 2..1000 {
        candidate = pets_dir.join(format!("{base}-{index}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    pets_dir.join(format!("{base}-{}", uuid::Uuid::new_v4()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_nested_native_pet_state() {
        let state = serde_json::json!({
            "electron-persisted-atom-state": {
                "electron-avatar-overlay-open": true,
                "selected-avatar-id": "eve"
            }
        });
        assert!(read_enabled(&state));
        assert_eq!(read_selected_avatar_id(&state), Some("eve".to_string()));
    }

    #[test]
    fn writes_nested_native_pet_state() {
        let mut state = Value::Object(Map::new());
        set_enabled(&mut state, true);
        set_selected_avatar_id(&mut state, "codex");
        assert!(read_enabled(&state));
        assert_eq!(read_selected_avatar_id(&state), Some("codex".to_string()));
    }
}

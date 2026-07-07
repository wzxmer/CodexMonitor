#[cfg(target_os = "windows")]
use std::collections::BTreeSet;

#[cfg(target_os = "windows")]
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    RegKey,
};

fn normalize_font_name(raw: &str) -> Option<String> {
    let cleaned: String = raw
        .chars()
        .filter(|character| !character.is_control() && *character != '\u{feff}')
        .collect();
    let mut name = cleaned
        .trim()
        .trim_start_matches('.')
        .trim()
        .to_string();
    for suffix in [
        "(TrueType)",
        "(OpenType)",
        "(Type 1)",
        "(Raster)",
        "& TrueType",
        "& OpenType",
    ] {
        name = name.replace(suffix, "");
    }
    let name = name
        .trim()
        .trim_start_matches('.')
        .trim()
        .trim_end_matches('&')
        .trim();
    if name.is_empty() {
        return None;
    }
    if name.starts_with('.') {
        return None;
    }
    Some(name.to_string())
}

#[cfg(target_os = "windows")]
fn read_windows_fonts_from(root: RegKey) -> Vec<String> {
    let Ok(fonts_key) =
        root.open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts")
    else {
        return Vec::new();
    };

    fonts_key
        .enum_values()
        .filter_map(Result::ok)
        .filter_map(|(name, _)| normalize_font_name(&name))
        .collect()
}

#[cfg(target_os = "windows")]
fn list_system_fonts_impl() -> Vec<String> {
    let mut fonts = BTreeSet::new();
    for name in [
        "Arial",
        "Cascadia Code",
        "Cascadia Mono",
        "Consolas",
        "Microsoft YaHei UI",
        "Segoe UI",
        "SimSun",
    ] {
        fonts.insert(name.to_string());
    }
    for name in read_windows_fonts_from(RegKey::predef(HKEY_LOCAL_MACHINE))
        .into_iter()
        .chain(read_windows_fonts_from(RegKey::predef(HKEY_CURRENT_USER)))
    {
        fonts.insert(name);
    }
    let mut font_database = fontdb::Database::new();
    font_database.load_system_fonts();
    for face in font_database.faces() {
        for (family, _) in &face.families {
            if let Some(name) = normalize_font_name(family) {
                fonts.insert(name);
            }
        }
    }
    fonts.into_iter().collect()
}

#[cfg(not(target_os = "windows"))]
fn list_system_fonts_impl() -> Vec<String> {
    Vec::new()
}

#[tauri::command]
pub(crate) fn list_system_fonts() -> Vec<String> {
    list_system_fonts_impl()
}

#[cfg(test)]
mod tests {
    use super::normalize_font_name;

    #[test]
    fn normalizes_windows_font_registry_names() {
        assert_eq!(
            normalize_font_name("Microsoft YaHei UI (TrueType)").as_deref(),
            Some("Microsoft YaHei UI"),
        );
        assert_eq!(
            normalize_font_name("Cascadia Mono & TrueType").as_deref(),
            Some("Cascadia Mono"),
        );
        assert_eq!(
            normalize_font_name(".PingFang HK").as_deref(),
            Some("PingFang HK"),
        );
        assert_eq!(
            normalize_font_name("\u{feff}.苹方-港 (OpenType)").as_deref(),
            Some("苹方-港"),
        );
    }
}

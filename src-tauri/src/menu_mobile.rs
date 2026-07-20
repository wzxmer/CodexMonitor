use serde::Deserialize;
use std::marker::PhantomData;
use tauri::Runtime;

pub struct MenuItemRegistry<R: Runtime> {
    _runtime: PhantomData<R>,
}

impl<R: Runtime> Default for MenuItemRegistry<R> {
    fn default() -> Self {
        Self {
            _runtime: PhantomData,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct MenuAcceleratorUpdate {
    pub id: String,
    pub accelerator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeMenuLabels {
    #[serde(flatten)]
    _labels: std::collections::HashMap<String, String>,
}

#[tauri::command]
pub fn menu_set_accelerators<R: Runtime>(
    _app: tauri::AppHandle<R>,
    updates: Vec<MenuAcceleratorUpdate>,
) -> Result<(), String> {
    for update in updates {
        let _ = (update.id, update.accelerator);
    }
    Ok(())
}

#[tauri::command]
pub fn menu_set_labels<R: Runtime>(
    _app: tauri::AppHandle<R>,
    _labels: NativeMenuLabels,
) -> Result<(), String> {
    Ok(())
}

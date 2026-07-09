#[cfg(desktop)]
use tauri::Runtime;
#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt;

#[cfg(desktop)]
pub(crate) fn is_enabled_for_app<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[cfg(desktop)]
pub(crate) fn set_enabled_for_app<R: Runtime>(
    app: &tauri::AppHandle<R>,
    enabled: bool,
) -> Result<bool, String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|error| error.to_string())?;
    } else {
        autolaunch.disable().map_err(|error| error.to_string())?;
    }
    autolaunch.is_enabled().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn app_autostart_is_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        is_enabled_for_app(&app)
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
pub(crate) fn app_autostart_set_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    enabled: bool,
) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        set_enabled_for_app(&app, enabled)
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        let _ = enabled;
        Ok(false)
    }
}

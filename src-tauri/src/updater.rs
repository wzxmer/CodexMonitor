use futures_util::StreamExt;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Emitter;
use tauri::Manager;
use tokio::io::AsyncWriteExt;

const RELEASE_HOST: &str = "github.com";
const RELEASE_PATH_PREFIX: &str = "/wzxmer/CodexMonitor/releases/download/";
const INSTALLER_DIR_NAME: &str = "release-installers";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedReleaseAsset {
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseAssetDownloadProgress {
    id: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
}

#[tauri::command]
pub async fn cleanup_downloaded_release_assets(app_handle: tauri::AppHandle) -> Result<(), String> {
    cleanup_installer_dir(&app_handle).await
}

#[tauri::command]
pub async fn download_and_open_release_asset(
    app_handle: tauri::AppHandle,
    url: String,
    file_name: String,
    request_id: String,
) -> Result<DownloadedReleaseAsset, String> {
    validate_release_asset_url(&url)?;
    let safe_file_name = sanitize_release_asset_file_name(&file_name)?;
    let dir = installer_dir(&app_handle)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|error| format!("Failed to create installer directory: {error}"))?;

    let target_path = unique_target_path(&dir, &safe_file_name);
    let temp_path = target_path.with_extension(format!(
        "{}download",
        target_path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!("{value}."))
            .unwrap_or_default()
    ));

    download_to_path(&app_handle, &request_id, &url, &temp_path).await?;
    tokio::fs::rename(&temp_path, &target_path)
        .await
        .map_err(|error| {
            format!(
                "Failed to finalize installer download from '{}' to '{}': {error}",
                temp_path.to_string_lossy(),
                target_path.to_string_lossy()
            )
        })?;

    open_installer(&target_path)?;

    Ok(DownloadedReleaseAsset {
        path: target_path.to_string_lossy().into_owned(),
    })
}

fn validate_release_asset_url(url: &str) -> Result<(), String> {
    let parsed =
        reqwest::Url::parse(url).map_err(|error| format!("Invalid release asset URL: {error}"))?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some(RELEASE_HOST)
        || !parsed.path().starts_with(RELEASE_PATH_PREFIX)
    {
        return Err("Only CodexMonitor GitHub release assets can be downloaded.".to_string());
    }
    Ok(())
}

fn sanitize_release_asset_file_name(file_name: &str) -> Result<String, String> {
    let base_name = Path::new(file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Invalid release asset file name.".to_string())?;
    let sanitized: String = base_name
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => ch,
            _ => '_',
        })
        .collect();
    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        return Err("Invalid release asset file name.".to_string());
    }
    Ok(sanitized)
}

fn installer_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache directory: {error}"))?;
    dir.push(INSTALLER_DIR_NAME);
    Ok(dir)
}

async fn cleanup_installer_dir(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let dir = installer_dir(app_handle)?;
    match tokio::fs::remove_dir_all(&dir).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to clean downloaded installers: {error}")),
    }
}

fn unique_target_path(dir: &Path, file_name: &str) -> PathBuf {
    let mut candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("installer");
    let extension = path.extension().and_then(|value| value.to_str());
    for index in 1..1000 {
        let name = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };
        candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }

    dir.join(format!("{stem}-latest"))
}

fn emit_download_progress(
    app_handle: &tauri::AppHandle,
    request_id: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
) {
    let _ = app_handle.emit(
        "release-asset-download-progress",
        ReleaseAssetDownloadProgress {
            id: request_id.to_string(),
            downloaded_bytes,
            total_bytes,
        },
    );
}

async fn download_to_path(
    app_handle: &tauri::AppHandle,
    request_id: &str,
    url: &str,
    target_path: &Path,
) -> Result<(), String> {
    let response = reqwest::Client::new()
        .get(url)
        .header(reqwest::header::ACCEPT, "application/octet-stream")
        .send()
        .await
        .map_err(|error| format!("Failed to download installer: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Release asset download failed ({}).",
            response.status()
        ));
    }
    let total_bytes = response.content_length();
    emit_download_progress(app_handle, request_id, 0, total_bytes);

    let mut file = tokio::fs::File::create(target_path)
        .await
        .map_err(|error| format!("Failed to create installer file: {error}"))?;
    let mut stream = response.bytes_stream();
    let mut downloaded_bytes = 0_u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Failed to read installer download: {error}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("Failed to write installer file: {error}"))?;
        downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
        emit_download_progress(app_handle, request_id, downloaded_bytes, total_bytes);
    }
    file.flush()
        .await
        .map_err(|error| format!("Failed to flush installer file: {error}"))?;
    emit_download_progress(app_handle, request_id, downloaded_bytes, total_bytes);
    Ok(())
}

fn open_installer(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let mut command = if extension == "msi" {
            let mut command = Command::new("msiexec.exe");
            command.arg("/i").arg(path);
            command
        } else {
            Command::new(path)
        };
        command
            .spawn()
            .map_err(|error| format!("Failed to open installer: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open installer: {error}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open installer: {error}"))?;
        Ok(())
    }
}

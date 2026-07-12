use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use tokio::sync::Mutex;

use crate::shared::process_core::tokio_command;
#[cfg(target_os = "windows")]
use crate::shared::process_core::{build_cmd_c_command, resolve_windows_executable};
use crate::types::WorkspaceEntry;
use crate::utils::normalize_windows_namespace_path;

use super::helpers::resolve_workspace_root;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LineAwareLaunchStrategy {
    GotoFlag,
    PathWithLineColumn,
}

fn normalize_open_location(line: Option<u32>, column: Option<u32>) -> Option<(u32, Option<u32>)> {
    let line = line.filter(|value| *value > 0)?;
    let column = column.filter(|value| *value > 0);
    Some((line, column))
}

fn format_path_with_location(path: &str, line: u32, column: Option<u32>) -> String {
    match column {
        Some(column) => format!("{path}:{line}:{column}"),
        None => format!("{path}:{line}"),
    }
}

fn command_identifier(command: &str) -> String {
    let trimmed = command.trim();
    let file_name = Path::new(trimmed)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(trimmed);
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(file_name);
    stem.trim().to_ascii_lowercase()
}

fn command_launch_strategy(command: &str) -> Option<LineAwareLaunchStrategy> {
    let identifier = command_identifier(command);
    if identifier == "code"
        || identifier == "code-insiders"
        || identifier == "cursor"
        || identifier == "cursor-insiders"
    {
        return Some(LineAwareLaunchStrategy::GotoFlag);
    }
    if identifier == "zed" || identifier == "zed-preview" {
        return Some(LineAwareLaunchStrategy::PathWithLineColumn);
    }
    None
}

fn app_launch_strategy(app: &str) -> Option<LineAwareLaunchStrategy> {
    let normalized = normalize_app_identifier(app);
    if normalized.contains("visual studio code") || normalized.starts_with("cursor") {
        return Some(LineAwareLaunchStrategy::GotoFlag);
    }
    if normalized == "zed" || normalized.starts_with("zed ") {
        return Some(LineAwareLaunchStrategy::PathWithLineColumn);
    }
    None
}

fn app_cli_command(app: &str) -> Option<&'static str> {
    let normalized = normalize_app_identifier(app);
    if normalized.contains("visual studio code insiders") {
        return Some("code-insiders");
    }
    if normalized.contains("visual studio code") {
        return Some("code");
    }
    if normalized.starts_with("cursor") {
        return Some("cursor");
    }
    if normalized == "zed" || normalized.starts_with("zed ") {
        return Some("zed");
    }
    None
}

fn normalize_app_identifier(app: &str) -> String {
    app.trim()
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() {
                value.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn find_executable_in_path(program: &str) -> Option<PathBuf> {
    let trimmed = program.trim();
    if trimmed.is_empty() {
        return None;
    }

    let path = PathBuf::from(trimmed);
    if path.is_file() {
        return Some(path);
    }

    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        let candidate = dir.join(trimmed);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn build_launch_args(
    path: &str,
    args: &[String],
    line: Option<u32>,
    column: Option<u32>,
    strategy: Option<LineAwareLaunchStrategy>,
) -> Vec<String> {
    let mut launch_args = args.to_vec();
    if let Some((line, column)) = normalize_open_location(line, column) {
        match strategy {
            Some(LineAwareLaunchStrategy::GotoFlag) => {
                let sanitized_path = normalize_windows_namespace_path(path);
                let located_path = format_path_with_location(&sanitized_path, line, column);
                launch_args.push("--goto".to_string());
                launch_args.push(located_path);
            }
            Some(LineAwareLaunchStrategy::PathWithLineColumn) => {
                let sanitized_path = normalize_windows_namespace_path(path);
                let located_path = format_path_with_location(&sanitized_path, line, column);
                launch_args.push(located_path);
            }
            None => {
                launch_args.push(path.to_string());
            }
        }
        return launch_args;
    }
    launch_args.push(path.to_string());
    launch_args
}

pub(crate) async fn open_workspace_in_core(
    path: String,
    app: Option<String>,
    args: Vec<String>,
    command: Option<String>,
    line: Option<u32>,
    column: Option<u32>,
) -> Result<(), String> {
    fn output_snippet(bytes: &[u8]) -> Option<String> {
        const MAX_CHARS: usize = 240;
        let text = String::from_utf8_lossy(bytes).trim().replace('\n', "\\n");
        if text.is_empty() {
            return None;
        }
        let mut chars = text.chars();
        let snippet: String = chars.by_ref().take(MAX_CHARS).collect();
        if chars.next().is_some() {
            Some(format!("{snippet}..."))
        } else {
            Some(snippet)
        }
    }

    let target_label = command
        .as_ref()
        .map(|value| format!("command `{value}`"))
        .or_else(|| app.as_ref().map(|value| format!("app `{value}`")))
        .unwrap_or_else(|| "target".to_string());

    let output = if let Some(command) = command {
        let trimmed = command.trim();
        if trimmed.is_empty() {
            return Err("Missing app or command".to_string());
        }
        let launch_args =
            build_launch_args(&path, &args, line, column, command_launch_strategy(trimmed));

        #[cfg(target_os = "windows")]
        let mut cmd = {
            let resolved = resolve_windows_executable(trimmed, None);
            let resolved_path = resolved.as_deref().unwrap_or_else(|| Path::new(trimmed));
            let ext = resolved_path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase());

            if matches!(ext.as_deref(), Some("cmd") | Some("bat")) {
                let mut cmd = tokio_command("cmd");
                let command_line = build_cmd_c_command(resolved_path, &launch_args)?;
                cmd.arg("/D");
                cmd.arg("/S");
                cmd.arg("/C");
                cmd.raw_arg(command_line);
                cmd
            } else {
                let mut cmd = tokio_command(resolved_path);
                cmd.args(&launch_args);
                cmd
            }
        };

        #[cfg(not(target_os = "windows"))]
        let mut cmd = {
            let mut cmd = tokio_command(trimmed);
            cmd.args(&launch_args);
            cmd
        };

        cmd.output()
            .await
            .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
    } else if let Some(app) = app {
        let trimmed = app.trim();
        if trimmed.is_empty() {
            return Err("Missing app or command".to_string());
        }
        let app_strategy = app_launch_strategy(trimmed);

        #[cfg(target_os = "macos")]
        {
            if let (Some(strategy), Some(cli_program)) = (
                app_strategy,
                normalize_open_location(line, column)
                    .and_then(|_| app_cli_command(trimmed))
                    .and_then(find_executable_in_path),
            ) {
                let launch_args = build_launch_args(&path, &args, line, column, Some(strategy));
                let mut cmd = tokio_command(cli_program);
                cmd.args(&launch_args);
                cmd.output()
                    .await
                    .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
            } else {
                let mut cmd = tokio_command("open");
                cmd.arg("-a").arg(trimmed).arg(&path);
                if !args.is_empty() {
                    cmd.arg("--args").args(&args);
                }
                cmd.output()
                    .await
                    .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            let launch_args = build_launch_args(&path, &args, line, column, app_strategy);
            let mut cmd = tokio_command(trimmed);
            cmd.args(&launch_args);
            cmd.output()
                .await
                .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
        }
    } else {
        return Err("Missing app or command".to_string());
    };

    if output.status.success() {
        return Ok(());
    }

    let exit_detail = output
        .status
        .code()
        .map(|code| format!("exit code {code}"))
        .unwrap_or_else(|| "terminated by signal".to_string());
    let mut details = Vec::new();
    if let Some(stderr) = output_snippet(&output.stderr) {
        details.push(format!("stderr: {stderr}"));
    }
    if let Some(stdout) = output_snippet(&output.stdout) {
        details.push(format!("stdout: {stdout}"));
    }

    if details.is_empty() {
        Err(format!(
            "Failed to open app ({target_label} returned {exit_detail})."
        ))
    } else {
        Err(format!(
            "Failed to open app ({target_label} returned {exit_detail}; {}).",
            details.join("; ")
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        app_cli_command, app_launch_strategy, build_launch_args, command_launch_strategy,
        LineAwareLaunchStrategy,
    };

    #[test]
    fn matches_line_aware_command_targets() {
        assert_eq!(
            command_launch_strategy("/usr/local/bin/code"),
            Some(LineAwareLaunchStrategy::GotoFlag)
        );
        assert_eq!(
            command_launch_strategy("cursor.cmd"),
            Some(LineAwareLaunchStrategy::GotoFlag)
        );
        assert_eq!(
            command_launch_strategy("zed"),
            Some(LineAwareLaunchStrategy::PathWithLineColumn)
        );
        assert_eq!(command_launch_strategy("vim"), None);
    }

    #[test]
    fn matches_line_aware_app_targets() {
        assert_eq!(
            app_launch_strategy("Visual Studio Code"),
            Some(LineAwareLaunchStrategy::GotoFlag)
        );
        assert_eq!(
            app_launch_strategy("Cursor"),
            Some(LineAwareLaunchStrategy::GotoFlag)
        );
        assert_eq!(
            app_launch_strategy("Zed Preview"),
            Some(LineAwareLaunchStrategy::PathWithLineColumn)
        );
        assert_eq!(app_launch_strategy("Ghostty"), None);
    }

    #[test]
    fn maps_known_apps_to_cli_commands() {
        assert_eq!(app_cli_command("Visual Studio Code"), Some("code"));
        assert_eq!(
            app_cli_command("Visual Studio Code Insiders"),
            Some("code-insiders")
        );
        assert_eq!(
            app_cli_command("Visual Studio Code - Insiders"),
            Some("code-insiders")
        );
        assert_eq!(app_cli_command("Cursor"), Some("cursor"));
        assert_eq!(app_cli_command("Zed Preview"), Some("zed"));
        assert_eq!(app_cli_command("Ghostty"), None);
    }

    #[test]
    fn builds_goto_args_for_code_family_targets() {
        let args = build_launch_args(
            "/tmp/project/src/App.tsx",
            &["--reuse-window".to_string()],
            Some(33),
            Some(7),
            Some(LineAwareLaunchStrategy::GotoFlag),
        );

        assert_eq!(
            args,
            vec![
                "--reuse-window".to_string(),
                "--goto".to_string(),
                "/tmp/project/src/App.tsx:33:7".to_string(),
            ]
        );
    }

    #[test]
    fn builds_goto_args_with_windows_namespace_path_sanitized() {
        let args = build_launch_args(
            r"\\?\I:\gpt-projects\json-composer\src\App.tsx",
            &["--reuse-window".to_string()],
            Some(33),
            Some(7),
            Some(LineAwareLaunchStrategy::GotoFlag),
        );

        assert_eq!(
            args,
            vec![
                "--reuse-window".to_string(),
                "--goto".to_string(),
                r"I:\gpt-projects\json-composer\src\App.tsx:33:7".to_string(),
            ]
        );
    }

    #[test]
    fn builds_goto_args_with_lowercase_unc_namespace_path_sanitized() {
        let args = build_launch_args(
            r"\\?\unc\server\share\repo\src\App.tsx",
            &["--reuse-window".to_string()],
            Some(12),
            Some(2),
            Some(LineAwareLaunchStrategy::GotoFlag),
        );

        assert_eq!(
            args,
            vec![
                "--reuse-window".to_string(),
                "--goto".to_string(),
                r"\\server\share\repo\src\App.tsx:12:2".to_string(),
            ]
        );
    }

    #[test]
    fn preserves_namespace_path_for_unknown_targets() {
        let args = build_launch_args(
            r"\\?\I:\very\long\workspace",
            &["--foreground".to_string()],
            None,
            None,
            None,
        );

        assert_eq!(
            args,
            vec![
                "--foreground".to_string(),
                r"\\?\I:\very\long\workspace".to_string(),
            ]
        );
    }

    #[test]
    fn preserves_namespace_path_for_line_aware_targets_without_location() {
        let args = build_launch_args(
            r"\\?\I:\very\long\workspace",
            &["--reuse-window".to_string()],
            None,
            None,
            Some(LineAwareLaunchStrategy::GotoFlag),
        );

        assert_eq!(
            args,
            vec![
                "--reuse-window".to_string(),
                r"\\?\I:\very\long\workspace".to_string(),
            ]
        );
    }

    #[test]
    fn preserves_non_drive_namespace_path_for_line_aware_targets() {
        let args = build_launch_args(
            r"\\?\Volume{01234567-89ab-cdef-0123-456789abcdef}\repo\src\App.tsx",
            &[],
            Some(5),
            None,
            Some(LineAwareLaunchStrategy::GotoFlag),
        );

        assert_eq!(
            args,
            vec![
                "--goto".to_string(),
                r"\\?\Volume{01234567-89ab-cdef-0123-456789abcdef}\repo\src\App.tsx:5".to_string(),
            ]
        );
    }

    #[test]
    fn builds_line_suffixed_path_for_zed_targets() {
        let args = build_launch_args(
            "/tmp/project/src/App.tsx",
            &[],
            Some(33),
            None,
            Some(LineAwareLaunchStrategy::PathWithLineColumn),
        );

        assert_eq!(args, vec!["/tmp/project/src/App.tsx:33".to_string()]);
    }

    #[test]
    fn falls_back_to_plain_path_for_unknown_targets() {
        let args = build_launch_args(
            "/tmp/project/src/App.tsx",
            &["--foreground".to_string()],
            Some(33),
            Some(7),
            None,
        );

        assert_eq!(
            args,
            vec![
                "--foreground".to_string(),
                "/tmp/project/src/App.tsx".to_string(),
            ]
        );
    }
}

#[cfg(target_os = "macos")]
pub(crate) async fn get_open_app_icon_core<F>(
    app_name: String,
    icon_loader: F,
) -> Result<Option<String>, String>
where
    F: Fn(&str) -> Option<String> + Send + Sync + 'static,
{
    let trimmed = app_name.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let icon_loader = std::sync::Arc::new(icon_loader);
    tokio::task::spawn_blocking(move || icon_loader(&trimmed))
        .await
        .map_err(|err| err.to_string())
}

#[cfg(not(target_os = "macos"))]
pub(crate) async fn get_open_app_icon_core<F>(
    app_name: String,
    icon_loader: F,
) -> Result<Option<String>, String>
where
    F: Fn(&str) -> Option<String> + Send + Sync + 'static,
{
    let _ = app_name;
    let _ = icon_loader;
    Ok(None)
}

const MAX_WORKSPACE_FILES: usize = 20_000;

fn should_skip_workspace_dir(name: &str) -> bool {
    let normalized = name.to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        ".git" | "node_modules" | "dist" | "target" | "release-artifacts"
    ) || normalized.starts_with("target-")
        || normalized.starts_with(".codex-target")
}

fn scan_workspace_files(root: &Path, max_files: usize) -> Vec<String> {
    let mut results = Vec::new();
    let walker = WalkBuilder::new(root)
        .hidden(false)
        .follow_links(false)
        .require_git(false)
        .filter_entry(|entry| {
            entry.depth() == 0
                || !entry
                    .file_type()
                    .is_some_and(|file_type| file_type.is_dir())
                || !should_skip_workspace_dir(&entry.file_name().to_string_lossy())
        })
        .build();

    for entry in walker.flatten() {
        if !entry
            .file_type()
            .is_some_and(|file_type| file_type.is_file())
        {
            continue;
        }
        if let Ok(relative_path) = entry.path().strip_prefix(root) {
            let normalized = relative_path.to_string_lossy().replace('\\', "/");
            if !normalized.is_empty() {
                results.push(normalized);
            }
        }
        if results.len() >= max_files {
            break;
        }
    }

    results.sort();
    results
}

#[cfg(test)]
mod workspace_file_scan_tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    use super::scan_workspace_files;

    struct TestWorkspace(PathBuf);

    impl TestWorkspace {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "codex-monitor-workspace-scan-{}",
                uuid::Uuid::new_v4()
            ));
            fs::create_dir_all(&root).expect("create test workspace");
            Self(root)
        }

        fn write(&self, relative_path: &str) {
            let path = self.0.join(relative_path);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create test directory");
            }
            fs::write(path, "test").expect("write test file");
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn lists_regular_workspace_files() {
        let workspace = TestWorkspace::new();
        workspace.write("src/main.rs");
        workspace.write("README.md");

        assert_eq!(
            scan_workspace_files(workspace.path(), 20_000),
            vec!["README.md".to_string(), "src/main.rs".to_string()]
        );
    }

    #[test]
    fn skips_generated_target_directories() {
        let workspace = TestWorkspace::new();
        workspace.write("src/main.rs");
        workspace.write("target-devtest/debug/app.d");
        workspace.write(".codex-target-devtest-run/debug/app.d");

        assert_eq!(
            scan_workspace_files(workspace.path(), 20_000),
            vec!["src/main.rs".to_string()]
        );
    }

    #[test]
    fn enforces_workspace_file_limit() {
        let workspace = TestWorkspace::new();
        for index in 0..5 {
            workspace.write(&format!("src/file-{index}.rs"));
        }

        assert_eq!(scan_workspace_files(workspace.path(), 3).len(), 3);
    }
}

pub(crate) async fn list_workspace_files_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<Vec<String>, String> {
    let root = resolve_workspace_root(workspaces, workspace_id).await?;
    tokio::task::spawn_blocking(move || scan_workspace_files(&root, MAX_WORKSPACE_FILES))
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn read_workspace_file_core<F, T>(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    path: &str,
    read_file: F,
) -> Result<T, String>
where
    F: Fn(&PathBuf, &str) -> Result<T, String>,
{
    let root = resolve_workspace_root(workspaces, workspace_id).await?;
    read_file(&root, path)
}

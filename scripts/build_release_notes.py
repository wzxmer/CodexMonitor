from __future__ import annotations

import argparse
import re
from pathlib import Path
from urllib.parse import quote


CHANGE_PATTERN = re.compile(
    r"^(feat|fix|perf)(?:\([^)]*\))?:\s*(.+)$",
    re.IGNORECASE,
)


def collect_changes(lines: list[str]) -> list[str]:
    groups: dict[str, list[str]] = {"feat": [], "fix": [], "perf": []}
    for line in lines:
        match = CHANGE_PATTERN.match(line.strip())
        if not match:
            continue
        message = match.group(2).strip()
        if message:
            groups[match.group(1).lower()].append(message)

    sections = [
        ("## New Features", "feat"),
        ("## Fixes", "fix"),
        ("## Performance Improvements", "perf"),
    ]
    output: list[str] = []
    for title, key in sections:
        if not groups[key]:
            continue
        output.append(title)
        output.extend(f"- {item}" for item in groups[key])
        output.append("")
    return output


def artifact_arch(name: str) -> str | None:
    normalized = name.lower().replace("-", "_").replace(".", "_")
    if any(value in normalized for value in ("aarch64", "arm64")):
        return "arm64"
    if any(value in normalized for value in ("x86_64", "amd64", "x64")):
        return "x64"
    return None


def choose_artifact(
    artifacts: list[Path],
    suffixes: tuple[str, ...],
    arch: str | None = None,
) -> Path | None:
    candidates = [
        path
        for path in artifacts
        if any(path.name.lower().endswith(suffix) for suffix in suffixes)
        and (arch is None or artifact_arch(path.name) == arch)
    ]
    return sorted(candidates, key=lambda path: path.name.lower())[0] if candidates else None


def build_download_section(
    artifacts_dir: Path,
    repository: str,
    version: str,
) -> list[str]:
    artifacts = [path for path in artifacts_dir.rglob("*") if path.is_file()]
    recommendations = [
        ("Windows 10/11 x64", choose_artifact(artifacts, (".exe",), "x64")),
        ("macOS Apple Silicon", choose_artifact(artifacts, (".dmg",), "arm64")),
        ("macOS Intel", choose_artifact(artifacts, (".dmg",), "x64")),
        ("Linux x64", choose_artifact(artifacts, (".appimage",), "x64")),
        ("Linux ARM64", choose_artifact(artifacts, (".appimage",), "arm64")),
    ]

    output = ["## Recommended downloads / 推荐下载", ""]
    for label, artifact in recommendations:
        if artifact is None:
            continue
        encoded_name = quote(artifact.name)
        url = (
            f"https://github.com/{repository}/releases/download/"
            f"v{version}/{encoded_name}"
        )
        output.append(f"- **{label}**: [Download {artifact.name}]({url})")
    output.extend(
        [
            "",
            "> 其他安装格式、校验文件和 Codex CLI 离线包仍保留在页面底部 Assets 中。",
            "",
        ]
    )
    return output


def build_release_notes(
    artifacts_dir: Path,
    repository: str,
    version: str,
    commit_lines: list[str] | None = None,
) -> str:
    output = build_download_section(artifacts_dir, repository, version)
    changes = collect_changes(commit_lines or [])
    output.extend(changes or ["- No user-facing changes."])
    return "\n".join(output).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts-dir", type=Path, required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--commits-file", type=Path)
    args = parser.parse_args()

    commit_lines = None
    if args.commits_file and args.commits_file.exists():
        commit_lines = args.commits_file.read_text(encoding="utf-8").splitlines()
    notes = build_release_notes(
        args.artifacts_dir,
        args.repository,
        args.version,
        commit_lines,
    )
    args.output.write_text(notes, encoding="utf-8")


if __name__ == "__main__":
    main()

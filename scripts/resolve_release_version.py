from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


INTERNAL_VERSION_PATTERN = re.compile(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)")
TAG_VERSION_PATTERN = re.compile(r"v(\d+)\.(\d+)\.(\d+)")


def parse_internal_version(version: str) -> tuple[int, int, int]:
    if not INTERNAL_VERSION_PATTERN.fullmatch(version):
        raise ValueError(f"Expected SemVer core without leading zeroes, got {version}")
    return tuple(int(part) for part in version.split("."))  # type: ignore[return-value]


def parse_release_tags(tags: list[str]) -> list[tuple[int, int, int]]:
    parsed: list[tuple[int, int, int]] = []
    for tag in tags:
        match = TAG_VERSION_PATTERN.fullmatch(tag.strip())
        if match:
            parsed.append(tuple(int(part) for part in match.groups()))
    return parsed


def resolve_release_version(
    current: str,
    tags: list[str],
) -> tuple[str, str]:
    version = parse_internal_version(current)
    released = parse_release_tags(tags)
    if released:
        latest = max(released)
        if version <= latest:
            version = (latest[0], latest[1], latest[2] + 1)
    internal = ".".join(str(part) for part in version)
    public = internal
    return internal, public


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()

    current = str(json.loads(args.config.read_text(encoding="utf-8"))["version"])
    tags = subprocess.check_output(
        ["git", "tag", "--list", "v[0-9]*.[0-9]*.[0-9]*"],
        text=True,
    ).splitlines()
    internal, public = resolve_release_version(current, tags)
    output = f"version={internal}\nrelease_label_version={public}\n"
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as handle:
            handle.write(output)
    else:
        print(output, end="")


if __name__ == "__main__":
    main()

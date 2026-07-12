import tempfile
import unittest
from pathlib import Path

from build_release_notes import build_release_notes


class BuildReleaseNotesTests(unittest.TestCase):
    def test_builds_direct_recommended_download_links(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifacts = Path(directory)
            names = [
                "Codex Monitor_1.2.3_x64-setup.exe",
                "CodexMonitor_1.2.3_aarch64.dmg",
                "CodexMonitor_1.2.3_x86_64.dmg",
                "Codex.Monitor_1.2.3_amd64.AppImage",
                "Codex.Monitor_1.2.3_aarch64.AppImage",
            ]
            for name in names:
                (artifacts / name).write_bytes(b"artifact")

            notes = build_release_notes(
                artifacts,
                "wzxmer/CodexMonitor",
                "1.2.3",
                ["feat: add provider switching", "fix(ui): restore window dragging"],
            )

            self.assertIn("## Recommended downloads / 推荐下载", notes)
            self.assertIn("Windows 10/11 x64", notes)
            self.assertIn("macOS Apple Silicon", notes)
            self.assertIn("macOS Intel", notes)
            self.assertIn("Linux x64", notes)
            self.assertIn("Linux ARM64", notes)
            self.assertIn(
                "https://github.com/wzxmer/CodexMonitor/releases/download/v1.2.3/",
                notes,
            )
            self.assertIn("Codex%20Monitor_1.2.3_x64-setup.exe", notes)
            self.assertIn("## New Features", notes)
            self.assertIn("## Fixes", notes)

    def test_omits_platforms_without_a_matching_installer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            artifacts = Path(directory)
            (artifacts / "Codex.Monitor_1.2.3_x64_en-US.msi").write_bytes(b"artifact")

            notes = build_release_notes(
                artifacts,
                "wzxmer/CodexMonitor",
                "1.2.3",
            )

            self.assertNotIn("Windows 10/11 x64", notes)
            self.assertIn("- No user-facing changes.", notes)


if __name__ == "__main__":
    unittest.main()

// @ts-nocheck -- Node types are intentionally not enabled for the frontend project.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows WiX migration gate", () => {
  const template = readFileSync(
    new URL("../../../../src-tauri/windows/wix/main.wxs", import.meta.url),
    "utf8",
  );

  it("escapes only the Handlebars boundary in the NSIS uninstall key", () => {
    expect(template).toContain(
      'Key="Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\\\{{product_name}}"',
    );
    expect(template).not.toContain(
      'Key="Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{{product_name}}"',
    );
    expect(template).not.toContain(
      'Key="Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall',
    );
  });

  it("blocks cross-family installation without invoking the legacy uninstaller", () => {
    expect(template).toContain("Installed OR NOT NSISUNINSTALLER");
    expect(template).not.toContain("UninstallPreviousNsis");
  });
});

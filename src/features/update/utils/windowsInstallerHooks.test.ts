// @ts-nocheck -- Node types are intentionally not enabled for the frontend project.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows NSIS migration gate", () => {
  const hooks = readFileSync(
    new URL("../../../../src-tauri/windows/nsis/installer-hooks.nsh", import.meta.url),
    "utf8",
  );
  const windowsConfig = JSON.parse(
    readFileSync(
      new URL("../../../../src-tauri/tauri.windows.conf.json", import.meta.url),
      "utf8",
    ),
  );

  it("registers the supported Tauri installer hook file", () => {
    expect(windowsConfig.bundle.windows.nsis.installerHooks).toBe(
      "windows/nsis/installer-hooks.nsh",
    );
    expect(hooks).toContain("!macro NSIS_HOOK_PREINSTALL");
  });

  it("checks MSI registrations before the Tauri migration page and install section", () => {
    expect(hooks).toContain(
      "!define MUI_CUSTOMFUNCTION_GUIINIT CMBlockMsiBeforePages",
    );
    expect(hooks).toContain("Function CMBlockMsiBeforePages");
    expect(hooks).not.toContain("Function .onGUIInit");
    expect(hooks.match(/!insertmacro CM_BLOCK_IF_MSI_REGISTERED/g)).toHaveLength(2);
    expect(hooks).toContain(
      "!insertmacro CM_SCAN_MSI_REGISTRATION HKLM 64 cm_hklm_64",
    );
    expect(hooks).toContain(
      "!insertmacro CM_SCAN_MSI_REGISTRATION HKLM 32 cm_hklm_32",
    );
    expect(hooks).toContain(
      "!insertmacro CM_SCAN_MSI_REGISTRATION HKCU 64 cm_hkcu_64",
    );
    expect(hooks).toContain(
      "!insertmacro CM_SCAN_MSI_REGISTRATION HKCU 32 cm_hkcu_32",
    );
    expect(hooks).toContain('ReadRegStr $R2 ${ROOT} "${CM_UNINSTALL_ROOT}\\$R1" "DisplayName"');
    expect(hooks).toContain(
      'ReadRegDWORD $R3 ${ROOT} "${CM_UNINSTALL_ROOT}\\$R1" "WindowsInstaller"',
    );
    expect(hooks).toContain("IntCmp $R3 1");
  });

  it("contains no migration, registry mutation, or file deletion commands", () => {
    expect(hooks).not.toMatch(/\bUninstallString\b/);
    expect(hooks).not.toMatch(
      /^\s*(?:Exec|ExecWait|ExecShell|Delete|DeleteReg\w*|WriteReg\w*|RMDir|Rename|CopyFiles)\b/m,
    );
  });
});

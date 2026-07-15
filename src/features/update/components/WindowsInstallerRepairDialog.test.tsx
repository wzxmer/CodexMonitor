// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import {
  applyWindowsInstallerRepair,
  previewWindowsInstallerRepair,
  rollbackWindowsInstallerRepair,
} from "@services/tauri";
import { WindowsInstallerRepairDialog } from "./WindowsInstallerRepairDialog";

vi.mock("@services/tauri", () => ({
  previewWindowsInstallerRepair: vi.fn(),
  applyWindowsInstallerRepair: vi.fn(),
  rollbackWindowsInstallerRepair: vi.fn(),
}));

const previewMock = vi.mocked(previewWindowsInstallerRepair);
const applyMock = vi.mocked(applyWindowsInstallerRepair);
const rollbackMock = vi.mocked(rollbackWindowsInstallerRepair);

describe("WindowsInstallerRepairDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.mockResolvedValue({
      status: "repairable",
      fingerprint: "opaque-preview",
      currentVersion: "0.7.91",
      records: [
        {
          family: "msi",
          hive: "localMachine",
          view: "registry64",
          displayVersion: "0.7.91",
          installLocation: "C:\\Users\\Secret\\Codex Monitor",
        },
        {
          family: "nsis",
          hive: "currentUser",
          view: "registry64",
          displayVersion: "0.7.79",
          installLocation: "C:\\Users\\Secret\\Codex Monitor",
        },
      ],
      blockers: [],
      plannedActions: ["quarantine", "remove registration"],
    });
    applyMock.mockResolvedValue({
      status: "completed",
      transactionId: "opaque-transaction",
      fingerprint: "opaque-post",
    });
    rollbackMock.mockResolvedValue({
      status: "rolledBack",
      fingerprint: "opaque-preview",
    });
  });

  afterEach(() => cleanup());

  it("shows only safe summaries and requires rechecking after repair", async () => {
    const onClose = vi.fn();
    const onRecheck = vi.fn();
    render(
      <I18nProvider preference="en">
        <WindowsInstallerRepairDialog
          open
          onClose={onClose}
          onRecheck={onRecheck}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("MSI · Version 0.7.91")).toBeTruthy();
    expect(screen.getByText("EXE (NSIS) · Version 0.7.79")).toBeTruthy();
    expect(screen.queryByText(/Users\\Secret/)).toBeNull();
    const applyButton = screen.getByRole("button", {
      name: "Start safe repair",
    });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(applyButton);

    expect(await screen.findByText(/passed the local post-check/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Check for updates again" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRecheck).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
  });
});

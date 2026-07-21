/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainHeader } from "./MainHeader";
import type { BranchInfo, OpenAppTarget, WorkspaceInfo } from "@/types";

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "ThreadFleet",
  path: "D:/Project/ThreadFleet",
  connected: true,
  settings: {
    sidebarCollapsed: false,
    groupId: null,
    sortOrder: 0,
  },
};

const branches: BranchInfo[] = [];
const openTargets: OpenAppTarget[] = [];

function renderHeader(overrides: Partial<Parameters<typeof MainHeader>[0]> = {}) {
  return render(
    <MainHeader
      workspace={workspace}
      openTargets={openTargets}
      openAppIconById={{}}
      selectedOpenAppId=""
      onSelectOpenAppId={vi.fn()}
      branchName="main"
      branches={branches}
      onCheckoutBranch={vi.fn()}
      onCreateBranch={vi.fn()}
      onToggleTerminal={vi.fn()}
      isTerminalOpen={false}
      showTerminalButton={false}
      showWorkspaceTools={false}
      {...overrides}
    />,
  );
}

describe("MainHeader", () => {
  it("uses the active thread title above the workspace name", () => {
    renderHeader({ titleOverride: "Fix Windows colors" });

    expect(screen.getByText("Fix Windows colors")).toBeTruthy();
    expect(screen.queryByText("ThreadFleet")).toBeNull();
  });

  it("falls back to the workspace name when no thread title exists", () => {
    renderHeader({ titleOverride: "   " });

    expect(screen.getByText("ThreadFleet")).toBeTruthy();
  });
});

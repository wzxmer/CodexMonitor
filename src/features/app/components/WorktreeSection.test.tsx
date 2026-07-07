// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { WorktreeSection } from "./WorktreeSection";

const worktree: WorkspaceInfo = {
  id: "wt-1",
  name: "Worktree One",
  path: "/tmp/worktree",
  connected: true,
  kind: "worktree",
  worktree: { branch: "feature/test" },
  settings: { sidebarCollapsed: false },
};

describe("WorktreeSection", () => {
  it("renders pinned rows even when unpinned rows are empty", () => {
    render(
      <WorktreeSection
        worktrees={[worktree]}
        deletingWorktreeIds={new Set()}
        threadsByWorkspace={{ [worktree.id]: [] }}
        threadStatusById={{}}
        threadListLoadingByWorkspace={{ [worktree.id]: false }}
        threadListPagingByWorkspace={{ [worktree.id]: false }}
        threadListCursorByWorkspace={{ [worktree.id]: null }}
        expandedWorkspaces={new Set()}
        activeWorkspaceId={null}
        activeThreadId={null}
        getThreadRows={() => ({
          pinnedRows: [
            {
              thread: { id: "thread-pinned", name: "Pinned only", updatedAt: 1 },
              depth: 0,
            },
          ],
          unpinnedRows: [],
          totalRoots: 0,
          hasMoreRoots: false,
        })}
        getThreadTime={() => null}
        isThreadPinned={() => true}
        getPinTimestamp={() => 1}
        pinnedThreadsVersion={1}
        onConnectWorkspace={vi.fn()}
        onToggleWorkspaceCollapse={vi.fn()}
        onSelectThread={vi.fn()}
        onShowThreadMenu={vi.fn()}
        onShowWorktreeMenu={vi.fn()}
        onToggleExpanded={vi.fn()}
        onLoadOlderThreads={vi.fn()}
      />,
    );

    expect(screen.getByText("Pinned only")).toBeTruthy();
  });

  it("does not render older thread controls for worktrees", () => {
    render(
      <WorktreeSection
        worktrees={[worktree]}
        deletingWorktreeIds={new Set()}
        threadsByWorkspace={{ [worktree.id]: [] }}
        threadStatusById={{}}
        threadListLoadingByWorkspace={{ [worktree.id]: false }}
        threadListPagingByWorkspace={{ [worktree.id]: false }}
        threadListCursorByWorkspace={{ [worktree.id]: "cursor" }}
        expandedWorkspaces={new Set()}
        activeWorkspaceId={null}
        activeThreadId={null}
        getThreadRows={() => ({
          pinnedRows: [],
          unpinnedRows: [],
          totalRoots: 0,
          hasMoreRoots: false,
        })}
        getThreadTime={() => null}
        isThreadPinned={() => false}
        getPinTimestamp={() => null}
        pinnedThreadsVersion={0}
        onConnectWorkspace={vi.fn()}
        onToggleWorkspaceCollapse={vi.fn()}
        onSelectThread={vi.fn()}
        onShowThreadMenu={vi.fn()}
        onShowWorktreeMenu={vi.fn()}
        onToggleExpanded={vi.fn()}
        onLoadOlderThreads={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "搜索更早会话..." }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Load older..." }),
    ).toBeNull();
  });
});

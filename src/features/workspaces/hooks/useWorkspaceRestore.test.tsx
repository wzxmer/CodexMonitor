/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import { useWorkspaceRestore } from "./useWorkspaceRestore";

const workspace: WorkspaceInfo = {
  id: "workspace-a",
  name: "Workspace A",
  path: "C:/workspace-a",
  connected: true,
  kind: "main",
  parentId: null,
  worktree: null,
  settings: {
    sidebarCollapsed: false,
  },
};

describe("useWorkspaceRestore", () => {
  it("waits for the initial thread list before becoming ready", async () => {
    let resolveList: (() => void) | null = null;
    const listThreadsForWorkspaces = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveList = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        workspaces: [workspace],
        hasLoaded: true,
        connectWorkspace: vi.fn().mockResolvedValue(undefined),
        listThreadsForWorkspaces,
      }),
    );

    expect(result.current).toBe(false);
    await waitFor(() => expect(listThreadsForWorkspaces).toHaveBeenCalledTimes(1));
    await act(async () => resolveList?.());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("becomes ready when there are no workspaces to restore", async () => {
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        workspaces: [],
        hasLoaded: true,
        connectWorkspace: vi.fn().mockResolvedValue(undefined),
        listThreadsForWorkspaces: vi.fn().mockResolvedValue(undefined),
      }),
    );

    await waitFor(() => expect(result.current).toBe(true));
  });
});

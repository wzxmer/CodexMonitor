// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import { useComposerController } from "./useComposerController";

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function makeOptions(overrides: Partial<Parameters<typeof useComposerController>[0]> = {}) {
  return {
    activeThreadId: null,
    activeTurnId: null,
    activeWorkspaceId: workspace.id,
    activeWorkspace: workspace,
    isProcessing: false,
    isReviewing: false,
    steerEnabled: true,
    followUpMessageBehavior: "queue" as const,
    appsEnabled: true,
    connectWorkspace: vi.fn().mockResolvedValue(undefined),
    startThreadForWorkspace: vi.fn().mockResolvedValue("thread-1"),
    sendUserMessage: vi.fn().mockResolvedValue({ status: "sent" }),
    sendUserMessageToThread: vi.fn().mockResolvedValue({ status: "sent" }),
    startFork: vi.fn().mockResolvedValue(undefined),
    startReview: vi.fn().mockResolvedValue(undefined),
    startResume: vi.fn().mockResolvedValue(undefined),
    startCompact: vi.fn().mockResolvedValue(undefined),
    startApps: vi.fn().mockResolvedValue(undefined),
    startMcp: vi.fn().mockResolvedValue(undefined),
    startFast: vi.fn().mockResolvedValue(undefined),
    startStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useComposerController", () => {
  it("keeps a workspace draft before the first thread exists", () => {
    const options = makeOptions();
    const { result, rerender } = renderHook((props) => useComposerController(props), {
      initialProps: options,
    });

    act(() => {
      result.current.handleDraftChange("no project draft");
    });

    expect(result.current.activeDraft).toBe("no project draft");

    rerender({ ...options, activeThreadId: "thread-1" });
    expect(result.current.activeDraft).toBe("");

    rerender({ ...options, activeThreadId: null });
    expect(result.current.activeDraft).toBe("no project draft");
  });
});

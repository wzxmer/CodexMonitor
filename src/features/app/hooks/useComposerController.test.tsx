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

  it("restores a failed first-send image transfer without crossing workspace drafts", async () => {
    let rejectConnection: ((error: Error) => void) | null = null;
    const connectWorkspace = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectConnection = reject;
        }),
    );
    const disconnectedWorkspace = { ...workspace, connected: false };
    const options = makeOptions({
      activeWorkspace: disconnectedWorkspace,
      connectWorkspace,
    });
    const { result, rerender } = renderHook(
      (props) => useComposerController(props),
      { initialProps: options },
    );

    act(() => {
      result.current.attachImages(["/tmp/original.md"]);
    });
    expect(result.current.activeImages).toEqual(["/tmp/original.md"]);

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.handleSend(
        "First send",
        result.current.activeImages,
      );
      await Promise.resolve();
    });
    expect(result.current.activeImages).toEqual([]);
    expect(options.sendUserMessage).not.toHaveBeenCalled();

    act(() => {
      result.current.attachImages(["/tmp/new.md"]);
    });
    const otherWorkspace = {
      ...workspace,
      id: "workspace-2",
      name: "Other",
      connected: true,
    };
    rerender({
      ...options,
      activeWorkspaceId: otherWorkspace.id,
      activeWorkspace: otherWorkspace,
    });
    act(() => {
      result.current.attachImages(["/tmp/other-workspace.md"]);
    });

    await act(async () => {
      rejectConnection?.(new Error("offline"));
      await expect(sendPromise).rejects.toThrow("offline");
    });
    expect(result.current.activeImages).toEqual(["/tmp/other-workspace.md"]);

    rerender(options);
    expect(result.current.activeImages).toEqual([
      "/tmp/new.md",
      "/tmp/original.md",
    ]);
  });

  it("does not revive transferred images cleared while connection is pending", async () => {
    let rejectConnection: ((error: Error) => void) | null = null;
    const connectWorkspace = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectConnection = reject;
        }),
    );
    const options = makeOptions({
      activeWorkspace: { ...workspace, connected: false },
      connectWorkspace,
    });
    const { result } = renderHook((props) => useComposerController(props), {
      initialProps: options,
    });

    act(() => {
      result.current.attachImages(["/tmp/original.md"]);
    });
    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.handleSend(
        "First send",
        result.current.activeImages,
      );
      await Promise.resolve();
    });
    expect(result.current.activeImages).toEqual([]);

    act(() => {
      result.current.clearActiveImages();
    });
    await act(async () => {
      rejectConnection?.(new Error("offline"));
      await expect(sendPromise).rejects.toThrow("offline");
    });

    expect(result.current.activeImages).toEqual([]);
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("restores first-send images when sending rejects before a status", async () => {
    let rejectSend: ((error: Error) => void) | null = null;
    const sendUserMessage = vi.fn(
      () =>
        new Promise<{ status: "sent" }>((_, reject) => {
          rejectSend = reject;
        }),
    );
    const options = makeOptions({ sendUserMessage });
    const { result } = renderHook((props) => useComposerController(props), {
      initialProps: options,
    });

    act(() => {
      result.current.attachImages(["/tmp/original.md"]);
    });
    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.handleSend(
        "First send",
        result.current.activeImages,
      );
      await Promise.resolve();
    });

    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(result.current.activeImages).toEqual([]);

    await act(async () => {
      rejectSend?.(new Error("send failed"));
      await expect(sendPromise).rejects.toThrow("send failed");
    });

    expect(result.current.activeImages).toEqual(["/tmp/original.md"]);
  });
});

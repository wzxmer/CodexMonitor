// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useNewAgentDraft } from "./useNewAgentDraft";

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace",
  path: "/tmp/ws-1",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useNewAgentDraft", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears starting state after successful send when no thread activates", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() =>
      useNewAgentDraft({
        activeWorkspace: workspace,
        activeWorkspaceId: workspace.id,
        activeThreadId: null,
      }),
    );

    await act(async () => {
      await result.current.runWithDraftStart(async () => {
        await Promise.resolve();
      });
    });

    expect(result.current.startingDraftThreadWorkspaceId).toBe(workspace.id);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.startingDraftThreadWorkspaceId).toBeNull();
  });

  it("exposes a temporary user message preview while a draft thread is starting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const { result } = renderHook(() =>
      useNewAgentDraft({
        activeWorkspace: workspace,
        activeWorkspaceId: workspace.id,
        activeThreadId: null,
      }),
    );

    await act(async () => {
      await result.current.runWithDraftStart(
        async () => {
          await Promise.resolve();
        },
        { text: "first draft message", images: ["image-a"] },
      );
    });

    expect(result.current.startingDraftMessageByWorkspace[workspace.id]).toEqual({
      text: "first draft message",
      images: ["image-a"],
      createdAt: 1_700_000_000_000,
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.startingDraftMessageByWorkspace[workspace.id]).toBeUndefined();
  });

  it("serializes draft-start sends and does not drop concurrent submits", async () => {
    let resolveRunner!: () => void;
    let callCount = 0;
    const runner = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<void>((resolve) => {
          resolveRunner = () => resolve();
        });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() =>
      useNewAgentDraft({
        activeWorkspace: workspace,
        activeWorkspaceId: workspace.id,
        activeThreadId: null,
      }),
    );

    let firstPromise: Promise<void> | null = null;
    let secondPromise: Promise<void> | null = null;
    act(() => {
      firstPromise = result.current.runWithDraftStart(runner);
      secondPromise = result.current.runWithDraftStart(runner);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(runner).toHaveBeenCalledTimes(1);
    if (!firstPromise || !secondPromise) {
      throw new Error("Expected concurrent draft-start promises to be initialized.");
    }
    resolveRunner();
    await act(async () => {
      await firstPromise;
      await secondPromise;
    });
    expect(runner).toHaveBeenCalledTimes(2);
  });
});

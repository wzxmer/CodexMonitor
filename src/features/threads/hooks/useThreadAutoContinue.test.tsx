// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import { useThreadAutoContinue } from "./useThreadAutoContinue";

const workspace = { id: "ws-1" } as WorkspaceInfo;

function setup() {
  const sendContinuation = vi.fn().mockResolvedValue({ status: "sent" });
  const processing = new Set<string>();
  const sendContinuationRef = { current: sendContinuation };
  const hook = renderHook(() =>
    useThreadAutoContinue({
      getWorkspace: (workspaceId) => (workspaceId === workspace.id ? workspace : null),
      isThreadProcessing: (threadId) => processing.has(threadId),
      sendContinuationRef,
    }),
  );
  return { hook, processing, sendContinuation };
}

describe("useThreadAutoContinue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults new conversations to disabled", () => {
    const { hook } = setup();
    expect(hook.result.current.statusByThread["thread-1"]).toBeUndefined();
    expect(hook.result.current.statusByThread["thread-2"]).toBeUndefined();
  });

  it("starts a separate continuation after a terminal turn error", async () => {
    const { hook, sendContinuation } = setup();
    act(() => {
      hook.result.current.setEnabled("thread-1", true);
      hook.result.current.onTurnError("ws-1", "thread-1", "turn-1", {
        willRetry: false,
      });
    });

    expect(hook.result.current.statusByThread["thread-1"]).toMatchObject({
      enabled: true,
      phase: "waiting",
      attempt: 1,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(sendContinuation).toHaveBeenCalledTimes(1);
    expect(sendContinuation).toHaveBeenCalledWith(
      workspace,
      "thread-1",
      expect.stringContaining("Continue the unfinished task"),
    );
  });

  it("waits for Codex native retries to finish", async () => {
    const { hook, sendContinuation } = setup();
    act(() => {
      hook.result.current.setEnabled("thread-1", true);
      hook.result.current.onTurnError("ws-1", "thread-1", "turn-1", {
        willRetry: true,
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(sendContinuation).not.toHaveBeenCalled();
  });

  it("does not reconnect after a manual stop", async () => {
    const { hook, sendContinuation } = setup();
    act(() => {
      hook.result.current.setEnabled("thread-1", true);
      hook.result.current.markManualStop("thread-1", "turn-1");
      hook.result.current.onTurnError("ws-1", "thread-1", "turn-1", {
        willRetry: false,
      });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(sendContinuation).not.toHaveBeenCalled();
  });

  it("backs off independently when a continuation cannot start", async () => {
    const { hook, sendContinuation } = setup();
    sendContinuation
      .mockResolvedValueOnce({ status: "blocked" })
      .mockResolvedValueOnce({ status: "sent" });
    act(() => {
      hook.result.current.setEnabled("thread-1", true);
      hook.result.current.onTurnError("ws-1", "thread-1", "turn-1", {
        willRetry: false,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(hook.result.current.statusByThread["thread-1"]).toMatchObject({
      phase: "waiting",
      attempt: 2,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(sendContinuation).toHaveBeenCalledTimes(2);
  });
});

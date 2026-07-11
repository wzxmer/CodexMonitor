// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { steerTurn } from "@services/tauri";
import { useSubagentCheckpointSync } from "./useSubagentCheckpointSync";

vi.mock("@services/tauri", () => ({
  steerTurn: vi.fn(),
}));

const steerTurnMock = vi.mocked(steerTurn);

function setup(mode: "finalOnly" | "checkpoints" | "continuous" = "checkpoints") {
  const threadParentByIdRef = { current: { child: "parent" } };
  const threadStatusByIdRef = {
    current: {
      parent: {
        isProcessing: true,
        isReviewing: false,
        hasUnread: false,
        processingStartedAt: null,
        lastDurationMs: null,
      },
    },
  };
  const activeTurnIdByThreadRef: { current: Record<string, string | null> } = {
    current: { parent: "parent-turn" },
  };
  const onStatusChange = vi.fn();
  const hook = renderHook(() =>
    useSubagentCheckpointSync({
      mode,
      threadParentByIdRef,
      threadStatusByIdRef,
      activeTurnIdByThreadRef,
      getChildName: () => "worker",
      onStatusChange,
    }),
  );
  return { hook, threadStatusByIdRef, activeTurnIdByThreadRef, onStatusChange };
}

describe("useSubagentCheckpointSync", () => {
  beforeEach(() => {
    steerTurnMock.mockReset();
    steerTurnMock.mockResolvedValue({});
  });

  it("steers a child progress checkpoint into an active parent", async () => {
    const { hook } = setup();
    act(() => {
      hook.result.current.onTurnStarted("ws", "child", "child-turn");
      hook.result.current.onAgentMessageCompleted({
        workspaceId: "ws",
        threadId: "child",
        itemId: "item-1",
        text: "Found the owning module.",
      });
    });
    await waitFor(() => expect(steerTurnMock).toHaveBeenCalledTimes(1));
    expect(steerTurnMock).toHaveBeenCalledWith(
      "ws",
      "parent",
      "parent-turn",
      expect.stringContaining("Found the owning module."),
    );
  });

  it("queues while parent is idle and flushes after its next turn starts", async () => {
    const { hook, threadStatusByIdRef, activeTurnIdByThreadRef, onStatusChange } = setup();
    threadStatusByIdRef.current.parent.isProcessing = false;
    activeTurnIdByThreadRef.current.parent = null;
    act(() => {
      hook.result.current.onAgentMessageCompleted({
        workspaceId: "ws",
        threadId: "child",
        itemId: "item-1",
        text: "Checkpoint",
      });
    });
    expect(steerTurnMock).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith("ws", "parent", "pending", 0);

    threadStatusByIdRef.current.parent.isProcessing = true;
    activeTurnIdByThreadRef.current.parent = "parent-turn-2";
    act(() => hook.result.current.onTurnStarted("ws", "parent", "parent-turn-2"));
    await waitFor(() => expect(steerTurnMock).toHaveBeenCalledTimes(1));
    expect(onStatusChange).toHaveBeenCalledWith("ws", "parent", "delivered", 1);
  });

  it("keeps stale steer checkpoints for a later parent turn", async () => {
    steerTurnMock.mockRejectedValueOnce(new Error("no active turn"));
    const { hook, activeTurnIdByThreadRef } = setup();
    act(() => {
      hook.result.current.onAgentMessageCompleted({
        workspaceId: "ws",
        threadId: "child",
        itemId: "item-1",
        text: "Checkpoint",
      });
    });
    await waitFor(() => expect(steerTurnMock).toHaveBeenCalledTimes(1));

    steerTurnMock.mockResolvedValue({});
    activeTurnIdByThreadRef.current.parent = "parent-turn-2";
    act(() => hook.result.current.onTurnStarted("ws", "parent", "parent-turn-2"));
    await waitFor(() => expect(steerTurnMock).toHaveBeenCalledTimes(2));
  });

  it("final-only mode waits for child completion", async () => {
    const { hook } = setup("finalOnly");
    act(() => {
      hook.result.current.onTurnStarted("ws", "child", "child-turn");
      hook.result.current.onAgentMessageCompleted({
        workspaceId: "ws",
        threadId: "child",
        itemId: "item-1",
        text: "Final answer",
      });
    });
    expect(steerTurnMock).not.toHaveBeenCalled();
    act(() => hook.result.current.onTurnCompleted("ws", "child", "child-turn"));
    await waitFor(() => expect(steerTurnMock).toHaveBeenCalledTimes(1));
    expect(steerTurnMock.mock.calls[0]?.[3]).toContain('priority="final"');
  });

  it("does not lock delivery when switching to final-only with pending progress", async () => {
    const threadParentByIdRef = { current: { child: "parent" } };
    const threadStatusByIdRef = {
      current: {
        parent: {
          isProcessing: false,
          isReviewing: false,
          hasUnread: false,
          processingStartedAt: null,
          lastDurationMs: null,
        },
      },
    };
    const activeTurnIdByThreadRef: { current: Record<string, string | null> } = {
      current: { parent: null },
    };
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "finalOnly" | "checkpoints" | "continuous" }) =>
        useSubagentCheckpointSync({
          mode,
          threadParentByIdRef,
          threadStatusByIdRef,
          activeTurnIdByThreadRef,
        }),
      { initialProps: { mode: "checkpoints" as "finalOnly" | "checkpoints" | "continuous" } },
    );

    act(() => {
      result.current.onTurnStarted("ws", "child", "child-turn");
      result.current.onAgentMessageCompleted({
        workspaceId: "ws",
        threadId: "child",
        itemId: "item-1",
        text: "Progress",
      });
    });
    rerender({ mode: "finalOnly" });
    threadStatusByIdRef.current.parent.isProcessing = true;
    activeTurnIdByThreadRef.current.parent = "parent-turn";
    act(() => result.current.onTurnStarted("ws", "parent", "parent-turn"));
    expect(steerTurnMock).not.toHaveBeenCalled();

    act(() => result.current.onTurnCompleted("ws", "child", "child-turn"));
    await waitFor(() => expect(steerTurnMock).toHaveBeenCalledTimes(1));
  });
});

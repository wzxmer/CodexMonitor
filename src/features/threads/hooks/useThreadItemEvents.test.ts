// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCollabActualBinding,
  buildConversationItem,
} from "@utils/threadItems";
import { useThreadItemEvents } from "./useThreadItemEvents";

vi.mock("@utils/threadItems", () => ({
  buildConversationItem: vi.fn(),
  buildCollabActualBinding: vi.fn(),
}));

type ItemPayload = Record<string, unknown>;

type SetupOverrides = {
  activeThreadId?: string | null;
  getCustomName?: (workspaceId: string, threadId: string) => string | undefined;
  onUserMessageCreated?: (workspaceId: string, threadId: string, text: string) => void;
  onReviewExited?: (workspaceId: string, threadId: string) => void;
  onExecutionBindingObserved?: ReturnType<typeof vi.fn>;
};

const makeOptions = (overrides: SetupOverrides = {}) => {
  const dispatch = vi.fn();
  const markProcessing = vi.fn();
  const markReviewing = vi.fn();
  const safeMessageActivity = vi.fn();
  const recordThreadActivity = vi.fn();
  const applyCollabThreadLinks = vi.fn();
  const getCustomName =
    overrides.getCustomName ?? vi.fn(() => undefined);

  const { result } = renderHook(() =>
    useThreadItemEvents({
      activeThreadId: overrides.activeThreadId ?? null,
      dispatch,
      getCustomName,
      markProcessing,
      markReviewing,
      safeMessageActivity,
      recordThreadActivity,
      applyCollabThreadLinks,
      onUserMessageCreated: overrides.onUserMessageCreated,
      onReviewExited: overrides.onReviewExited,
      onExecutionBindingObserved: overrides.onExecutionBindingObserved,
    }),
  );

  return {
    result,
    dispatch,
    markProcessing,
    markReviewing,
    safeMessageActivity,
    recordThreadActivity,
    applyCollabThreadLinks,
    getCustomName,
  };
};

describe("useThreadItemEvents", () => {
  const convertedItem = {
    id: "item-1",
    kind: "message",
    role: "assistant",
    text: "Hello",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildConversationItem).mockReturnValue(convertedItem);
  });

  it("dispatches item updates and marks review mode on item start", () => {
    const getCustomName = vi.fn(() => "Custom");
    const { result, dispatch, markProcessing, markReviewing, safeMessageActivity, applyCollabThreadLinks } =
      makeOptions({ getCustomName });
    const item: ItemPayload = { type: "enteredReviewMode", id: "item-1" };

    act(() => {
      result.current.onItemStarted("ws-1", "thread-1", item);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(markProcessing).toHaveBeenCalledWith("thread-1", true);
    expect(markReviewing).toHaveBeenCalledWith("thread-1", true);
    expect(applyCollabThreadLinks).toHaveBeenCalledWith("ws-1", "thread-1", item);
    expect(dispatch).toHaveBeenCalledWith({
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: convertedItem,
      hasCustomName: true,
    });
    expect(safeMessageActivity).toHaveBeenCalled();
  });

  it("marks review/processing false when review mode exits", () => {
    const { result, dispatch, markProcessing, markReviewing, safeMessageActivity } = makeOptions();
    const item: ItemPayload = { type: "exitedReviewMode", id: "review-1" };

    act(() => {
      result.current.onItemCompleted("ws-1", "thread-1", item);
    });

    expect(markReviewing).toHaveBeenCalledWith("thread-1", false);
    expect(markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: convertedItem,
      hasCustomName: false,
    });
    expect(safeMessageActivity).toHaveBeenCalled();
  });

  it("only triggers onReviewExited on completed exit events", () => {
    const onReviewExited = vi.fn();
    const { result } = makeOptions({ onReviewExited });
    const item: ItemPayload = { type: "exitedReviewMode", id: "review-1" };

    act(() => {
      result.current.onItemStarted("ws-1", "thread-1", item);
    });
    expect(onReviewExited).not.toHaveBeenCalled();

    act(() => {
      result.current.onItemCompleted("ws-1", "thread-1", item);
    });
    expect(onReviewExited).toHaveBeenCalledTimes(1);
    expect(onReviewExited).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("adds lifecycle status for context compaction items", () => {
    const { result } = makeOptions();
    const item: ItemPayload = { type: "contextCompaction", id: "compact-1" };

    act(() => {
      result.current.onItemStarted("ws-1", "thread-1", item);
    });
    expect(buildConversationItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "contextCompaction",
        id: "compact-1",
        status: "inProgress",
      }),
    );

    act(() => {
      result.current.onItemCompleted("ws-1", "thread-1", item);
    });
    expect(buildConversationItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "contextCompaction",
        id: "compact-1",
        status: "completed",
      }),
    );
  });

  it("adds lifecycle status for web search items", () => {
    const { result } = makeOptions();
    const item: ItemPayload = { type: "webSearch", id: "search-1", query: "codex monitor" };

    act(() => {
      result.current.onItemStarted("ws-1", "thread-1", item);
    });
    expect(buildConversationItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "webSearch",
        id: "search-1",
        status: "inProgress",
      }),
    );

    act(() => {
      result.current.onItemCompleted("ws-1", "thread-1", item);
    });
    expect(buildConversationItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "webSearch",
        id: "search-1",
        status: "completed",
      }),
    );
  });

  it("observes collab bindings on started and completed without prompt data", () => {
    const onExecutionBindingObserved = vi.fn();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1234);
    vi.mocked(buildConversationItem).mockReturnValue({
      id: "call-1",
      kind: "tool",
      toolType: "collabToolCall",
      title: "Collab: spawn_agent",
      detail: "",
      output: "sensitive prompt",
      collabSender: { threadId: "parent-1" },
      collabReceivers: [
        { threadId: "child-1" },
        { threadId: "child-1" },
      ],
    });
    vi.mocked(buildCollabActualBinding)
      .mockReturnValueOnce({ modelId: null, reasoningEffort: "low" })
      .mockReturnValueOnce({ modelId: "gpt-5.6-luna", reasoningEffort: "low" });
    const { result } = makeOptions({ onExecutionBindingObserved });
    const item: ItemPayload = { type: "collabAgentToolCall", id: "call-1" };

    act(() => {
      result.current.onItemStarted("ws-1", "event-thread", item);
      result.current.onItemCompleted("ws-1", "event-thread", item);
    });

    expect(onExecutionBindingObserved).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      parentThreadId: "parent-1",
      collabToolCallId: "call-1",
      senderThreadId: "parent-1",
      receiverThreadIds: ["child-1"],
      actual: { modelId: null, reasoningEffort: "low" },
      observedAtMs: 1234,
    });
    expect(onExecutionBindingObserved).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-1",
      parentThreadId: "parent-1",
      collabToolCallId: "call-1",
      senderThreadId: "parent-1",
      receiverThreadIds: ["child-1"],
      actual: { modelId: "gpt-5.6-luna", reasoningEffort: "low" },
      observedAtMs: 1234,
    });
    expect(onExecutionBindingObserved.mock.calls[0][0]).not.toHaveProperty("prompt");
    nowSpy.mockRestore();
  });

  it("notifies when a user message is created", () => {
    const onUserMessageCreated = vi.fn();
    vi.mocked(buildConversationItem).mockReturnValue({
      id: "item-2",
      kind: "message",
      role: "user",
      text: "Hello from user",
    });
    const { result } = makeOptions({ onUserMessageCreated });
    const item: ItemPayload = { type: "userMessage", id: "item-2" };

    act(() => {
      result.current.onItemCompleted("ws-1", "thread-1", item);
    });

    expect(onUserMessageCreated).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "Hello from user",
    );
  });

  it("marks processing and appends agent deltas", () => {
    const { result, dispatch, markProcessing } = makeOptions();

    act(() => {
      result.current.onAgentMessageDelta({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        delta: "Hello",
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(markProcessing).toHaveBeenCalledWith("thread-1", true);
    expect(dispatch).toHaveBeenCalledWith({
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "assistant-1",
      delta: "Hello",
      hasCustomName: false,
    });
  });

  it("completes agent messages and updates thread activity", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1234);
    const { result, dispatch, recordThreadActivity, safeMessageActivity } = makeOptions({
      activeThreadId: "thread-2",
    });

    act(() => {
      result.current.onAgentMessageCompleted({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        text: "Done",
      });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "assistant-1",
      text: "Done",
      hasCustomName: false,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadTimestamp",
      workspaceId: "ws-1",
      threadId: "thread-1",
      timestamp: 1234,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setLastAgentMessage",
      threadId: "thread-1",
      text: "Done",
      timestamp: 1234,
    });
    expect(recordThreadActivity).toHaveBeenCalledWith("ws-1", "thread-1", 1234);
    expect(safeMessageActivity).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "markUnread",
      threadId: "thread-1",
      hasUnread: true,
    });

    nowSpy.mockRestore();
  });

  it("dispatches reasoning summary boundaries", () => {
    const { result, dispatch } = makeOptions();

    act(() => {
      result.current.onReasoningSummaryBoundary("ws-1", "thread-1", "reasoning-1");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "appendReasoningSummaryBoundary",
      threadId: "thread-1",
      itemId: "reasoning-1",
    });
  });

  it("dispatches plan deltas", () => {
    const { result, dispatch } = makeOptions();

    act(() => {
      result.current.onPlanDelta("ws-1", "thread-1", "plan-1", "- Step 1");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "appendPlanDelta",
      threadId: "thread-1",
      itemId: "plan-1",
      delta: "- Step 1",
    });
  });
});

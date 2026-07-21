import { describe, expect, it } from "vitest";
import type { ConversationItem } from "@/types";
import { buildResumeHydrationPlan } from "./threadActionHelpers";

describe("buildResumeHydrationPlan", () => {
  it("clears local items when replaceLocal receives empty server history", () => {
    const localItems: ConversationItem[] = [
      { id: "stale-user", kind: "message", role: "user", text: "retry" },
    ];

    const plan = buildResumeHydrationPlan({
      getCustomName: () => undefined,
      localActiveTurnId: null,
      localItems,
      localStatus: undefined,
      replaceLocal: true,
      thread: { id: "thread-1", turns: [] },
      threadId: "thread-1",
      workspaceId: "ws-1",
    });

    expect(plan.mergedItems).toEqual([]);
  });

  it("reports the latest matching terminal turn for execution reconciliation", () => {
    const plan = buildResumeHydrationPlan({
      getCustomName: () => undefined,
      localActiveTurnId: "turn-2",
      localItems: [],
      localStatus: { isProcessing: true },
      replaceLocal: false,
      thread: {
        id: "thread-1",
        turns: [
          { id: "turn-1", status: "completed", items: [] },
          { id: "turn-2", status: "done", items: [] },
        ],
      },
      threadId: "thread-1",
      workspaceId: "ws-1",
    });

    expect(plan.terminalTurnId).toBe("turn-2");
    expect(plan.terminalTurnStatus).toBe("completed");
  });

  it("does not report a terminal turn when the latest turn is active", () => {
    const plan = buildResumeHydrationPlan({
      getCustomName: () => undefined,
      localActiveTurnId: "turn-local",
      localItems: [],
      localStatus: { isProcessing: true },
      replaceLocal: false,
      thread: {
        id: "thread-1",
        turns: [
          { id: "turn-1", status: "completed", items: [] },
          { id: "turn-2", status: "inProgress", items: [] },
        ],
      },
      threadId: "thread-1",
      workspaceId: "ws-1",
    });

    expect(plan.terminalTurnId).toBeNull();
    expect(plan.terminalTurnStatus).toBeNull();
  });

  it("does not fall back to an older terminal turn past an unknown latest turn", () => {
    const plan = buildResumeHydrationPlan({
      getCustomName: () => undefined,
      localActiveTurnId: "turn-local",
      localItems: [],
      localStatus: { isProcessing: true },
      replaceLocal: false,
      thread: {
        id: "thread-1",
        turns: [
          { id: "turn-1", status: "completed", items: [] },
          { id: "turn-2", status: "unknown_state", items: [] },
        ],
      },
      threadId: "thread-1",
      workspaceId: "ws-1",
    });

    expect(plan.terminalTurnId).toBeNull();
    expect(plan.terminalTurnStatus).toBeNull();
  });
});

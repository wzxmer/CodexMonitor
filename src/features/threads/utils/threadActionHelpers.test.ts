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
});

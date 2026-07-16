import { describe, expect, it } from "vitest";
import type { ConversationItem } from "@/types";
import { getActivePlanStream } from "./planStream";

describe("getActivePlanStream", () => {
  it("returns the latest in-progress plan tool output", () => {
    const items = [
      {
        id: "plan-1",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "",
        status: "completed",
        output: "old plan",
      },
      {
        id: "plan-2",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "Generating plan...",
        status: "in_progress",
        output: "- Inspect source\n- Run tests",
      },
    ] satisfies ConversationItem[];

    expect(getActivePlanStream(items)).toBe("- Inspect source\n- Run tests");
  });

  it("ignores completed or empty plan items", () => {
    const items = [
      {
        id: "plan-1",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "",
        status: "completed",
        output: "old plan",
      },
      {
        id: "plan-2",
        kind: "tool",
        toolType: "plan",
        title: "Plan",
        detail: "Generating plan...",
        status: "in_progress",
        output: "   ",
      },
    ] satisfies ConversationItem[];

    expect(getActivePlanStream(items)).toBeNull();
  });
});

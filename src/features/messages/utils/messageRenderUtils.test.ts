import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  buildToolSummary,
  countApplyPatchLineChanges,
  countDiffLineChanges,
  getConversationItemSearchText,
  scrollKeyForItems,
  statusToneFromText,
  stripAnsiControlCodes,
} from "./messageRenderUtils";

function makeToolItem(
  overrides: Partial<Extract<ConversationItem, { kind: "tool" }>>,
): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id: "tool-1",
    kind: "tool",
    toolType: "webSearch",
    title: "Web search",
    detail: "codex monitor",
    status: "completed",
    output: "",
    ...overrides,
  };
}

describe("messageRenderUtils", () => {
  it("renders web search as searching while in progress", () => {
    const summary = buildToolSummary(makeToolItem({ status: "inProgress" }), "");
    expect(summary.label).toBe("searching");
    expect(summary.value).toBe("codex monitor");
  });

  it("renders mcp search calls as searching while in progress", () => {
    const summary = buildToolSummary(
      makeToolItem({
        toolType: "mcpToolCall",
        title: "Tool: web / search_query",
        detail: '{\n  "query": "codex monitor"\n}',
        status: "inProgress",
      }),
      "",
    );
    expect(summary.label).toBe("searching");
    expect(summary.value).toBe("codex monitor");
  });

  it("classifies camelCase inProgress as processing", () => {
    expect(statusToneFromText("inProgress")).toBe("processing");
  });

  it("renders collab tool calls with nickname and role", () => {
    const summary = buildToolSummary(
      makeToolItem({
        toolType: "collabToolCall",
        title: "Collab: wait",
        detail: "From thread-parent → thread-child",
        status: "completed",
        output: "Robie [explorer]: completed",
        collabReceivers: [
          {
            threadId: "thread-child",
            nickname: "Robie",
            role: "explorer",
          },
        ],
      }),
      "",
    );
    expect(summary.label).toBe("waited for");
    expect(summary.value).toBe("Robie [explorer]");
    expect(summary.output).toContain("Robie [explorer]: completed");
  });

  it("strips ansi control codes from terminal output", () => {
    const value = "\u001b[31;1mError:\u001b[0m failed\n\u001b[36;1mLine |\u001b[0m";
    expect(stripAnsiControlCodes(value)).toBe("Error: failed\nLine |");
  });

  it("counts changed diff lines without counting file headers", () => {
    expect(
      countDiffLineChanges(
        [
          "diff --git a/src/a.ts b/src/a.ts",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "@@ -1,3 +1,4 @@",
          " unchanged",
          "-old",
          "+new",
          "+added",
        ].join("\n"),
      ),
    ).toEqual({ additions: 2, deletions: 1 });
  });

  it("counts apply_patch blocks without counting patch metadata", () => {
    expect(
      countApplyPatchLineChanges(
        [
          "await tools.apply_patch(`*** Begin Patch",
          "*** Update File: src/a.ts",
          "@@",
          "-old",
          "+new",
          "+added",
          "*** End Patch`);",
        ].join("\n"),
      ),
    ).toEqual({ additions: 2, deletions: 1 });
  });

  it("collects searchable text from tool changes", () => {
    const text = getConversationItemSearchText(
      makeToolItem({
        title: "Tool: apply_patch",
        detail: "editing files",
        changes: [
          {
            path: "src/App.tsx",
            kind: "update",
            diff: "+Added search keyword",
          },
        ],
      }),
    );

    expect(text).toContain("Tool: apply_patch");
    expect(text).toContain("src/App.tsx");
    expect(text).toContain("Added search keyword");
  });

  it("includes checkpoint content in search and scroll identity", () => {
    const item: ConversationItem = {
      id: "checkpoint-1",
      kind: "subagentCheckpoint",
      checkpoints: [
        {
          checkpointId: "child:item:final",
          childThreadId: "child-thread",
          childName: "worker",
          priority: "final",
          sequence: 2,
          text: "Final checkpoint result",
        },
      ],
    };

    expect(getConversationItemSearchText(item)).toContain("Final checkpoint result");
    expect(getConversationItemSearchText(item)).toContain("worker");
    expect(scrollKeyForItems([item])).toBe("checkpoint-1-1-2-23");
  });
});

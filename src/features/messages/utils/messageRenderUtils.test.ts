import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  buildToolSummary,
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
});

import { describe, expect, it } from "vitest";

import type { ThreadTokenUsage } from "@/types";
import {
  getContextUsedPercent,
  isContextCompactionInProgress,
} from "./contextUsage";

function usage(
  totalTokens: number,
  lastTokens: number,
  modelContextWindow: number | null,
): ThreadTokenUsage {
  const empty = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  };
  return {
    total: {
      ...empty,
      totalTokens,
    },
    last: {
      ...empty,
      totalTokens: lastTokens,
    },
    modelContextWindow,
  };
}

describe("contextUsage", () => {
  it("returns null when model context window is missing", () => {
    expect(getContextUsedPercent(null)).toBeNull();
    expect(getContextUsedPercent(usage(100, 0, null))).toBeNull();
    expect(getContextUsedPercent(usage(100, 0, 0))).toBeNull();
  });

  it("uses only the current-cycle token snapshot as context usage", () => {
    expect(getContextUsedPercent(usage(320, 0, 1_000))).toBe(0);
    expect(getContextUsedPercent(usage(100, 450, 1_000))).toBe(45);
  });

  it("clamps context usage percent to the 0-100 range", () => {
    expect(getContextUsedPercent(usage(0, 1_200, 1_000))).toBe(100);
    expect(getContextUsedPercent(usage(-20, -10, 1_000))).toBe(0);
  });

  it("detects only an in-progress context compaction item", () => {
    const item = {
      id: "compact-1",
      kind: "tool" as const,
      toolType: "contextCompaction",
      title: "Compacting context",
      detail: "",
      status: "inProgress",
    };

    expect(isContextCompactionInProgress([item])).toBe(true);
    expect(
      isContextCompactionInProgress([{ ...item, status: "completed" }]),
    ).toBe(false);
    expect(
      isContextCompactionInProgress([{ ...item, toolType: "commandExecution" }]),
    ).toBe(false);
  });
});

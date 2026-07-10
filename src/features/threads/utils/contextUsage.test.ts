import { describe, expect, it } from "vitest";

import type { ThreadTokenUsage } from "@/types";
import {
  getCompactionCyclePercent,
  getContextUsedPercent,
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

  it("uses the larger total or last token snapshot as context usage", () => {
    expect(getContextUsedPercent(usage(320, 0, 1_000))).toBe(32);
    expect(getContextUsedPercent(usage(100, 450, 1_000))).toBe(45);
  });

  it("clamps context usage percent to the 0-100 range", () => {
    expect(getContextUsedPercent(usage(1_200, 0, 1_000))).toBe(100);
    expect(getContextUsedPercent(usage(-20, -10, 1_000))).toBe(0);
  });

  it("uses last token usage for compaction cycle progress", () => {
    expect(getCompactionCyclePercent(usage(1_000, 50, 1_000), 200)).toBe(25);
  });

  it("does not use total token usage for compaction cycle progress", () => {
    expect(getCompactionCyclePercent(usage(1_000, 50, 1_000), 200)).toBe(25);
  });

  it("does not fall back to the model context window when the compaction threshold is missing", () => {
    expect(getCompactionCyclePercent(usage(0, 20, 1_000))).toBeNull();
  });

  it("clamps compaction cycle progress to the 0-100 range", () => {
    expect(getCompactionCyclePercent(usage(0, 400, 1_000), 200)).toBe(100);
    expect(getCompactionCyclePercent(usage(0, -20, 1_000), 200)).toBe(0);
    expect(getCompactionCyclePercent(usage(0, 20, 1_000), 0)).toBeNull();
  });
});

// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  MAX_DEBUG_PAYLOAD_CHARS,
  MAX_DEBUG_TOTAL_CHARS,
  summarizeDebugPayload,
  useDebugLog,
} from "./useDebugLog";

describe("useDebugLog", () => {
  it("summarizes nested thread responses without retaining full item arrays", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: `item-${index}`,
      text: "x".repeat(2_000),
    }));
    const payload = {
      result: {
        thread: {
          turns: [{ items }],
        },
      },
    };

    const summarized = summarizeDebugPayload(payload);
    const serialized = JSON.stringify(summarized);

    expect(serialized.length).toBeLessThanOrEqual(MAX_DEBUG_PAYLOAD_CHARS);
    expect(serialized).toContain('"count":100');
    expect(serialized).not.toContain("item-99");
    expect(serialized).not.toContain("x".repeat(2_000));
  });

  it("handles circular payloads", () => {
    const payload: Record<string, unknown> = { id: "thread-1" };
    payload.self = payload;

    expect(JSON.stringify(summarizeDebugPayload(payload))).toContain("[circular]");
  });

  it("enforces a total retained character budget", () => {
    const { result } = renderHook(() => useDebugLog());

    act(() => {
      result.current.setDebugOpen(true);
    });
    for (let index = 0; index < 300; index += 1) {
      act(() => {
        result.current.addDebugEntry({
          id: `entry-${index}`,
          timestamp: index,
          source: "server",
          label: "thread/read response",
          payload: { text: "x".repeat(10_000), index },
        });
      });
    }
    act(() => {
      result.current.addDebugEntry({
        id: "id".repeat(100_000),
        timestamp: 301,
        source: "server",
        label: "label".repeat(100_000),
        payload: "payload",
      });
    });

    const retainedChars = result.current.debugEntries.reduce(
      (total, entry) => total + JSON.stringify(entry).length,
      0,
    );
    expect(result.current.debugEntries.length).toBeLessThanOrEqual(200);
    expect(retainedChars).toBeLessThanOrEqual(MAX_DEBUG_TOTAL_CHARS);
  });
});

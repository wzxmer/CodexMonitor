import { describe, expect, it } from "vitest";
import {
  buildThreadSummaryFromThread,
  getThreadDisplayTitle,
} from "./threadSummary";

describe("threadSummary", () => {
  it("prefers thread_name over preview", () => {
    expect(
      getThreadDisplayTitle({
        thread_name: "Official summary title",
        preview: "Raw user prompt",
      }),
    ).toBe("Official summary title");
  });

  it("prefers threadName over preview", () => {
    expect(
      getThreadDisplayTitle({
        threadName: "Camel title",
        preview: "Raw user prompt",
      }),
    ).toBe("Camel title");
  });

  it("keeps local custom names above Codex titles", () => {
    const summary = buildThreadSummaryFromThread({
      workspaceId: "ws-1",
      thread: {
        id: "thread-1",
        thread_name: "Official summary title",
        preview: "Raw user prompt",
      },
      fallbackIndex: 0,
      getCustomName: () => "Local custom name",
    });

    expect(summary?.name).toBe("Local custom name");
  });

  it("falls back to preview when no formal title exists", () => {
    expect(
      getThreadDisplayTitle({
        preview: "Raw user prompt",
      }),
    ).toBe("Raw user prompt");
  });
});

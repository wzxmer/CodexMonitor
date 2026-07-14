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

  it("uses the assigned subagent task name before the prompt preview", () => {
    expect(
      getThreadDisplayTitle({
        preview: "Inspect every routing branch and report evidence",
        source: {
          subagent: {
            thread_spawn: {
              agent_path: "/root/thread_routing-audit",
            },
          },
        },
      }),
    ).toBe("thread routing audit");
  });
});

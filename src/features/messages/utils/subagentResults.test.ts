import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { buildSubagentResultSummaries } from "./subagentResults";

const checkpoints: ConversationItem = {
  id: "checkpoint-1",
  kind: "subagentCheckpoint",
  checkpoints: [
    {
      checkpointId: "child:progress",
      childThreadId: "child-1",
      childName: "检查许可证",
      priority: "normal",
      sequence: 1,
      text: "正在读取 package.json",
    },
    {
      checkpointId: "child:final",
      childThreadId: "child-1",
      childName: "检查许可证",
      priority: "final",
      sequence: 2,
      text: "未定义 license 字段",
    },
  ],
};

describe("buildSubagentResultSummaries", () => {
  it("uses the loaded child assistant result and preserves checkpoint metadata", () => {
    const results = buildSubagentResultSummaries({
      parentItems: [checkpoints],
      threads: [
        {
          id: "child-1",
          name: "检查许可证",
          updatedAt: 42,
          subagentCheckpointStatus: "delivered",
        },
      ],
      itemsByThread: {
        "child-1": [
          {
            id: "child-message",
            kind: "message",
            role: "assistant",
            text: "package.json 中没有定义 license 字段。\n\n请在发布前确认许可证策略。",
          },
        ],
      },
      threadStatusById: {},
      fallbackTitle: "子会话",
    });

    expect(results).toEqual([
      expect.objectContaining({
        threadId: "child-1",
        title: "检查许可证",
        status: "completed",
        checkpointCount: 2,
        content: "package.json 中没有定义 license 字段。\n\n请在发布前确认许可证策略。",
      }),
    ]);
    expect(results[0].summary).toBe("package.json 中没有定义 license 字段。 请在发布前确认许可证策略。");
  });

  it("falls back to the latest checkpoint when child history is not loaded", () => {
    const results = buildSubagentResultSummaries({
      parentItems: [checkpoints],
      threads: [],
      itemsByThread: {},
      threadStatusById: {},
      fallbackTitle: "子会话",
    });

    expect(results[0]).toEqual(
      expect.objectContaining({
        title: "检查许可证",
        status: "completed",
        content: "未定义 license 字段",
      }),
    );
  });

  it("keeps a progress-only checkpoint pending after processing state is gone", () => {
    const results = buildSubagentResultSummaries({
      parentItems: [
        {
          ...checkpoints,
          checkpoints: [checkpoints.checkpoints[0]],
        },
      ],
      threads: [],
      itemsByThread: {},
      threadStatusById: {},
      fallbackTitle: "子会话",
    });

    expect(results[0].status).toBe("pending");
  });
});

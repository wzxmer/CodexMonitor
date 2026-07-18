import type { ConversationItem } from "../../../types";
import { describe, expect, it } from "vitest";
import { dedupeSubagentCheckpointItems } from "./subagentCheckpointDisplay";

describe("subagent checkpoint display", () => {
  it("keeps one final row when history contains equivalent progress and final results", () => {
    const items: ConversationItem[] = [
      {
        id: "progress-item",
        kind: "subagentCheckpoint",
        checkpoints: [{ checkpointId: "child:item-1:progress", childThreadId: "child", priority: "normal", sequence: 1, text: "Result\ntext" }],
      },
      {
        id: "final-item",
        kind: "subagentCheckpoint",
        checkpoints: [{ checkpointId: "child:item-1:final", childThreadId: "child", priority: "final", sequence: 2, text: " Result text " }],
      },
    ];

    const deduped = dedupeSubagentCheckpointItems(items);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({ id: "progress-item", checkpoints: [{ priority: "final", sequence: 2 }] });
  });

  it("keeps a changed final result while removing the progress row", () => {
    const items: ConversationItem[] = [
      {
        id: "progress-item",
        kind: "subagentCheckpoint",
        checkpoints: [{ checkpointId: "child:item-1:progress", childThreadId: "child", priority: "normal", sequence: 1, text: "Progress" }],
      },
      {
        id: "final-item",
        kind: "subagentCheckpoint",
        checkpoints: [{ checkpointId: "child:item-1:final", childThreadId: "child", priority: "final", sequence: 2, text: "Final" }],
      },
    ];

    const deduped = dedupeSubagentCheckpointItems(items);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({ id: "progress-item", checkpoints: [{ priority: "final", text: "Final" }] });
  });
});

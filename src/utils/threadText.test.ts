import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../types";
import { buildThreadTranscript } from "./threadText";

describe("buildThreadTranscript", () => {
  it("preserves checkpoints with system identity", () => {
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
          text: "Final result",
        },
      ],
    };

    const transcript = buildThreadTranscript([item]);
    expect(transcript).toBe("Subagent final result (worker, #2):\nFinal result");
    expect(transcript).not.toContain("User:");
  });
});

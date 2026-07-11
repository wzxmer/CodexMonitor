import { describe, expect, it } from "vitest";
import {
  SUBAGENT_CHECKPOINT_MAX_TEXT_LENGTH,
  buildCheckpointInjection,
  checkpointThrottleMs,
  createSubagentCheckpoint,
  shouldCreateCheckpoint,
} from "./subagentCheckpoints";

describe("subagent checkpoints", () => {
  it("applies mode throttles and preserves final checkpoints", () => {
    expect(checkpointThrottleMs("continuous")).toBe(3_000);
    expect(checkpointThrottleMs("checkpoints")).toBe(10_000);
    expect(shouldCreateCheckpoint({ mode: "finalOnly", kind: "progress", progressCount: 0 })).toBe(false);
    expect(shouldCreateCheckpoint({ mode: "finalOnly", kind: "final", progressCount: 99 })).toBe(true);
    expect(shouldCreateCheckpoint({ mode: "checkpoints", kind: "progress", progressCount: 8 })).toBe(false);
  });

  it("creates stable checkpoints and rejects loops", () => {
    expect(
      createSubagentCheckpoint({
        workspaceId: "ws",
        parentThreadId: "same",
        childThreadId: "same",
        childTurnId: "turn",
        sourceItemId: "item",
        kind: "progress",
        text: "hello",
        sequence: 1,
      }),
    ).toBeNull();
    const checkpoint = createSubagentCheckpoint({
      workspaceId: "ws",
      parentThreadId: "parent",
      childThreadId: "child",
      childTurnId: "turn",
      sourceItemId: "item",
      kind: "progress",
      text: " hello ",
      sequence: 1,
      createdAt: 1,
    });
    expect(checkpoint).toMatchObject({ id: "child:item:progress", text: "hello" });
  });

  it("truncates text and escapes injection attributes", () => {
    const checkpoint = createSubagentCheckpoint({
      workspaceId: "ws",
      parentThreadId: "parent",
      childThreadId: 'child&"',
      childTurnId: null,
      sourceItemId: "item",
      kind: "final",
      text: "x".repeat(SUBAGENT_CHECKPOINT_MAX_TEXT_LENGTH + 100),
      sequence: 2,
    });
    expect(checkpoint?.text).toHaveLength(SUBAGENT_CHECKPOINT_MAX_TEXT_LENGTH);
    expect(buildCheckpointInjection(checkpoint!, 'worker<1>')).toContain(
      'child_name="worker&lt;1&gt;"',
    );
    expect(buildCheckpointInjection(checkpoint!)).toContain('priority="final"');
  });
});

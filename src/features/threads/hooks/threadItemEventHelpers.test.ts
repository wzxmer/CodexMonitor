import { describe, expect, it, vi } from "vitest";
import { buildConversationItem } from "@utils/threadItems";
import { handleConvertedItemEffects } from "./threadItemEventHelpers";

describe("handleConvertedItemEffects", () => {
  it("does not report checkpoint injections as user-authored messages", () => {
    const onUserMessageCreated = vi.fn();
    const converted = buildConversationItem({
      type: "userMessage",
      id: "checkpoint-live-effect",
      content: [
        {
          type: "text",
          text:
            '<subagent_checkpoint checkpoint_id="child:item:progress" child_thread_id="child" priority="normal" sequence="1">\nProgress\n</subagent_checkpoint>',
        },
      ],
    });

    handleConvertedItemEffects({
      converted,
      workspaceId: "workspace",
      threadId: "parent",
      onUserMessageCreated,
    });

    expect(converted?.kind).toBe("subagentCheckpoint");
    expect(onUserMessageCreated).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { SubagentCheckpointRow } from "./MessageRows";

describe("SubagentCheckpointRow", () => {
  it("does not mount long markdown until the row is expanded", () => {
    const text = `${"Long result ".repeat(50)}TAIL_MARKER`;
    const item: Extract<ConversationItem, { kind: "subagentCheckpoint" }> = {
      id: "checkpoint-1",
      kind: "subagentCheckpoint",
      checkpoints: [
        {
          checkpointId: "child:item-1:final",
          childThreadId: "child",
          childName: "worker",
          priority: "final",
          sequence: 1,
          text,
        },
      ],
    };

    render(<SubagentCheckpointRow item={item} />);
    expect(screen.queryByText("TAIL_MARKER")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "显示" }));
    expect(screen.getByText(/TAIL_MARKER/)).toBeTruthy();
  });
});

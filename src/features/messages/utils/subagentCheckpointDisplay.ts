import type { ConversationItem } from "../../../types";

type SubagentCheckpointItem = Extract<ConversationItem, { kind: "subagentCheckpoint" }>;

function resultKey(checkpoint: SubagentCheckpointItem["checkpoints"][number]) {
  const sourceId = checkpoint.checkpointId.replace(/:(?:progress|final)$/, "");
  return `${checkpoint.childThreadId}:${sourceId}`;
}

function textEquivalent(left: string, right: string) {
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

/** Collapse historical progress/final envelopes for the same child result. */
export function dedupeSubagentCheckpointItems(items: ConversationItem[]) {
  const result: ConversationItem[] = [];
  const seen = new Map<string, { itemIndex: number; checkpointIndex: number }>();

  for (const item of items) {
    if (item.kind !== "subagentCheckpoint") {
      result.push(item);
      continue;
    }

    const itemIndex = result.length;
    const checkpoints: SubagentCheckpointItem["checkpoints"] = [];
    for (const checkpoint of item.checkpoints) {
      const key = resultKey(checkpoint);
      const previousLocation = seen.get(key);
      if (!previousLocation) {
        seen.set(key, { itemIndex, checkpointIndex: checkpoints.length });
        checkpoints.push(checkpoint);
        continue;
      }

      const previousItem = result[previousLocation.itemIndex];
      if (previousItem?.kind !== "subagentCheckpoint") {
        continue;
      }
      const previous = previousItem.checkpoints[previousLocation.checkpointIndex];
      if (
        checkpoint.priority === "final" &&
        (previous.priority !== "final" || !textEquivalent(previous.text, checkpoint.text))
      ) {
        previousItem.checkpoints[previousLocation.checkpointIndex] = checkpoint;
      } else if (checkpoint.priority === "normal" && previous.priority === "normal") {
        previousItem.checkpoints[previousLocation.checkpointIndex] = checkpoint;
      }
    }

    if (checkpoints.length > 0) {
      result.push({ ...item, checkpoints });
    }
  }

  return result;
}

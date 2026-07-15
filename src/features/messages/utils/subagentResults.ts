import type { ConversationItem, ThreadSummary } from "../../../types";

export type SubagentResultStatus = "running" | "completed" | "failed" | "pending";

export type SubagentResultSummary = {
  threadId: string;
  title: string;
  status: SubagentResultStatus;
  summary: string;
  content: string;
  checkpointCount: number;
  updatedAt: number;
};

type ThreadActivityState = {
  isProcessing?: boolean;
};

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getLatestChildContent(items: ConversationItem[] | undefined) {
  const assistant = [...(items ?? [])]
    .reverse()
    .find((item): item is Extract<ConversationItem, { kind: "message" }> =>
      item.kind === "message" && item.role === "assistant" && item.text.trim().length > 0,
    );
  return assistant?.text.trim() ?? "";
}

function getCheckpointContent(
  checkpoints: Extract<ConversationItem, { kind: "subagentCheckpoint" }>["checkpoints"],
) {
  return [...checkpoints]
    .sort((left, right) => right.sequence - left.sequence)
    .find((checkpoint) => checkpoint.text.trim().length > 0)?.text.trim() ?? "";
}

function getStatus(
  threadId: string,
  checkpoints: Extract<ConversationItem, { kind: "subagentCheckpoint" }>["checkpoints"],
  hasAssistantResult: boolean,
  thread?: ThreadSummary,
  activity?: ThreadActivityState,
): SubagentResultStatus {
  if (activity?.isProcessing) {
    return "running";
  }
  if (thread?.subagentCheckpointStatus === "failed") {
    return "failed";
  }
  if (
    thread?.subagentCheckpointStatus === "delivered" ||
    checkpoints.some((checkpoint) => checkpoint.priority === "final") ||
    hasAssistantResult
  ) {
    return "completed";
  }
  return threadId ? "pending" : "failed";
}

export function buildSubagentResultSummaries({
  parentItems,
  threads,
  itemsByThread,
  threadStatusById,
  fallbackTitle,
}: {
  parentItems: ConversationItem[];
  threads: ThreadSummary[];
  itemsByThread: Record<string, ConversationItem[]>;
  threadStatusById: Record<string, ThreadActivityState>;
  fallbackTitle: string;
}): SubagentResultSummary[] {
  const byChildId = new Map<
    string,
    Extract<ConversationItem, { kind: "subagentCheckpoint" }>["checkpoints"]
  >();

  parentItems.forEach((item) => {
    if (item.kind !== "subagentCheckpoint") {
      return;
    }
    item.checkpoints.forEach((checkpoint) => {
      const current = byChildId.get(checkpoint.childThreadId) ?? [];
      current.push(checkpoint);
      byChildId.set(checkpoint.childThreadId, current);
    });
  });

  return [...byChildId.entries()].map(([threadId, checkpoints]) => {
    const thread = threads.find((candidate) => candidate.id === threadId);
    const childContent = getLatestChildContent(itemsByThread[threadId]);
    const checkpointContent = getCheckpointContent(checkpoints);
    const content = childContent || checkpointContent;
    const title =
      thread?.name.trim() ||
      [...checkpoints].sort((left, right) => right.sequence - left.sequence)[0]?.childName?.trim() ||
      fallbackTitle;
    const updatedAt = Math.max(
      thread?.updatedAt ?? 0,
      ...checkpoints.map((checkpoint) => checkpoint.sequence),
    );

    return {
      threadId,
      title,
      status: getStatus(
        threadId,
        checkpoints,
        Boolean(childContent),
        thread,
        threadStatusById[threadId],
      ),
      summary: compactText(content).slice(0, 220),
      content,
      checkpointCount: checkpoints.length,
      updatedAt,
    };
  });
}

import type { ConversationItem, ThreadTokenUsage } from "@/types";

function getContextUsedRawPercent(contextUsage?: ThreadTokenUsage | null) {
  const contextWindow = contextUsage?.modelContextWindow ?? null;
  if (!contextWindow || contextWindow <= 0) {
    return null;
  }

  const usedTokens = contextUsage?.last.totalTokens ?? 0;
  return Math.min(Math.max((usedTokens / contextWindow) * 100, 0), 100);
}

export function getContextUsedPercent(contextUsage?: ThreadTokenUsage | null) {
  const usedPercent = getContextUsedRawPercent(contextUsage);
  return usedPercent === null ? null : Math.round(usedPercent);
}

export function isContextCompactionInProgress(items: ConversationItem[]) {
  return items.some(
    (item) =>
      item.kind === "tool" &&
      item.toolType === "contextCompaction" &&
      item.status === "inProgress",
  );
}

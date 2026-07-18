import type { ConversationItem, ThreadTokenUsage } from "@/types";

function getContextUsedRawPercent(contextUsage?: ThreadTokenUsage | null) {
  const contextWindow = contextUsage?.modelContextWindow ?? null;
  if (!contextWindow || contextWindow <= 0) {
    return null;
  }

  const lastTokens = contextUsage?.last.totalTokens ?? 0;
  const totalTokens = contextUsage?.total.totalTokens ?? 0;
  const usedTokens = Math.max(lastTokens, totalTokens);
  return Math.min(Math.max((usedTokens / contextWindow) * 100, 0), 100);
}

export function getContextUsedPercent(contextUsage?: ThreadTokenUsage | null) {
  const usedPercent = getContextUsedRawPercent(contextUsage);
  return usedPercent === null ? null : Math.round(usedPercent);
}

export function getCompactionCyclePercent(
  contextUsage?: ThreadTokenUsage | null,
  threshold?: number | null,
) {
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) {
    return null;
  }
  const lastTokens = contextUsage?.last.totalTokens ?? null;
  if (lastTokens === null) {
    return null;
  }
  const contextWindow = contextUsage?.modelContextWindow ?? null;
  const effectiveThreshold =
    typeof contextWindow === "number" &&
    Number.isFinite(contextWindow) &&
    contextWindow > 0
      ? Math.min(threshold, contextWindow)
      : threshold;
  return Math.round(
    Math.min(Math.max((lastTokens / effectiveThreshold) * 100, 0), 100),
  );
}

export function isContextCompactionInProgress(items: ConversationItem[]) {
  return items.some(
    (item) =>
      item.kind === "tool" &&
      item.toolType === "contextCompaction" &&
      item.status === "inProgress",
  );
}

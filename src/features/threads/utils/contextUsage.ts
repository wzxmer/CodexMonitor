import type { ThreadTokenUsage } from "@/types";

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

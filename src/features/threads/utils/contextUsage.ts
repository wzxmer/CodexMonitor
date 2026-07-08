import type { ThreadTokenUsage } from "@/types";

export const AUTO_COMPACT_CONTEXT_USED_THRESHOLD = 95;

export function getContextUsedPercent(contextUsage?: ThreadTokenUsage | null) {
  const contextWindow = contextUsage?.modelContextWindow ?? null;
  if (!contextWindow || contextWindow <= 0) {
    return null;
  }

  const lastTokens = contextUsage?.last.totalTokens ?? 0;
  const totalTokens = contextUsage?.total.totalTokens ?? 0;
  const usedTokens = Math.max(lastTokens, totalTokens);
  return Math.round(Math.min(Math.max((usedTokens / contextWindow) * 100, 0), 100));
}

export function shouldAutoCompactContext(contextUsage?: ThreadTokenUsage | null) {
  const usedPercent = getContextUsedPercent(contextUsage);
  return usedPercent !== null && usedPercent >= AUTO_COMPACT_CONTEXT_USED_THRESHOLD;
}

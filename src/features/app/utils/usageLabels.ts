import type { RateLimitSnapshot } from "../../../types";
import { formatRelativeTime } from "../../../utils/time";

type UsageLabels = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
};

export type UsageLabelText = {
  resetLabel: string;
  availableCredits: string;
  unlimited: string;
};

const DEFAULT_USAGE_LABEL_TEXT: UsageLabelText = {
  resetLabel: "{relative} 后重置",
  availableCredits: "可用额度：{value}",
  unlimited: "无限",
};

const clampPercent = (value: number) =>
  Math.min(Math.max(Math.round(value), 0), 100);

function formatResetLabel(
  resetsAt: number | null | undefined,
  labels: UsageLabelText,
) {
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) {
    return null;
  }
  const resetMs = resetsAt > 1_000_000_000_000 ? resetsAt : resetsAt * 1000;
  const relative = formatRelativeTime(resetMs).replace(/^in\s+/i, "");
  return labels.resetLabel.replace("{relative}", relative);
}

function formatCreditsLabel(
  accountRateLimits: RateLimitSnapshot | null,
  labels: UsageLabelText,
) {
  const credits = accountRateLimits?.credits ?? null;
  if (!credits?.hasCredits) {
    return null;
  }
  if (credits.unlimited) {
    return labels.availableCredits.replace("{value}", labels.unlimited);
  }
  const balance = credits.balance?.trim() ?? "";
  if (!balance) {
    return null;
  }
  const intValue = Number.parseInt(balance, 10);
  if (Number.isFinite(intValue) && intValue > 0) {
    return labels.availableCredits.replace("{value}", String(intValue));
  }
  const floatValue = Number.parseFloat(balance);
  if (Number.isFinite(floatValue) && floatValue > 0) {
    const rounded = Math.round(floatValue);
    return rounded > 0
      ? labels.availableCredits.replace("{value}", String(rounded))
      : null;
  }
  return null;
}

export function getUsageLabels(
  accountRateLimits: RateLimitSnapshot | null,
  showRemaining: boolean,
  labelText: Partial<UsageLabelText> = {},
): UsageLabels {
  const labels = { ...DEFAULT_USAGE_LABEL_TEXT, ...labelText };
  const usagePercent = accountRateLimits?.primary?.usedPercent;
  const globalUsagePercent = accountRateLimits?.secondary?.usedPercent;
  const sessionPercent =
    typeof usagePercent === "number"
      ? showRemaining
        ? 100 - clampPercent(usagePercent)
        : clampPercent(usagePercent)
      : null;
  const weeklyPercent =
    typeof globalUsagePercent === "number"
      ? showRemaining
        ? 100 - clampPercent(globalUsagePercent)
        : clampPercent(globalUsagePercent)
      : null;

  return {
    sessionPercent,
    weeklyPercent,
    sessionResetLabel: formatResetLabel(accountRateLimits?.primary?.resetsAt, labels),
    weeklyResetLabel: formatResetLabel(accountRateLimits?.secondary?.resetsAt, labels),
    creditsLabel: formatCreditsLabel(accountRateLimits, labels),
    showWeekly: Boolean(accountRateLimits?.secondary),
  };
}

import type {
  AccountSnapshot,
  LocalUsageDay,
  LocalUsageSnapshot,
  RateLimitSnapshot,
} from "../../types";
import { formatRelativeTime } from "../../utils/time";
import { getUsageLabels } from "../app/utils/usageLabels";
import {
  buildWindowCaption,
  formatAccountTypeLabel,
  formatCompactNumber,
  formatCount,
  formatCreditsBalance,
  formatDayCount,
  formatDayLabel,
  formatDuration,
  formatDurationCompact,
  formatPlanType,
  isUsageDayActive,
  type HomeFormatterText,
} from "./homeFormatters";
import type { HomeStatCard, UsageMetric } from "./homeTypes";
import type { UsageLabelText } from "../app/utils/usageLabels";

type HomeUsageViewModel = {
  accountCards: HomeStatCard[];
  accountMeta: string | null;
  updatedLabel: string | null;
  usageCards: HomeStatCard[];
  usageDays: LocalUsageDay[];
  usageInsights: HomeStatCard[];
};

export type HomeUsageViewModelText = HomeFormatterText &
  UsageLabelText & {
    today: string;
    lastHour: string;
    last7Days: string;
    last30Days: string;
    tokens: string;
    latestAvailableDate: string;
    inputOutput: string;
    dailyAverage: string;
    total: string;
    cacheHitRate: string;
    cachedInput: string;
    uncachedInput: string;
    promptShare: string;
    singleAverage: string;
    runsInLast7Days: string;
    noRuns: string;
    peakDay: string;
    agentTime: string;
    runCount: string;
    runs: string;
    runsInLast30Days: string;
    calculatedFromRuns: string;
    activeDayAverage: string;
    activeDaysInLast7Days: string;
    noActiveDays: string;
    longestStreak: string;
    currentUsageRange: string;
    noActiveStreak: string;
    activeDays: string;
    currentRange: string;
    noActivity: string;
    sessionRemaining: string;
    sessionUsage: string;
    currentWindow: string;
    weeklyRemaining: string;
    weeklyUsage: string;
    longerWindow: string;
    credits: string;
    unlimitedCredits: string;
    availableBalance: string;
    plan: string;
    updatedAt: string;
  };

export function buildHomeUsageViewModel({
  accountInfo,
  accountRateLimits,
  localUsageSnapshot,
  labels,
  usageMetric,
  usageShowRemaining,
}: {
  accountInfo: AccountSnapshot | null;
  accountRateLimits: RateLimitSnapshot | null;
  localUsageSnapshot: LocalUsageSnapshot | null;
  labels: HomeUsageViewModelText;
  usageMetric: UsageMetric;
  usageShowRemaining: boolean;
}): HomeUsageViewModel {
  const usageTotals = localUsageSnapshot?.totals ?? null;
  const usageDays = localUsageSnapshot?.days ?? [];
  const latestUsageDay = usageDays[usageDays.length - 1] ?? null;
  const last7Days = usageDays.slice(-7);
  const last7Tokens = last7Days.reduce((total, day) => total + day.totalTokens, 0);
  const last7Input = last7Days.reduce((total, day) => total + day.inputTokens, 0);
  const last7Cached = last7Days.reduce(
    (total, day) => total + day.cachedInputTokens,
    0,
  );
  const last7Uncached = Math.max(0, last7Input - last7Cached);
  const last7AgentMs = last7Days.reduce(
    (total, day) => total + (day.agentTimeMs ?? 0),
    0,
  );
  const last30AgentMs = usageDays.reduce(
    (total, day) => total + (day.agentTimeMs ?? 0),
    0,
  );
  const averageDailyAgentMs =
    last7Days.length > 0 ? Math.round(last7AgentMs / last7Days.length) : 0;
  const last7AgentRuns = last7Days.reduce(
    (total, day) => total + (day.agentRuns ?? 0),
    0,
  );
  const last30AgentRuns = usageDays.reduce(
    (total, day) => total + (day.agentRuns ?? 0),
    0,
  );
  const averageTokensPerRun =
    last7AgentRuns > 0 ? Math.round(last7Tokens / last7AgentRuns) : null;
  const averageRunDurationMs =
    last7AgentRuns > 0 ? Math.round(last7AgentMs / last7AgentRuns) : null;
  const last7ActiveDays = last7Days.filter(isUsageDayActive).length;
  const last30ActiveDays = usageDays.filter(isUsageDayActive).length;
  const averageActiveDayAgentMs =
    last7ActiveDays > 0 ? Math.round(last7AgentMs / last7ActiveDays) : null;
  const peakAgentDay = usageDays.reduce<
    | { day: string; agentTimeMs: number }
    | null
  >((best, day) => {
    const value = day.agentTimeMs ?? 0;
    if (value <= 0) {
      return best;
    }
    if (!best || value > best.agentTimeMs) {
      return { day: day.day, agentTimeMs: value };
    }
    return best;
  }, null);

  let longestStreak = 0;
  let runningStreak = 0;
  for (const day of usageDays) {
    if (isUsageDayActive(day)) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  const usageCards: HomeStatCard[] =
    usageMetric === "tokens"
      ? [
          {
            label: labels.today,
            value: formatCompactNumber(latestUsageDay?.totalTokens ?? 0),
            suffix: labels.tokens,
            caption: latestUsageDay
              ? labels.inputOutput
                  .replace("{day}", formatDayLabel(latestUsageDay.day))
                  .replace("{input}", formatCount(latestUsageDay.inputTokens))
                  .replace("{output}", formatCount(latestUsageDay.outputTokens))
              : labels.latestAvailableDate,
          },
          {
            label: labels.lastHour,
            value: formatCompactNumber(usageTotals?.lastHourTokens ?? 0),
            suffix: labels.tokens,
            caption: buildWindowCaption(null, 60, labels.currentWindow, labels),
          },
          {
            label: labels.last7Days,
            value: formatCompactNumber(usageTotals?.last7DaysTokens ?? last7Tokens),
            suffix: labels.tokens,
            caption: labels.dailyAverage.replace(
              "{value}",
              formatCompactNumber(usageTotals?.averageDailyTokens),
            ),
          },
          {
            label: labels.last30Days,
            value: formatCompactNumber(usageTotals?.last30DaysTokens ?? last7Tokens),
            suffix: labels.tokens,
            caption: labels.total.replace(
              "{value}",
              formatCount(usageTotals?.last30DaysTokens ?? last7Tokens),
            ),
          },
          {
            label: labels.cacheHitRate,
            value: usageTotals
              ? `${usageTotals.cacheHitRatePercent.toFixed(1)}%`
              : "--",
            caption: labels.last7Days,
          },
          {
            label: labels.cachedInput,
            value: formatCompactNumber(last7Cached),
            suffix: labels.tokens,
            caption:
              last7Input > 0
                ? labels.promptShare.replace(
                    "{value}",
                    ((last7Cached / last7Input) * 100).toFixed(1),
                  )
                : labels.last7Days,
          },
          {
            label: labels.uncachedInput,
            value: formatCompactNumber(last7Uncached),
            suffix: labels.tokens,
            caption: labels.last7Days,
          },
          {
            label: labels.singleAverage,
            value:
              averageTokensPerRun === null
                ? "--"
                : formatCompactNumber(averageTokensPerRun),
            suffix: labels.tokens,
            caption:
              last7AgentRuns > 0
                ? labels.runsInLast7Days.replace(
                    "{count}",
                    formatCount(last7AgentRuns),
                  )
                : labels.noRuns,
          },
          {
            label: labels.peakDay,
            value: formatDayLabel(usageTotals?.peakDay),
            caption: `${formatCompactNumber(usageTotals?.peakDayTokens)} ${labels.tokens}`,
          },
        ]
      : [
          {
            label: labels.last7Days,
            value: formatDurationCompact(last7AgentMs),
            suffix: labels.agentTime,
            caption: labels.dailyAverage.replace(
              "{value}",
              formatDurationCompact(averageDailyAgentMs),
            ),
          },
          {
            label: labels.last30Days,
            value: formatDurationCompact(last30AgentMs),
            suffix: labels.agentTime,
            caption: labels.total.replace("{value}", formatDuration(last30AgentMs)),
          },
          {
            label: labels.runCount,
            value: formatCount(last7AgentRuns),
            suffix: labels.runs,
            caption: labels.runsInLast30Days.replace(
              "{count}",
              formatCount(last30AgentRuns),
            ),
          },
          {
            label: labels.singleAverage,
            value: formatDurationCompact(averageRunDurationMs),
            caption:
              last7AgentRuns > 0
                ? labels.calculatedFromRuns.replace(
                    "{count}",
                    formatCount(last7AgentRuns),
                  )
                : labels.noRuns,
          },
          {
            label: labels.activeDayAverage,
            value: formatDurationCompact(averageActiveDayAgentMs),
            caption:
              last7ActiveDays > 0
                ? labels.activeDaysInLast7Days.replace(
                    "{count}",
                    formatCount(last7ActiveDays),
                  )
                : labels.noActiveDays,
          },
          {
            label: labels.peakDay,
            value: formatDayLabel(peakAgentDay?.day ?? null),
            caption: `${formatDurationCompact(peakAgentDay?.agentTimeMs ?? 0)} ${labels.agentTime}`,
          },
        ];

  const usageInsights = [
    {
      label: labels.longestStreak,
      value: longestStreak > 0 ? formatDayCount(longestStreak, labels) : "--",
      caption:
        longestStreak > 0
          ? labels.currentUsageRange
          : labels.noActiveStreak,
      compact: true,
    },
    {
      label: labels.activeDays,
      value: last7Days.length > 0 ? `${last7ActiveDays} / ${last7Days.length}` : "--",
      caption:
        usageDays.length > 0
          ? labels.currentRange
              .replace("{active}", String(last30ActiveDays))
              .replace("{total}", String(usageDays.length))
          : labels.noActivity,
      compact: true,
    },
  ] satisfies HomeStatCard[];

  const usagePercentLabels = getUsageLabels(accountRateLimits, usageShowRemaining, labels);
  const planLabel = formatPlanType(accountRateLimits?.planType ?? accountInfo?.planType);
  const creditsBalance = formatCreditsBalance(accountRateLimits?.credits?.balance);
  const accountCards: HomeStatCard[] = [];

  if (usagePercentLabels.sessionPercent !== null) {
    accountCards.push({
      label: usageShowRemaining ? labels.sessionRemaining : labels.sessionUsage,
      value: `${usagePercentLabels.sessionPercent}%`,
      caption: buildWindowCaption(
        usagePercentLabels.sessionResetLabel,
        accountRateLimits?.primary?.windowDurationMins,
        labels.currentWindow,
        labels,
      ),
    });
  }

  if (usagePercentLabels.showWeekly && usagePercentLabels.weeklyPercent !== null) {
    accountCards.push({
      label: usageShowRemaining ? labels.weeklyRemaining : labels.weeklyUsage,
      value: `${usagePercentLabels.weeklyPercent}%`,
      caption: buildWindowCaption(
        usagePercentLabels.weeklyResetLabel,
        accountRateLimits?.secondary?.windowDurationMins,
        labels.longerWindow,
        labels,
      ),
    });
  }

  if (accountRateLimits?.credits?.hasCredits) {
    accountCards.push(
      accountRateLimits.credits.unlimited
        ? {
            label: labels.credits,
            value: labels.unlimitedCredits,
            caption: labels.availableBalance,
          }
        : {
            label: labels.credits,
            value: creditsBalance ?? "--",
            suffix: creditsBalance ? labels.credits : null,
            caption: labels.availableBalance,
          },
    );
  }

  if (planLabel) {
    accountCards.push({
      label: labels.plan,
      value: planLabel,
      caption: formatAccountTypeLabel(accountInfo?.type, labels),
    });
  }

  return {
    accountCards,
    accountMeta: accountInfo?.email ?? null,
    updatedLabel: localUsageSnapshot
      ? labels.updatedAt.replace(
          "{relative}",
          formatRelativeTime(localUsageSnapshot.updatedAt),
        )
      : null,
    usageCards,
    usageDays,
    usageInsights,
  };
}

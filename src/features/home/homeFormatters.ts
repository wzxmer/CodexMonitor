import type { AccountSnapshot, LocalUsageDay } from "../../types";

export type HomeFormatterText = {
  noUsageData: string;
  rangeTo: string;
  chatgptAccount: string;
  apiKeyAccount: string;
  connectedAccount: string;
  dayWindow: string;
  hourWindow: string;
  minuteWindow: string;
  dayCount: string;
};

const DEFAULT_FORMATTER_TEXT: HomeFormatterText = {
  noUsageData: "No usage data",
  rangeTo: "至",
  chatgptAccount: "ChatGPT 账号",
  apiKeyAccount: "API Key",
  connectedAccount: "已连接账号",
  dayWindow: "{value} 天窗口",
  hourWindow: "{value} 小时窗口",
  minuteWindow: "{value} 分钟窗口",
  dayCount: "{value} 天",
};

export function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "--";
  }
  if (value >= 1_000_000_000) {
    const scaled = value / 1_000_000_000;
    return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}b`;
  }
  if (value >= 1_000_000) {
    const scaled = value / 1_000_000;
    return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}m`;
  }
  if (value >= 1_000) {
    const scaled = value / 1_000;
    return `${scaled.toFixed(scaled >= 10 ? 0 : 1)}k`;
  }
  return String(value);
}

export function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "--";
  }
  return new Intl.NumberFormat().format(value);
}

export function formatDuration(valueMs: number | null | undefined) {
  if (valueMs === null || valueMs === undefined) {
    return "--";
  }
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  return `${totalSeconds}s`;
}

export function formatDurationCompact(valueMs: number | null | undefined) {
  if (valueMs === null || valueMs === undefined) {
    return "--";
  }
  const totalMinutes = Math.max(0, Math.round(valueMs / 60000));
  if (totalMinutes >= 60) {
    const hours = totalMinutes / 60;
    return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  const seconds = Math.max(0, Math.round(valueMs / 1000));
  return `${seconds}s`;
}

export function formatDayLabel(value: string | null | undefined) {
  if (!value) {
    return "--";
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatWeekRange(
  days: LocalUsageDay[],
  labels: Partial<HomeFormatterText> = {},
) {
  const text = { ...DEFAULT_FORMATTER_TEXT, ...labels };
  if (days.length === 0) {
    return text.noUsageData;
  }
  const first = days[0];
  const last = days[days.length - 1];
  const firstLabel = formatDayLabel(first?.day);
  const lastLabel = formatDayLabel(last?.day);
  return first?.day === last?.day
    ? firstLabel
    : `${firstLabel} ${text.rangeTo} ${lastLabel}`;
}

export function isUsageDayActive(day: LocalUsageDay) {
  return day.totalTokens > 0 || day.agentTimeMs > 0 || day.agentRuns > 0;
}

export function formatPlanType(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAccountTypeLabel(
  value: AccountSnapshot["type"] | null | undefined,
  labels: Partial<HomeFormatterText> = {},
) {
  const text = { ...DEFAULT_FORMATTER_TEXT, ...labels };
  if (value === "chatgpt") {
    return text.chatgptAccount;
  }
  if (value === "apikey") {
    return text.apiKeyAccount;
  }
  return text.connectedAccount;
}

export function formatWindowDuration(
  valueMins: number | null | undefined,
  labels: Partial<HomeFormatterText> = {},
) {
  if (typeof valueMins !== "number" || !Number.isFinite(valueMins) || valueMins <= 0) {
    return null;
  }
  const text = { ...DEFAULT_FORMATTER_TEXT, ...labels };
  if (valueMins >= 60 * 24) {
    const days = Math.round(valueMins / (60 * 24));
    return text.dayWindow.replace("{value}", String(days));
  }
  if (valueMins >= 60) {
    const hours = Math.round(valueMins / 60);
    return text.hourWindow.replace("{value}", String(hours));
  }
  return text.minuteWindow.replace("{value}", String(Math.round(valueMins)));
}

export function buildWindowCaption(
  resetLabel: string | null,
  windowDurationMins: number | null | undefined,
  fallback: string,
  labels: Partial<HomeFormatterText> = {},
) {
  const parts = [
    resetLabel,
    formatWindowDuration(windowDurationMins, labels),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : fallback;
}

export function formatCreditsBalance(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return trimmed;
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function formatDayCount(
  value: number | null | undefined,
  labels: Partial<HomeFormatterText> = {},
) {
  if (value === null || value === undefined) {
    return "--";
  }
  const text = { ...DEFAULT_FORMATTER_TEXT, ...labels };
  return text.dayCount.replace("{value}", String(value));
}

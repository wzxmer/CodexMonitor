export type ThirdPartyKeyUsageSnapshot = {
  balanceUsd: number | null;
  todayCostUsd: number | null;
};

type ThirdPartyUsageTodayPayload = {
  actual_cost?: unknown;
};

type ThirdPartyUsagePayload = {
  balance?: unknown;
  remaining?: unknown;
  usage?: {
    today?: ThirdPartyUsageTodayPayload;
  };
  subscription?: {
    daily_usage_usd?: unknown;
  };
};

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildThirdPartyUsageUrl(baseUrl: string | null | undefined): string | null {
  const raw = baseUrl?.trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const path = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = `${path || "/v1"}/usage`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeThirdPartyUsagePayload(
  payload: unknown,
): ThirdPartyKeyUsageSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const data = payload as ThirdPartyUsagePayload;
  const balanceUsd =
    parseNumericValue(data.balance) ?? parseNumericValue(data.remaining);
  const todayCostUsd =
    parseNumericValue(data.usage?.today?.actual_cost) ??
    parseNumericValue(data.subscription?.daily_usage_usd);

  if (balanceUsd === null && todayCostUsd === null) {
    return null;
  }
  return {
    balanceUsd,
    todayCostUsd,
  };
}

import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef } from "react";
import { setTraySessionUsage } from "@services/tauri";
import type { RateLimitSnapshot, TraySessionUsage } from "../../../types";
import { getUsageLabels, type UsageLabelText } from "../utils/usageLabels";

const SYNC_DEBOUNCE_MS = 150;

type TrayUsageLabelText = Partial<UsageLabelText> & {
  used?: string;
  remaining?: string;
};

type UseTraySessionUsageParams = {
  accountRateLimits: RateLimitSnapshot | null;
  showRemaining: boolean;
  labels?: TrayUsageLabelText;
};

export function buildTraySessionUsage(
  accountRateLimits: RateLimitSnapshot | null,
  showRemaining: boolean,
  labels: TrayUsageLabelText = {},
): TraySessionUsage | null {
  const usedLabel = labels.used ?? "{value}% used";
  const remainingLabel = labels.remaining ?? "{value}% remaining";
  const {
    sessionPercent,
    weeklyPercent,
    sessionResetLabel,
    weeklyResetLabel,
  } = getUsageLabels(
    accountRateLimits,
    showRemaining,
    labels,
  );
  if (sessionPercent === null) {
    return null;
  }

  const usageLabel = showRemaining
    ? remainingLabel.replace("{value}", String(sessionPercent))
    : usedLabel.replace("{value}", String(sessionPercent));
  const weeklyUsageLabel =
    typeof weeklyPercent === "number"
      ? showRemaining
        ? remainingLabel.replace("{value}", String(weeklyPercent))
        : usedLabel.replace("{value}", String(weeklyPercent))
      : null;

  return {
    sessionLabel:
      sessionResetLabel === null
        ? usageLabel
        : `${usageLabel} · ${sessionResetLabel}`,
    weeklyLabel:
      weeklyUsageLabel === null
        ? null
        : weeklyResetLabel === null
          ? weeklyUsageLabel
          : `${weeklyUsageLabel} · ${weeklyResetLabel}`,
  };
}

export function useTraySessionUsage({
  accountRateLimits,
  showRemaining,
  labels,
}: UseTraySessionUsageParams) {
  const usage = useMemo(
    () => buildTraySessionUsage(accountRateLimits, showRemaining, labels),
    [accountRateLimits, labels, showRemaining],
  );
  const lastSyncedUsageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const serializedUsage = JSON.stringify(usage);
    if (lastSyncedUsageRef.current === serializedUsage) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleSync = () => {
      timeoutId = window.setTimeout(() => {
        void setTraySessionUsage(usage)
          .then(() => {
            if (!cancelled) {
              lastSyncedUsageRef.current = serializedUsage;
            }
          })
          .catch(() => {
            if (!cancelled) {
              // Retry until the desktop bridge or tray is ready for the same usage payload.
              scheduleSync();
            }
          });
      }, SYNC_DEBOUNCE_MS);
    };

    scheduleSync();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [usage]);
}

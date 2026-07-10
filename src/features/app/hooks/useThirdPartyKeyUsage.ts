import { useEffect, useState } from "react";
import { getThirdPartyKeyUsage } from "@/services/tauri";
import type { ThirdPartyKeyUsageSnapshot } from "../utils/thirdPartyKeyUsage";

const THIRD_PARTY_KEY_USAGE_REFRESH_MS = 60_000;

type UseThirdPartyKeyUsageArgs = {
  enabled: boolean;
  baseUrl: string | null | undefined;
  apiKey: string | null | undefined;
};

export function useThirdPartyKeyUsage({
  enabled,
  baseUrl,
  apiKey,
}: UseThirdPartyKeyUsageArgs): ThirdPartyKeyUsageSnapshot | null {
  const [snapshot, setSnapshot] = useState<ThirdPartyKeyUsageSnapshot | null>(null);

  useEffect(() => {
    const trimmedBaseUrl = baseUrl?.trim() ?? "";
    const trimmedApiKey = apiKey?.trim() ?? "";
    if (!enabled || !trimmedBaseUrl || !trimmedApiKey) {
      setSnapshot(null);
      return;
    }

    let canceled = false;

    const refresh = () => {
      getThirdPartyKeyUsage(trimmedBaseUrl, trimmedApiKey)
        .then((nextSnapshot) => {
          if (!canceled) {
            setSnapshot(nextSnapshot);
          }
        })
        .catch(() => {
          if (!canceled) {
            setSnapshot(null);
          }
        });
    };

    refresh();
    const intervalId = window.setInterval(refresh, THIRD_PARTY_KEY_USAGE_REFRESH_MS);

    return () => {
      canceled = true;
      window.clearInterval(intervalId);
    };
  }, [apiKey, baseUrl, enabled]);

  return snapshot;
}

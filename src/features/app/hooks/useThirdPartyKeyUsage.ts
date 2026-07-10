import { useEffect, useState } from "react";
import { getWorkspaceThirdPartyKeyUsage } from "@/services/tauri";
import type { ThirdPartyKeyUsageSnapshot } from "../utils/thirdPartyKeyUsage";

const THIRD_PARTY_KEY_USAGE_REFRESH_MS = 60_000;

type UseThirdPartyKeyUsageArgs = {
  enabled: boolean;
  workspaceId: string | null | undefined;
};

export function useThirdPartyKeyUsage({
  enabled,
  workspaceId,
}: UseThirdPartyKeyUsageArgs): ThirdPartyKeyUsageSnapshot | null {
  const [snapshot, setSnapshot] = useState<ThirdPartyKeyUsageSnapshot | null>(null);

  useEffect(() => {
    const trimmedWorkspaceId = workspaceId?.trim() ?? "";
    if (!enabled || !trimmedWorkspaceId) {
      setSnapshot(null);
      return;
    }

    let canceled = false;

    const refresh = () => {
      getWorkspaceThirdPartyKeyUsage(trimmedWorkspaceId)
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
  }, [enabled, workspaceId]);

  return snapshot;
}

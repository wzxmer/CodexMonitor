import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef } from "react";
import { setTrayLabels } from "@services/tauri";
import type { TrayLabels } from "@/types";

const SYNC_DEBOUNCE_MS = 150;

type UseTrayLabelsParams = {
  labels: TrayLabels;
};

export function useTrayLabels({ labels }: UseTrayLabelsParams) {
  const serializedLabels = useMemo(() => JSON.stringify(labels), [labels]);
  const syncLabels = useMemo(() => labels, [serializedLabels]);
  const lastSyncedLabelsRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    if (lastSyncedLabelsRef.current === serializedLabels) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleSync = () => {
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        void setTrayLabels(syncLabels)
          .then(() => {
            if (cancelled) {
              return;
            }
            lastSyncedLabelsRef.current = serializedLabels;
          })
          .catch(() => {
            if (cancelled) {
              return;
            }
            scheduleSync();
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
  }, [serializedLabels, syncLabels]);
}

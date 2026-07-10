import { useEffect, useMemo } from "react";
import { runManagedSessionCleanupScheduler } from "@services/tauri";
import { loadPinnedThreadIds } from "@threads/utils/threadStorage";

const SCHEDULER_POLL_MS = 60 * 60 * 1000;

type ThreadStatusLookup = Record<
  string,
  { isProcessing?: boolean } | undefined
>;

type Args = {
  settingsLoading: boolean;
  startupReady: boolean;
  enabled: boolean;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusLookup;
  pinnedThreadsVersion: number;
};

export function buildCleanupProtectedThreadIds(
  activeThreadId: string | null,
  threadStatusById: ThreadStatusLookup,
): string[] {
  const ids = new Set(loadPinnedThreadIds());
  if (activeThreadId) {
    ids.add(activeThreadId);
  }
  for (const [threadId, status] of Object.entries(threadStatusById)) {
    if (status?.isProcessing) {
      ids.add(threadId);
    }
  }
  return [...ids];
}

export function useSessionCleanupScheduler({
  settingsLoading,
  startupReady,
  enabled,
  activeThreadId,
  threadStatusById,
  pinnedThreadsVersion,
}: Args): void {
  const protectedThreadIds = useMemo(
    () => buildCleanupProtectedThreadIds(activeThreadId, threadStatusById),
    [activeThreadId, pinnedThreadsVersion, threadStatusById],
  );

  useEffect(() => {
    if (settingsLoading || !startupReady) {
      return;
    }
    const run = () => {
      void runManagedSessionCleanupScheduler({
        protectedThreadIds,
      }).catch(() => undefined);
    };
    run();
    if (!enabled) {
      return;
    }
    const timer = window.setInterval(run, SCHEDULER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, protectedThreadIds, settingsLoading, startupReady]);
}

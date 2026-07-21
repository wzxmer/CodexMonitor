import { useEffect, useRef } from "react";
import type { WorkspaceInfo } from "../../../types";
import type { ThreadListRefreshReason } from "@threads/types";

export const REMOTE_WORKSPACE_REFRESH_INTERVAL_MS = 15_000;

type WorkspaceRefreshOptions = {
  workspaces: WorkspaceInfo[];
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | void>;
  listThreadsForWorkspaces: (
    workspaces: WorkspaceInfo[],
    options?: { preserveState?: boolean; refreshReason?: ThreadListRefreshReason },
  ) => Promise<void>;
  backendMode?: string;
  pollIntervalMs?: number;
};

export function useWorkspaceRefreshOnFocus({
  workspaces,
  refreshWorkspaces,
  listThreadsForWorkspaces,
  backendMode = "local",
  pollIntervalMs = REMOTE_WORKSPACE_REFRESH_INTERVAL_MS,
}: WorkspaceRefreshOptions) {
  const optionsRef = useRef({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspaces,
    backendMode,
    pollIntervalMs,
  });
  useEffect(() => {
    optionsRef.current = {
      workspaces,
      refreshWorkspaces,
      listThreadsForWorkspaces,
      backendMode,
      pollIntervalMs,
    };
  });

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let refreshInFlight = false;

    const runRefreshCycle = (refreshReason: ThreadListRefreshReason) => {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      const {
        workspaces: ws,
        refreshWorkspaces: refresh,
        listThreadsForWorkspaces: listThreads,
      } = optionsRef.current;
      void (async () => {
        let latestWorkspaces = ws;
        try {
          const entries = await refresh();
          if (entries) {
            latestWorkspaces = entries;
          }
        } catch {
          // Silent: refresh errors show in debug panel.
        }
        const connected = latestWorkspaces.filter((entry) => entry.connected);
        if (connected.length > 0) {
          await listThreads(connected, { preserveState: true, refreshReason });
        }
      })().finally(() => {
        refreshInFlight = false;
      });
    };

    const updatePolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      const { backendMode: currentBackendMode, pollIntervalMs: intervalMs } =
        optionsRef.current;
      if (currentBackendMode !== "remote" || document.visibilityState !== "visible") {
        return;
      }
      pollTimer = setInterval(() => {
        runRefreshCycle("workspace_poll");
      }, intervalMs);
    };

    const scheduleRefresh = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        runRefreshCycle("workspace_focus");
      }, 500);
    };

    const handleFocus = () => {
      scheduleRefresh();
      updatePolling();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
      updatePolling();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    updatePolling();
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [backendMode, pollIntervalMs]);
}

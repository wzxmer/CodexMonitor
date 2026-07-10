import { useCallback, useEffect, useRef } from "react";
import { onAction } from "@tauri-apps/plugin-notification";
import type { WorkspaceInfo } from "../../../types";

type ThreadDeepLink = {
  workspaceId: string;
  threadId: string;
  notifiedAt: number;
};

type Params = {
  hasLoadedWorkspaces: boolean;
  workspacesById: Map<string, WorkspaceInfo>;
  refreshWorkspaces: () => Promise<WorkspaceInfo[] | undefined>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  openThreadLink: (workspaceId: string, threadId: string) => void;
  maxAgeMs?: number;
};

export function useSystemNotificationThreadLinks({
  hasLoadedWorkspaces,
  workspacesById,
  refreshWorkspaces,
  connectWorkspace,
  openThreadLink,
  maxAgeMs = 120_000,
}: Params): void {
  const pendingLinkRef = useRef<ThreadDeepLink | null>(null);
  const refreshInFlightRef = useRef(false);

  const queuePendingThreadLink = useCallback((workspaceId: string, threadId: string) => {
    pendingLinkRef.current = { workspaceId, threadId, notifiedAt: Date.now() };
  }, []);

  const tryNavigateToLink = useCallback(async () => {
    const link = pendingLinkRef.current;
    if (!link) {
      return;
    }
    if (Date.now() - link.notifiedAt > maxAgeMs) {
      pendingLinkRef.current = null;
      return;
    }

    let workspace = workspacesById.get(link.workspaceId) ?? null;
    if (!workspace && hasLoadedWorkspaces && !refreshInFlightRef.current) {
      refreshInFlightRef.current = true;
      try {
        const refreshed = await refreshWorkspaces();
        workspace =
          refreshed?.find((entry) => entry.id === link.workspaceId) ?? null;
      } finally {
        refreshInFlightRef.current = false;
      }
    }

    if (!workspace) {
      pendingLinkRef.current = null;
      return;
    }

    if (!workspace.connected) {
      try {
        await connectWorkspace(workspace);
      } catch {
        // Ignore connect failures; user can retry manually.
      }
    }

    openThreadLink(link.workspaceId, link.threadId);
    pendingLinkRef.current = null;
  }, [
    connectWorkspace,
    hasLoadedWorkspaces,
    maxAgeMs,
    openThreadLink,
    refreshWorkspaces,
    workspacesById,
  ]);

  const openThreadLinkOrQueue = useCallback(
    (workspaceId: string, threadId: string) => {
      queuePendingThreadLink(workspaceId, threadId);
      if (hasLoadedWorkspaces) {
        void tryNavigateToLink();
      }
    },
    [hasLoadedWorkspaces, queuePendingThreadLink, tryNavigateToLink],
  );

  useEffect(() => {
    let disposed = false;
    let unregister: (() => Promise<void>) | null = null;

    void onAction((notification) => {
      const extra = notification.extra;
      const kind = extra?.kind;
      const workspaceId = extra?.workspaceId;
      const threadId = extra?.threadId;
      if (kind !== "thread" && kind !== "response_required") {
        return;
      }
      if (typeof workspaceId !== "string" || typeof threadId !== "string") {
        return;
      }
      openThreadLinkOrQueue(workspaceId, threadId);
    })
      .then((listener) => {
        if (disposed) {
          void listener.unregister();
          return;
        }
        unregister = () => listener.unregister();
      })
      .catch(() => {
        // Notification actions are unavailable in browser and fallback modes.
      });

    return () => {
      disposed = true;
      if (unregister) {
        void unregister();
      }
    };
  }, [openThreadLinkOrQueue]);

  useEffect(() => {
    if (!pendingLinkRef.current) {
      return;
    }
    if (!hasLoadedWorkspaces) {
      return;
    }
    void tryNavigateToLink();
  }, [hasLoadedWorkspaces, tryNavigateToLink]);

}

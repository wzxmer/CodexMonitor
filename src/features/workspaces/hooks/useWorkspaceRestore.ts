import { useEffect, useRef, useState } from "react";
import type { WorkspaceInfo } from "../../../types";
import { isLocalCodexWorkspaceId } from "@/features/workspaces/domain/localCodexWorkspace";

const INITIAL_THREAD_LIST_MAX_PAGES = 6;

type WorkspaceRestoreOptions = {
  workspaces: WorkspaceInfo[];
  hasLoaded: boolean;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  listThreadsForWorkspaces: (
    workspaces: WorkspaceInfo[],
    options?: { preserveState?: boolean; maxPages?: number },
  ) => Promise<void>;
};

export function useWorkspaceRestore({
  workspaces,
  hasLoaded,
  connectWorkspace,
  listThreadsForWorkspaces,
}: WorkspaceRestoreOptions) {
  const restoredWorkspaces = useRef(new Set<string>());
  const pendingRestoreBatches = useRef(0);
  const [initialRestoreComplete, setInitialRestoreComplete] = useState(false);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }
    const pending = workspaces.filter(
      (workspace) => !restoredWorkspaces.current.has(workspace.id),
    );
    if (pending.length === 0) {
      if (pendingRestoreBatches.current === 0) {
        setInitialRestoreComplete(true);
      }
      return;
    }
    pendingRestoreBatches.current += 1;
    pending.forEach((workspace) => {
      restoredWorkspaces.current.add(workspace.id);
    });
    void (async () => {
      const connectedTargets: WorkspaceInfo[] = [];
      for (const workspace of pending) {
        const wasConnected = workspace.connected;
        const isLocalCodexWorkspace = isLocalCodexWorkspaceId(workspace.id);
        try {
          if (!wasConnected && !isLocalCodexWorkspace) {
            await connectWorkspace(workspace);
          }
          connectedTargets.push({ ...workspace, connected: true });
        } catch {
          // Silent: connection errors show in debug panel.
        }
      }
      try {
        if (connectedTargets.length > 0) {
          await listThreadsForWorkspaces(connectedTargets, {
            maxPages: INITIAL_THREAD_LIST_MAX_PAGES,
          });
        }
      } finally {
        pendingRestoreBatches.current -= 1;
        if (pendingRestoreBatches.current === 0) {
          setInitialRestoreComplete(true);
        }
      }
    })();
  }, [connectWorkspace, hasLoaded, listThreadsForWorkspaces, workspaces]);

  return initialRestoreComplete;
}

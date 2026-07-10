import { useCallback, useMemo, useState } from "react";
import type { ThreadStatusById } from "@/utils/threadStatus";

type SubagentRow = {
  thread: { id: string };
  depth: number;
  workspaceId: string;
};

type ManualExpansionState = "expanded" | "collapsed";

function hasActiveDescendant(
  rows: SubagentRow[],
  parentIndex: number,
  threadStatusById: ThreadStatusById,
  pendingUserInputKeys?: Set<string>,
) {
  const parentDepth = rows[parentIndex]?.depth ?? 0;
  for (let index = parentIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.depth <= parentDepth) {
      break;
    }
    const status = threadStatusById[row.thread.id];
    if (
      status?.isProcessing ||
      status?.isReviewing ||
      pendingUserInputKeys?.has(`${row.workspaceId}:${row.thread.id}`)
    ) {
      return true;
    }
  }
  return false;
}

export function useSubagentAutoCollapse<T extends SubagentRow>(
  rows: T[],
  threadStatusById: ThreadStatusById,
  pendingUserInputKeys?: Set<string>,
) {
  const [manualStateByThreadKey, setManualStateByThreadKey] = useState<
    Record<string, ManualExpansionState>
  >({});

  const defaultCollapsedThreadKeys = useMemo(() => {
    const collapsed = new Set<string>();
    for (let index = 0; index < rows.length - 1; index += 1) {
      const row = rows[index];
      if (rows[index + 1].depth <= row.depth) {
        continue;
      }
      const threadKey = `${row.workspaceId}:${row.thread.id}`;
      if (!hasActiveDescendant(rows, index, threadStatusById, pendingUserInputKeys)) {
        collapsed.add(threadKey);
      }
    }
    return collapsed;
  }, [pendingUserInputKeys, rows, threadStatusById]);

  const isCollapsed = useCallback(
    (workspaceId: string, threadId: string) => {
      const threadKey = `${workspaceId}:${threadId}`;
      const manualState = manualStateByThreadKey[threadKey];
      if (manualState) {
        return manualState === "collapsed";
      }
      return defaultCollapsedThreadKeys.has(threadKey);
    },
    [defaultCollapsedThreadKeys, manualStateByThreadKey],
  );

  const toggle = useCallback(
    (workspaceId: string, threadId: string) => {
      const threadKey = `${workspaceId}:${threadId}`;
      setManualStateByThreadKey((current) => ({
        ...current,
        [threadKey]: isCollapsed(workspaceId, threadId) ? "expanded" : "collapsed",
      }));
    },
    [isCollapsed],
  );

  return useMemo(() => ({ isCollapsed, toggle }), [isCollapsed, toggle]);
}

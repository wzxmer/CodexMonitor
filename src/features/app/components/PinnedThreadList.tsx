import { useMemo, type MouseEvent } from "react";

import type { ThreadSummary } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import { ThreadRow } from "./ThreadRow";
import { buildThreadRowVisibility } from "./threadRowVisibility";
import { useSubagentAutoCollapse } from "../hooks/useSubagentAutoCollapse";

type PinnedThreadRow = {
  thread: ThreadSummary;
  depth: number;
  workspaceId: string;
};

type PinnedThreadListProps = {
  rows: PinnedThreadRow[];
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
  getWorkspaceLabel?: (workspaceId: string) => string | null;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  onToggleThreadPin?: (workspaceId: string, threadId: string, pinned: boolean) => void;
};

export function PinnedThreadList({
  rows,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  getWorkspaceLabel,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  onSelectThread,
  onShowThreadMenu,
  onToggleThreadPin,
}: PinnedThreadListProps) {
  const subagentCollapse = useSubagentAutoCollapse(
    rows,
    threadStatusById,
    pendingUserInputKeys,
  );
  const visibility = useMemo(
    () =>
      buildThreadRowVisibility(
        rows,
        (row) => subagentCollapse.isCollapsed(row.workspaceId, row.thread.id),
      ),
    [rows, subagentCollapse],
  );

  return (
    <div className="thread-list pinned-thread-list">
      {visibility.visibleRows.map((row) => {
        const { thread, depth, workspaceId } = row;
        return (
          <ThreadRow
            key={`${workspaceId}:${thread.id}`}
            thread={thread}
            depth={depth}
            workspaceId={workspaceId}
            indentUnit={14}
            activeWorkspaceId={activeWorkspaceId}
            activeThreadId={activeThreadId}
            threadStatusById={threadStatusById}
            pendingUserInputKeys={pendingUserInputKeys}
            workspaceLabel={getWorkspaceLabel?.(workspaceId) ?? null}
            getThreadTime={getThreadTime}
            getThreadArgsBadge={getThreadArgsBadge}
            isThreadPinned={isThreadPinned}
            onSelectThread={onSelectThread}
            onShowThreadMenu={onShowThreadMenu}
            onToggleThreadPin={onToggleThreadPin}
            hasSubagentChildren={visibility.rowsWithChildren.has(row)}
            subagentsExpanded={!subagentCollapse.isCollapsed(workspaceId, thread.id)}
            onToggleSubagents={subagentCollapse.toggle}
            showPinnedLabel={false}
          />
        );
      })}
    </div>
  );
}

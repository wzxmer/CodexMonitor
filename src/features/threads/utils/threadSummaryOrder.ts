import type { ThreadListSortKey, ThreadSummary } from "@/types";

export function getThreadSummarySortTimestamp(
  thread: ThreadSummary,
  sortKey: ThreadListSortKey,
) {
  return sortKey === "created_at"
    ? (thread.createdAt ?? thread.updatedAt ?? 0)
    : (thread.updatedAt ?? thread.createdAt ?? 0);
}

export function insertThreadSummaryBySort(
  threads: ThreadSummary[],
  thread: ThreadSummary,
  sortKey: ThreadListSortKey,
) {
  const timestamp = getThreadSummarySortTimestamp(thread, sortKey);
  const insertionIndex = threads.findIndex(
    (candidate) => getThreadSummarySortTimestamp(candidate, sortKey) < timestamp,
  );
  if (insertionIndex === -1) {
    threads.push(thread);
    return;
  }
  threads.splice(insertionIndex, 0, thread);
}

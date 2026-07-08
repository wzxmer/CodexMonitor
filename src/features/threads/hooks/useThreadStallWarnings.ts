import { useEffect, useRef } from "react";
import type { ThreadState } from "./useThreadsReducer";

const TURN_STALL_WARNING_AFTER_MS = 10 * 60 * 1000;
const TURN_STALL_CHECK_INTERVAL_MS = 30 * 1000;

type UseThreadStallWarningsOptions = {
  threadStatusById: ThreadState["threadStatusById"];
  pushThreadErrorMessage: (threadId: string, message: string) => void;
  safeMessageActivity: () => void;
};

export function useThreadStallWarnings({
  threadStatusById,
  pushThreadErrorMessage,
  safeMessageActivity,
}: UseThreadStallWarningsOptions) {
  const warnedProcessingStartByThreadRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const checkStalledThreads = () => {
      const now = Date.now();
      const activeThreadIds = new Set<string>();

      for (const [threadId, status] of Object.entries(threadStatusById)) {
        if (!status?.isProcessing || !status.processingStartedAt) {
          continue;
        }
        activeThreadIds.add(threadId);
        const startedAt = status.processingStartedAt;
        if (warnedProcessingStartByThreadRef.current[threadId] === startedAt) {
          continue;
        }
        if (now - startedAt < TURN_STALL_WARNING_AFTER_MS) {
          continue;
        }
        warnedProcessingStartByThreadRef.current[threadId] = startedAt;
        pushThreadErrorMessage(
          threadId,
          "Turn may be stalled: Codex has been working for over 10 minutes without a completion or error event.",
        );
        safeMessageActivity();
      }

      for (const threadId of Object.keys(warnedProcessingStartByThreadRef.current)) {
        if (!activeThreadIds.has(threadId)) {
          delete warnedProcessingStartByThreadRef.current[threadId];
        }
      }
    };

    checkStalledThreads();
    const interval = window.setInterval(
      checkStalledThreads,
      TURN_STALL_CHECK_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [pushThreadErrorMessage, safeMessageActivity, threadStatusById]);
}


import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { SendMessageResult, WorkspaceInfo } from "@/types";

const AUTO_CONTINUE_PROMPT =
  "The previous run ended unexpectedly. Continue the unfinished task from the current conversation state. Check existing results first and do not repeat work that is already complete.";
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000] as const;

export type ThreadAutoContinueStatus = {
  enabled: boolean;
  phase: "idle" | "waiting" | "sending" | "running";
  attempt: number;
  nextRetryAt: number | null;
};

type SendContinuation = (
  workspace: WorkspaceInfo,
  threadId: string,
  message: string,
) => Promise<SendMessageResult>;

type UseThreadAutoContinueOptions = {
  getWorkspace: (workspaceId: string) => WorkspaceInfo | null;
  isThreadProcessing: (threadId: string) => boolean;
  sendContinuationRef: MutableRefObject<SendContinuation | null>;
};

const EMPTY_STATUS: ThreadAutoContinueStatus = {
  enabled: false,
  phase: "idle",
  attempt: 0,
  nextRetryAt: null,
};

function retryDelay(attempt: number) {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_MS.length - 1)];
}

export function useThreadAutoContinue({
  getWorkspace,
  isThreadProcessing,
  sendContinuationRef,
}: UseThreadAutoContinueOptions) {
  const [statusByThread, setStatusByThread] = useState<Record<string, ThreadAutoContinueStatus>>({});
  const statusRef = useRef(statusByThread);
  const timerByThreadRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const expectedAutoStartRef = useRef(new Set<string>());
  const manuallyStoppedTurnRef = useRef(new Set<string>());

  statusRef.current = statusByThread;

  const clearTimer = useCallback((threadId: string) => {
    const timer = timerByThreadRef.current.get(threadId);
    if (timer) {
      clearTimeout(timer);
      timerByThreadRef.current.delete(threadId);
    }
  }, []);

  const updateStatus = useCallback(
    (threadId: string, update: (current: ThreadAutoContinueStatus) => ThreadAutoContinueStatus) => {
      setStatusByThread((current) => {
        const next = { ...current, [threadId]: update(current[threadId] ?? EMPTY_STATUS) };
        statusRef.current = next;
        return next;
      });
    },
    [],
  );

  const scheduleRetryRef = useRef<
    ((workspaceId: string, threadId: string, attempt: number) => void) | null
  >(null);

  const scheduleRetry = useCallback(
    (workspaceId: string, threadId: string, attempt: number) => {
      clearTimer(threadId);
      if (!(statusRef.current[threadId] ?? EMPTY_STATUS).enabled) {
        return;
      }
      const delay = retryDelay(attempt);
      updateStatus(threadId, (status) => ({
        ...status,
        phase: "waiting",
        attempt,
        nextRetryAt: Date.now() + delay,
      }));
      const timer = setTimeout(async () => {
        timerByThreadRef.current.delete(threadId);
        if (!(statusRef.current[threadId] ?? EMPTY_STATUS).enabled) {
          return;
        }
        if (isThreadProcessing(threadId)) {
          scheduleRetryRef.current?.(workspaceId, threadId, attempt);
          return;
        }
        const workspace = getWorkspace(workspaceId);
        const sendContinuation = sendContinuationRef.current;
        if (!workspace || !sendContinuation) {
          scheduleRetryRef.current?.(workspaceId, threadId, attempt + 1);
          return;
        }
        expectedAutoStartRef.current.add(threadId);
        updateStatus(threadId, (status) => ({ ...status, phase: "sending", nextRetryAt: null }));
        try {
          const result = await sendContinuation(workspace, threadId, AUTO_CONTINUE_PROMPT);
          if (result?.status && result.status !== "sent") {
            expectedAutoStartRef.current.delete(threadId);
            scheduleRetryRef.current?.(workspaceId, threadId, attempt + 1);
            return;
          }
          updateStatus(threadId, (status) => ({ ...status, phase: "running", nextRetryAt: null }));
        } catch {
          expectedAutoStartRef.current.delete(threadId);
          scheduleRetryRef.current?.(workspaceId, threadId, attempt + 1);
        }
      }, delay);
      timerByThreadRef.current.set(threadId, timer);
    },
    [clearTimer, getWorkspace, isThreadProcessing, sendContinuationRef, updateStatus],
  );

  scheduleRetryRef.current = scheduleRetry;

  const setEnabled = useCallback(
    (threadId: string, enabled: boolean) => {
      clearTimer(threadId);
      expectedAutoStartRef.current.delete(threadId);
      updateStatus(threadId, () => ({ enabled, phase: "idle", attempt: 0, nextRetryAt: null }));
    },
    [clearTimer, updateStatus],
  );

  const onTurnStarted = useCallback(
    (_workspaceId: string, threadId: string) => {
      if (!statusRef.current[threadId]) {
        return;
      }
      clearTimer(threadId);
      if (expectedAutoStartRef.current.delete(threadId)) {
        updateStatus(threadId, (status) => ({ ...status, phase: "running", nextRetryAt: null }));
        return;
      }
      updateStatus(threadId, (status) => ({ ...status, phase: "idle", attempt: 0, nextRetryAt: null }));
    },
    [clearTimer, updateStatus],
  );

  const onTurnCompleted = useCallback(
    (_workspaceId: string, threadId: string) => {
      if (!statusRef.current[threadId]) {
        return;
      }
      clearTimer(threadId);
      expectedAutoStartRef.current.delete(threadId);
      updateStatus(threadId, (status) => ({ ...status, phase: "idle", attempt: 0, nextRetryAt: null }));
    },
    [clearTimer, updateStatus],
  );

  const onTurnError = useCallback(
    (workspaceId: string, threadId: string, turnId: string, payload: { willRetry: boolean }) => {
      if (payload.willRetry) {
        return;
      }
      if (manuallyStoppedTurnRef.current.delete(`${threadId}:${turnId}`)) {
        return;
      }
      const status = statusRef.current[threadId] ?? EMPTY_STATUS;
      if (!status.enabled) {
        return;
      }
      expectedAutoStartRef.current.delete(threadId);
      scheduleRetry(workspaceId, threadId, status.attempt + 1);
    },
    [scheduleRetry],
  );

  const markManualStop = useCallback(
    (threadId: string, turnId: string | null) => {
      clearTimer(threadId);
      expectedAutoStartRef.current.delete(threadId);
      if (turnId) {
        manuallyStoppedTurnRef.current.add(`${threadId}:${turnId}`);
      }
      updateStatus(threadId, (status) => ({ ...status, phase: "idle", attempt: 0, nextRetryAt: null }));
    },
    [clearTimer, updateStatus],
  );

  const clearThread = useCallback(
    (threadId: string) => {
      clearTimer(threadId);
      expectedAutoStartRef.current.delete(threadId);
      setStatusByThread((current) => {
        if (!current[threadId]) {
          return current;
        }
        const { [threadId]: _, ...rest } = current;
        statusRef.current = rest;
        return rest;
      });
    },
    [clearTimer],
  );

  useEffect(
    () => () => {
      timerByThreadRef.current.forEach((timer) => clearTimeout(timer));
      timerByThreadRef.current.clear();
    },
    [],
  );

  return {
    statusByThread,
    setEnabled,
    onTurnStarted,
    onTurnCompleted,
    onTurnError,
    markManualStop,
    clearThread,
  };
}

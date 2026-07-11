import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { DebugEntry, SubagentCheckpointSyncMode } from "@/types";
import { steerTurn } from "@services/tauri";
import type { ThreadState } from "./useThreadsReducer";
import {
  buildCheckpointInjection,
  checkpointThrottleMs,
  createSubagentCheckpoint,
  shouldCreateCheckpoint,
  type SubagentCheckpoint,
} from "@threads/utils/subagentCheckpoints";

type AgentMessageCompletedEvent = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  text: string;
};

type LatestAgentMessage = AgentMessageCompletedEvent & {
  turnId: string | null;
};

type UseSubagentCheckpointSyncOptions = {
  mode: SubagentCheckpointSyncMode;
  threadParentByIdRef: MutableRefObject<ThreadState["threadParentById"]>;
  threadStatusByIdRef: MutableRefObject<ThreadState["threadStatusById"]>;
  activeTurnIdByThreadRef: MutableRefObject<ThreadState["activeTurnIdByThread"]>;
  getChildName?: (workspaceId: string, threadId: string) => string | null;
  onStatusChange?: (
    workspaceId: string,
    parentThreadId: string,
    status: "pending" | "delivered" | "failed",
    deliveredCount: number,
  ) => void;
  onDebug?: (entry: DebugEntry) => void;
};

const MAX_DELIVERY_ATTEMPTS = 3;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isStaleTurnError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("no active turn") ||
    (normalized.includes("active turn") && normalized.includes("not found"));
}

export function useSubagentCheckpointSync({
  mode,
  threadParentByIdRef,
  threadStatusByIdRef,
  activeTurnIdByThreadRef,
  getChildName,
  onStatusChange,
  onDebug,
}: UseSubagentCheckpointSyncOptions) {
  const modeRef = useRef(mode);
  const pendingByParentRef = useRef<Record<string, SubagentCheckpoint[]>>({});
  const deliveredIdsRef = useRef(new Set<string>());
  const progressCountByTurnRef = useRef<Record<string, number>>({});
  const sequenceByChildRef = useRef<Record<string, number>>({});
  const activeTurnByChildRef = useRef<Record<string, string | null>>({});
  const latestAgentMessageRef = useRef<Record<string, LatestAgentMessage>>({});
  const lastDeliveredAtByParentRef = useRef<Record<string, number>>({});
  const deliveryInFlightByParentRef = useRef<Record<string, boolean>>({});
  const flushTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  modeRef.current = mode;

  const emitDebug = useCallback(
    (label: string, payload: Record<string, unknown>) => {
      onDebug?.({
        id: `${Date.now()}-subagent-checkpoint-${label}`,
        timestamp: Date.now(),
        source: "client",
        label: `subagent checkpoint ${label}`,
        payload,
      });
    },
    [onDebug],
  );

  const enqueue = useCallback((checkpoint: SubagentCheckpoint) => {
    const pending = pendingByParentRef.current[checkpoint.parentThreadId] ?? [];
    if (pending.some((item) => item.id === checkpoint.id)) {
      return;
    }
    pendingByParentRef.current[checkpoint.parentThreadId] = [...pending, checkpoint];
  }, []);

  const flushParent = useCallback(
    async (parentThreadId: string) => {
      if (deliveryInFlightByParentRef.current[parentThreadId]) {
        return;
      }
      const turnId = activeTurnIdByThreadRef.current[parentThreadId] ?? null;
      const isProcessing = threadStatusByIdRef.current[parentThreadId]?.isProcessing ?? false;
      const pending = pendingByParentRef.current[parentThreadId] ?? [];
      if (!turnId || !isProcessing || pending.length === 0) {
        return;
      }

      const eligiblePending =
        modeRef.current === "finalOnly"
          ? pending.filter((checkpoint) => checkpoint.kind === "final")
          : pending;
      if (eligiblePending.length === 0) {
        pendingByParentRef.current[parentThreadId] = [];
        return;
      }

      const now = Date.now();
      const hasFinal = eligiblePending.some((checkpoint) => checkpoint.kind === "final");
      const throttleMs = checkpointThrottleMs(modeRef.current);
      const elapsed = now - (lastDeliveredAtByParentRef.current[parentThreadId] ?? 0);
      if (!hasFinal && elapsed < throttleMs) {
        if (!flushTimersRef.current[parentThreadId]) {
          flushTimersRef.current[parentThreadId] = setTimeout(() => {
            delete flushTimersRef.current[parentThreadId];
            void flushParent(parentThreadId);
          }, throttleMs - elapsed);
        }
        return;
      }

      deliveryInFlightByParentRef.current[parentThreadId] = true;
      const batch = [...eligiblePending].sort((left, right) => left.sequence - right.sequence);
      pendingByParentRef.current[parentThreadId] = [];
      const text = batch
        .map((checkpoint) =>
          buildCheckpointInjection(
            checkpoint,
            getChildName?.(checkpoint.workspaceId, checkpoint.childThreadId),
          ),
        )
        .join("\n\n");
      try {
        await steerTurn(batch[0].workspaceId, parentThreadId, turnId, text);
        batch.forEach((checkpoint) => deliveredIdsRef.current.add(checkpoint.id));
        lastDeliveredAtByParentRef.current[parentThreadId] = Date.now();
        onStatusChange?.(
          batch[0].workspaceId,
          parentThreadId,
          "delivered",
          batch.length,
        );
        emitDebug("delivered", {
          parentThreadId,
          turnId,
          checkpointIds: batch.map((checkpoint) => checkpoint.id),
        });
      } catch (error) {
        const message = errorMessage(error);
        const staleTurn = isStaleTurnError(message);
        const retryBatch = batch
          .map((checkpoint) => ({
            ...checkpoint,
            attempts: checkpoint.attempts + 1,
            lastError: message,
          }))
          .filter((checkpoint) => staleTurn || checkpoint.attempts < MAX_DELIVERY_ATTEMPTS);
        pendingByParentRef.current[parentThreadId] = [
          ...retryBatch,
          ...(pendingByParentRef.current[parentThreadId] ?? []),
        ];
        onStatusChange?.(
          batch[0].workspaceId,
          parentThreadId,
          staleTurn ? "pending" : "failed",
          0,
        );
        if (!staleTurn && retryBatch.length > 0 && !flushTimersRef.current[parentThreadId]) {
          const retryDelayMs = Math.min(4_000, 1_000 * retryBatch[0].attempts);
          flushTimersRef.current[parentThreadId] = setTimeout(() => {
            delete flushTimersRef.current[parentThreadId];
            void flushParent(parentThreadId);
          }, retryDelayMs);
        }
        emitDebug(staleTurn ? "queued" : "failed", {
          parentThreadId,
          turnId,
          error: message,
          checkpointIds: batch.map((checkpoint) => checkpoint.id),
        });
      } finally {
        deliveryInFlightByParentRef.current[parentThreadId] = false;
      }
    },
    [
      activeTurnIdByThreadRef,
      emitDebug,
      getChildName,
      onStatusChange,
      threadStatusByIdRef,
    ],
  );

  const submitCheckpoint = useCallback(
    (checkpoint: SubagentCheckpoint | null) => {
      if (!checkpoint || deliveredIdsRef.current.has(checkpoint.id)) {
        return;
      }
      enqueue(checkpoint);
      const turnId = activeTurnIdByThreadRef.current[checkpoint.parentThreadId] ?? null;
      const isProcessing =
        threadStatusByIdRef.current[checkpoint.parentThreadId]?.isProcessing ?? false;
      if (!turnId || !isProcessing) {
        onStatusChange?.(
          checkpoint.workspaceId,
          checkpoint.parentThreadId,
          "pending",
          0,
        );
      }
      void flushParent(checkpoint.parentThreadId);
    },
    [
      activeTurnIdByThreadRef,
      enqueue,
      flushParent,
      onStatusChange,
      threadStatusByIdRef,
    ],
  );

  const onAgentMessageCompleted = useCallback(
    (event: AgentMessageCompletedEvent) => {
      const parentThreadId = threadParentByIdRef.current[event.threadId];
      if (!parentThreadId) {
        return;
      }
      const childTurnId = activeTurnByChildRef.current[event.threadId] ?? null;
      latestAgentMessageRef.current[event.threadId] = { ...event, turnId: childTurnId };
      const turnKey = `${event.threadId}:${childTurnId ?? "pending"}`;
      const progressCount = progressCountByTurnRef.current[turnKey] ?? 0;
      if (!shouldCreateCheckpoint({ mode: modeRef.current, kind: "progress", progressCount })) {
        return;
      }
      const sequence = (sequenceByChildRef.current[event.threadId] ?? 0) + 1;
      sequenceByChildRef.current[event.threadId] = sequence;
      progressCountByTurnRef.current[turnKey] = progressCount + 1;
      submitCheckpoint(
        createSubagentCheckpoint({
          workspaceId: event.workspaceId,
          parentThreadId,
          childThreadId: event.threadId,
          childTurnId,
          sourceItemId: event.itemId,
          kind: "progress",
          text: event.text,
          sequence,
        }),
      );
    },
    [submitCheckpoint, threadParentByIdRef],
  );

  const onTurnStarted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      activeTurnByChildRef.current[threadId] = turnId;
      void flushParent(threadId);
      emitDebug("turn-started", { workspaceId, threadId, turnId });
    },
    [emitDebug, flushParent],
  );

  const onTurnCompleted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      const parentThreadId = threadParentByIdRef.current[threadId];
      const latest = latestAgentMessageRef.current[threadId];
      activeTurnByChildRef.current[threadId] = null;
      if (!parentThreadId || !latest || (latest.turnId && latest.turnId !== turnId)) {
        return;
      }
      const sequence = (sequenceByChildRef.current[threadId] ?? 0) + 1;
      sequenceByChildRef.current[threadId] = sequence;
      submitCheckpoint(
        createSubagentCheckpoint({
          workspaceId,
          parentThreadId,
          childThreadId: threadId,
          childTurnId: turnId,
          sourceItemId: latest.itemId,
          kind: "final",
          text: latest.text,
          sequence,
        }),
      );
    },
    [submitCheckpoint, threadParentByIdRef],
  );

  const clearThread = useCallback((threadId: string) => {
    delete pendingByParentRef.current[threadId];
    delete activeTurnByChildRef.current[threadId];
    delete latestAgentMessageRef.current[threadId];
    const timer = flushTimersRef.current[threadId];
    if (timer) {
      clearTimeout(timer);
      delete flushTimersRef.current[threadId];
    }
    Object.keys(pendingByParentRef.current).forEach((parentThreadId) => {
      pendingByParentRef.current[parentThreadId] = pendingByParentRef.current[
        parentThreadId
      ].filter((checkpoint) => checkpoint.childThreadId !== threadId);
    });
  }, []);

  const clearWorkspace = useCallback((workspaceId: string) => {
    Object.keys(pendingByParentRef.current).forEach((parentThreadId) => {
      pendingByParentRef.current[parentThreadId] = pendingByParentRef.current[
        parentThreadId
      ].filter((checkpoint) => checkpoint.workspaceId !== workspaceId);
    });
  }, []);

  useEffect(
    () => () => {
      Object.values(flushTimersRef.current).forEach(clearTimeout);
    },
    [],
  );

  return {
    onAgentMessageCompleted,
    onTurnStarted,
    onTurnCompleted,
    clearThread,
    clearWorkspace,
    flushParent,
  };
}

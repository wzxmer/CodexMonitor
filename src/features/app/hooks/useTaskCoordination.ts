import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  taskCoordinationListGroups,
  taskCoordinationCreateGroup,
  taskCoordinationAcquireClaim,
  taskCoordinationReleaseClaim,
  taskCoordinationHeartbeat,
  taskCoordinationDetectCandidates,
} from "@/services/tauri";
import type {
  TaskCoordinationGroup,
  TaskCoordinationThreadKey,
  TaskResourceClaim,
  ConflictResult,
  CandidateMatch,
} from "@/types";
import { pushErrorToast } from "@/services/toasts";

const SHADOW_STORAGE_KEY = "codexmonitor.coordinationShadowPairs";
const HEARTBEAT_INTERVAL_MS = 25_000;

type UseTaskCoordinationArgs = {
  enabled: boolean;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
};

type CoordinationState = {
  groups: TaskCoordinationGroup[];
  loading: boolean;
  error: string | null;
  createGroup: (group: TaskCoordinationGroup) => Promise<TaskCoordinationGroup | null>;
  acquireClaim: (
    groupId: string,
    owner: TaskCoordinationThreadKey,
    kind: "file" | "directory" | "logical",
    resourceKey: string,
    access: "read" | "write" | "exclusive",
  ) => Promise<TaskResourceClaim | ConflictResult | null>;
  releaseClaim: (groupId: string, claimId: string) => Promise<void>;
  refresh: () => Promise<void>;
  detectCandidates: (
    target: TaskCoordinationThreadKey,
    targetRepositoryId: string,
    targetTitle: string,
    knownThreads: Array<{ thread_key: TaskCoordinationThreadKey; repository_id: string; title: string }>,
  ) => Promise<CandidateMatch[]>;
};

function loadSeenPairs(): Set<string> {
  try {
    const raw = localStorage.getItem(SHADOW_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveSeenPairs(pairs: Set<string>) {
  try {
    localStorage.setItem(SHADOW_STORAGE_KEY, JSON.stringify([...pairs]));
  } catch {
    // ignore
  }
}

export function useTaskCoordination({
  enabled,
  activeWorkspaceId,
  activeThreadId,
}: UseTaskCoordinationArgs): CoordinationState {
  const [groups, setGroups] = useState<TaskCoordinationGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenPairsRef = useRef<Set<string>>(loadSeenPairs());
  const heartbeatTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await taskCoordinationListGroups();
      setGroups(Array.isArray(result) ? (result as TaskCoordinationGroup[]) : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      void refresh();
    }
  }, [enabled, refresh]);

  const createGroup = useCallback(
    async (group: TaskCoordinationGroup): Promise<TaskCoordinationGroup | null> => {
      try {
        const result = await taskCoordinationCreateGroup(group);
        await refresh();
        return result as TaskCoordinationGroup;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        pushErrorToast({ title: "Task coordination", message: msg });
        return null;
      }
    },
    [refresh],
  );

  const acquireClaim = useCallback(
    async (
      groupId: string,
      owner: TaskCoordinationThreadKey,
      kind: "file" | "directory" | "logical",
      resourceKey: string,
      access: "read" | "write" | "exclusive",
    ): Promise<TaskResourceClaim | ConflictResult | null> => {
      try {
        const result = await taskCoordinationAcquireClaim(
          groupId,
          owner,
          kind,
          resourceKey,
          access,
        );
        return result as TaskResourceClaim;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try {
          const conflict = JSON.parse(msg) as ConflictResult;
          pushErrorToast({
            title: "Task coordination",
            message: `Resource conflict: ${conflict.reason}`,
          });
          return conflict;
        } catch {
          setError(msg);
          pushErrorToast({ title: "Task coordination", message: msg });
          return null;
        }
      }
    },
    [],
  );

  const releaseClaim = useCallback(
    async (groupId: string, claimId: string): Promise<void> => {
      try {
        await taskCoordinationReleaseClaim(groupId, claimId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    },
    [],
  );

  const detectCandidates = useCallback(
    async (
      target: TaskCoordinationThreadKey,
      targetRepositoryId: string,
      targetTitle: string,
      knownThreads: Array<{
        thread_key: TaskCoordinationThreadKey;
        repository_id: string;
        title: string;
      }>,
    ): Promise<CandidateMatch[]> => {
      try {
        const results = await taskCoordinationDetectCandidates(
          target,
          targetRepositoryId,
          targetTitle,
          knownThreads,
          [...seenPairsRef.current],
        );
        // Shadow record: persist seen pairs for deduplication
        for (const match of results) {
          const pairKey =
            target.thread_id < match.thread_key.thread_id
              ? `${target.thread_id}::${match.thread_key.thread_id}`
              : `${match.thread_key.thread_id}::${target.thread_id}`;
          seenPairsRef.current.add(pairKey);
        }
        if (results.length > 0) {
          saveSeenPairs(seenPairsRef.current);
        }
        return results;
      } catch {
        return [];
      }
    },
    [],
  );

  // Heartbeat for active groups
  useEffect(() => {
    if (!enabled || !activeWorkspaceId || !activeThreadId) {
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      return;
    }

    const threadKey: TaskCoordinationThreadKey = {
      source: "local",
      workspace_id: activeWorkspaceId,
      thread_id: activeThreadId,
    };

    const beat = () => {
      for (const group of groups) {
        void taskCoordinationHeartbeat(group.id, threadKey).catch(() => {});
      }
    };

    beat();
    heartbeatTimerRef.current = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatTimerRef.current) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [enabled, activeWorkspaceId, activeThreadId, groups]);

  return useMemo(
    () => ({
      groups,
      loading,
      error,
      createGroup,
      acquireClaim,
      releaseClaim,
      refresh,
      detectCandidates,
    }),
    [groups, loading, error, createGroup, acquireClaim, releaseClaim, refresh, detectCandidates],
  );
}

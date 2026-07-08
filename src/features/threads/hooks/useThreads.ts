import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import * as Sentry from "@sentry/react";
import type {
  CollabAgentRef,
  CustomPromptOption,
  DebugEntry,
  ServiceTier,
  ThreadListSortKey,
  WorkspaceInfo,
} from "@/types";
import { CHAT_SCROLLBACK_DEFAULT } from "@utils/chatScrollback";
import { useAppServerEvents } from "@app/hooks/useAppServerEvents";
import { initialState, threadReducer } from "./useThreadsReducer";
import { useThreadStorage } from "./useThreadStorage";
import { useThreadLinking } from "./useThreadLinking";
import { useThreadEventHandlers } from "./useThreadEventHandlers";
import { useThreadActions } from "./useThreadActions";
import { useThreadMessaging } from "./useThreadMessaging";
import { useThreadApprovals } from "./useThreadApprovals";
import { useThreadAccountInfo } from "./useThreadAccountInfo";
import { useThreadRateLimits } from "./useThreadRateLimits";
import { useThreadSelectors } from "./useThreadSelectors";
import { useThreadStatus } from "./useThreadStatus";
import { useThreadStallWarnings } from "./useThreadStallWarnings";
import { useThreadUserInput } from "./useThreadUserInput";
import { useThreadTitleAutogeneration } from "./useThreadTitleAutogeneration";
import { useDetachedReviewTracking } from "./useDetachedReviewTracking";
import {
  archiveThread as archiveThreadService,
  listThreads as listThreadsService,
  readThread as readThreadService,
  setThreadName as setThreadNameService,
} from "@services/tauri";
import { getThreadTimestamp } from "@utils/threadItems";
import {
  makeCustomNameKey,
  saveCustomName,
} from "@threads/utils/threadStorage";
import {
  getParentThreadIdFromThread,
  shouldHideSubagentThreadFromSidebar,
} from "@threads/utils/threadRpc";
import {
  buildThreadSummaryFromThread,
  extractThreadFromResponse,
  getThreadDisplayTitle,
} from "@threads/utils/threadSummary";
import { getSubagentDescendantThreadIds } from "@threads/utils/subagentTree";
import {
  buildWorkspacePathLookup,
  getThreadListNextCursor,
  resolveWorkspaceIdForThreadPath,
} from "@threads/utils/threadActionHelpers";

type UseThreadsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  workspaces?: WorkspaceInfo[];
  onWorkspaceConnected: (id: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  ensureWorkspaceRuntimeCodexArgs?: (
    workspaceId: string,
    threadId: string | null,
  ) => Promise<void>;
  model?: string | null;
  effort?: string | null;
  serviceTier?: ServiceTier | null | undefined;
  collaborationMode?: Record<string, unknown> | null;
  accessMode?: "read-only" | "current" | "full-access";
  onSelectServiceTier?: (tier: ServiceTier | null | undefined) => void;
  reviewDeliveryMode?: "inline" | "detached";
  steerEnabled?: boolean;
  threadTitleAutogenerationEnabled?: boolean;
  chatHistoryScrollbackItems?: number | null;
  autoArchiveThreadsEnabled?: boolean;
  autoArchiveThreadsDays?: number;
  customPrompts?: CustomPromptOption[];
  onMessageActivity?: () => void;
  threadSortKey?: ThreadListSortKey;
  onThreadCodexMetadataDetected?: (
    workspaceId: string,
    threadId: string,
    metadata: { modelId: string | null; effort: string | null },
  ) => void;
};

function buildWorkspaceThreadKey(workspaceId: string, threadId: string) {
  return `${workspaceId}:${threadId}`;
}

const CASCADE_ARCHIVE_SKIP_TTL_MS = 120_000;
const AUTO_ARCHIVE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_ARCHIVE_PAGE_SIZE = 100;
const AUTO_ARCHIVE_MAX_PAGES_PER_WORKSPACE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
export function useThreads({
  activeWorkspace,
  workspaces = activeWorkspace ? [activeWorkspace] : [],
  onWorkspaceConnected,
  onDebug,
  ensureWorkspaceRuntimeCodexArgs,
  model,
  effort,
  serviceTier,
  collaborationMode,
  accessMode,
  onSelectServiceTier,
  reviewDeliveryMode = "inline",
  steerEnabled = false,
  threadTitleAutogenerationEnabled = false,
  chatHistoryScrollbackItems,
  autoArchiveThreadsEnabled = false,
  autoArchiveThreadsDays = 7,
  customPrompts = [],
  onMessageActivity,
  threadSortKey = "updated_at",
  onThreadCodexMetadataDetected,
}: UseThreadsOptions) {
  const maxItemsPerThread =
    chatHistoryScrollbackItems === undefined
      ? CHAT_SCROLLBACK_DEFAULT
      : chatHistoryScrollbackItems;

  const [state, dispatch] = useReducer(
    threadReducer,
    maxItemsPerThread,
    (initialMaxItemsPerThread) => ({
      ...initialState,
      maxItemsPerThread: initialMaxItemsPerThread,
    }),
  );
  useEffect(() => {
    dispatch({ type: "setMaxItemsPerThread", maxItemsPerThread });
  }, [dispatch, maxItemsPerThread]);
  const loadedThreadsRef = useRef<Record<string, boolean>>({});
  const replaceOnResumeRef = useRef<Record<string, boolean>>({});
  const pendingInterruptsRef = useRef<Set<string>>(new Set());
  const planByThreadRef = useRef(state.planByThread);
  const itemsByThreadRef = useRef(state.itemsByThread);
  const threadsByWorkspaceRef = useRef(state.threadsByWorkspace);
  const activeThreadIdByWorkspaceRef = useRef(state.activeThreadIdByWorkspace);
  const activeTurnIdByThreadRef = useRef(state.activeTurnIdByThread);
  const threadStatusByIdRef = useRef(state.threadStatusById);
  const subagentThreadByWorkspaceThreadRef = useRef<Record<string, true>>({});
  const threadParentByIdRef = useRef(state.threadParentById);
  const cascadeArchiveSkipRef = useRef<Record<string, number>>({});
  const subagentHydrationInFlightRef = useRef<Record<string, true>>({});
  const autoArchiveInFlightRef = useRef(false);
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  planByThreadRef.current = state.planByThread;
  itemsByThreadRef.current = state.itemsByThread;
  threadsByWorkspaceRef.current = state.threadsByWorkspace;
  activeThreadIdByWorkspaceRef.current = state.activeThreadIdByWorkspace;
  activeTurnIdByThreadRef.current = state.activeTurnIdByThread;
  threadStatusByIdRef.current = state.threadStatusById;
  threadParentByIdRef.current = state.threadParentById;
  const rateLimitsByWorkspaceRef = useRef(state.rateLimitsByWorkspace);
  rateLimitsByWorkspaceRef.current = state.rateLimitsByWorkspace;
  const { approvalAllowlistRef, handleApprovalDecision, handleApprovalRemember } =
    useThreadApprovals({ dispatch, onDebug });
  const { handleUserInputSubmit } = useThreadUserInput({ dispatch });
  const {
    customNamesRef,
    threadActivityRef,
    pinnedThreadsVersion,
    getCustomName,
    recordThreadActivity,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
  } = useThreadStorage();

  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const { activeThreadId, activeItems } = useThreadSelectors({
    activeWorkspaceId,
    activeThreadIdByWorkspace: state.activeThreadIdByWorkspace,
    itemsByThread: state.itemsByThread,
    threadsByWorkspace: state.threadsByWorkspace,
  });

  const getCurrentRateLimits = useCallback(
    (workspaceId: string) => rateLimitsByWorkspaceRef.current[workspaceId] ?? null,
    [],
  );

  const { refreshAccountRateLimits } = useThreadRateLimits({
    activeWorkspaceId,
    activeWorkspaceConnected: activeWorkspace?.connected,
    getCurrentRateLimits,
    dispatch,
    onDebug,
  });
  const { refreshAccountInfo } = useThreadAccountInfo({
    activeWorkspaceId,
    activeWorkspaceConnected: activeWorkspace?.connected,
    dispatch,
    onDebug,
  });

  const { markProcessing, markReviewing, setActiveTurnId } = useThreadStatus({
    dispatch,
  });

  const pushThreadErrorMessage = useCallback(
    (threadId: string, message: string) => {
      dispatch({
        type: "addAssistantMessage",
        threadId,
        text: message,
      });
      if (threadId !== activeThreadId) {
        dispatch({ type: "markUnread", threadId, hasUnread: true });
      }
    },
    [activeThreadId, dispatch],
  );

  const safeMessageActivity = useCallback(() => {
    try {
      void onMessageActivity?.();
    } catch {
      // Ignore refresh errors to avoid breaking the UI.
    }
  }, [onMessageActivity]);

  useThreadStallWarnings({
    threadStatusById: state.threadStatusById,
    pushThreadErrorMessage,
    safeMessageActivity,
  });

  const setThreadLoaded = useCallback((threadId: string, isLoaded: boolean) => {
    loadedThreadsRef.current[threadId] = isLoaded;
  }, []);

  const renameThread = useCallback(
    (workspaceId: string, threadId: string, newName: string) => {
      saveCustomName(workspaceId, threadId, newName);
      const key = makeCustomNameKey(workspaceId, threadId);
      customNamesRef.current[key] = newName;
      dispatch({ type: "setThreadName", workspaceId, threadId, name: newName });
      void Promise.resolve(
        setThreadNameService(workspaceId, threadId, newName),
      ).catch((error) => {
        onDebug?.({
          id: `${Date.now()}-client-thread-rename-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/name/set error",
          payload: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [customNamesRef, dispatch, onDebug],
  );

  const onSubagentThreadDetected = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!workspaceId || !threadId) {
        return;
      }
      subagentThreadByWorkspaceThreadRef.current[
        buildWorkspaceThreadKey(workspaceId, threadId)
      ] = true;
    },
    [],
  );

  const isSubagentThread = useCallback(
    (workspaceId: string, threadId: string) =>
      Boolean(
        subagentThreadByWorkspaceThreadRef.current[
          buildWorkspaceThreadKey(workspaceId, threadId)
        ],
      ),
    [],
  );

  const { applyCollabThreadLinks, applyCollabThreadLinksFromThread, updateThreadParent } =
    useThreadLinking({
      dispatch,
      threadParentById: state.threadParentById,
      onSubagentThreadDetected,
    });

  const handleWorkspaceConnected = useCallback(
    (workspaceId: string) => {
      onWorkspaceConnected(workspaceId);
      void refreshAccountRateLimits(workspaceId);
      void refreshAccountInfo(workspaceId);
    },
    [onWorkspaceConnected, refreshAccountRateLimits, refreshAccountInfo],
  );

  const handleAccountUpdated = useCallback(
    (workspaceId: string) => {
      void refreshAccountRateLimits(workspaceId);
      void refreshAccountInfo(workspaceId);
    },
    [refreshAccountRateLimits, refreshAccountInfo],
  );

  const isThreadHidden = useCallback(
    (workspaceId: string, threadId: string) =>
      Boolean(state.hiddenThreadIdsByWorkspace[workspaceId]?.[threadId]),
    [state.hiddenThreadIdsByWorkspace],
  );

  const getActiveTurnId = useCallback(
    (threadId: string) => activeTurnIdByThreadRef.current[threadId] ?? null,
    [],
  );

  const { registerDetachedReviewChild, handleReviewExited } =
    useDetachedReviewTracking({
      activeThreadId,
      dispatch,
      recordThreadActivity,
      safeMessageActivity,
      threadsByWorkspace: state.threadsByWorkspace,
      threadParentById: state.threadParentById,
      updateThreadParent,
    });

  const hydrateSubagentThreads = useCallback(
    async (workspaceId: string, receivers: CollabAgentRef[]) => {
      if (!workspaceId || receivers.length === 0) {
        return;
      }
      const uniqueThreadIds = Array.from(
        new Set(
          receivers
            .map((receiver) => receiver.threadId.trim())
            .filter((threadId) => threadId.length > 0),
        ),
      );
      if (uniqueThreadIds.length === 0) {
        return;
      }

      await Promise.all(
        uniqueThreadIds.map(async (threadId) => {
          const key = buildWorkspaceThreadKey(workspaceId, threadId);
          if (subagentHydrationInFlightRef.current[key]) {
            return;
          }
          const existingThread = threadsByWorkspaceRef.current[workspaceId]?.find(
            (thread) => thread.id === threadId,
          );
          if (existingThread?.subagentNickname && existingThread.subagentRole) {
            return;
          }

          subagentHydrationInFlightRef.current[key] = true;
          try {
            const response = await readThreadService(workspaceId, threadId);
            const thread = extractThreadFromResponse(response);
            if (!thread) {
              return;
            }
            const fallbackIndex =
              threadsByWorkspaceRef.current[workspaceId]?.length ?? 0;
            const summary = buildThreadSummaryFromThread({
              workspaceId,
              thread,
              fallbackIndex,
              getCustomName,
            });
            if (!summary) {
              return;
            }

            dispatch({ type: "ensureThread", workspaceId, threadId: summary.id });
            const displayTitle = getThreadDisplayTitle(thread);
            const customName = getCustomName(workspaceId, summary.id);
            if (displayTitle || customName) {
              dispatch({
                type: "setThreadName",
                workspaceId,
                threadId: summary.id,
                name: summary.name,
              });
            }
            dispatch({
              type: "mergeThreadSummary",
              workspaceId,
              threadId: summary.id,
              patch: {
                ...(summary.isSubagent ? { isSubagent: true } : {}),
                ...(summary.subagentNickname
                  ? { subagentNickname: summary.subagentNickname }
                  : {}),
                ...(summary.subagentRole ? { subagentRole: summary.subagentRole } : {}),
                ...(summary.createdAt !== undefined ? { createdAt: summary.createdAt } : {}),
              },
            });
            if (summary.updatedAt > 0) {
              dispatch({
                type: "setThreadTimestamp",
                workspaceId,
                threadId: summary.id,
                timestamp: summary.updatedAt,
              });
            }
            const parentThreadId = getParentThreadIdFromThread(thread);
            if (parentThreadId) {
              updateThreadParent(parentThreadId, [summary.id]);
            }
            if (summary.isSubagent) {
              onSubagentThreadDetected(workspaceId, summary.id);
            }
          } catch (error) {
            onDebug?.({
              id: `${Date.now()}-client-thread-read-error`,
              timestamp: Date.now(),
              source: "error",
              label: "thread/read error",
              payload: {
                workspaceId,
                threadId,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          } finally {
            delete subagentHydrationInFlightRef.current[key];
          }
        }),
      );
    },
    [dispatch, getCustomName, onDebug, onSubagentThreadDetected, updateThreadParent],
  );

  const { onUserMessageCreated } = useThreadTitleAutogeneration({
    enabled: threadTitleAutogenerationEnabled,
    itemsByThreadRef,
    threadsByWorkspaceRef,
    getCustomName,
    renameThread,
    onDebug,
  });

  const threadHandlers = useThreadEventHandlers({
    activeThreadId,
    dispatch,
    getItemsForThread: (threadId) => itemsByThreadRef.current[threadId] ?? [],
    planByThreadRef,
    getCurrentRateLimits,
    getCustomName,
    isThreadHidden,
    setThreadLoaded,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    getActiveTurnId,
    safeMessageActivity,
    recordThreadActivity,
    onUserMessageCreated,
    pushThreadErrorMessage,
    onDebug,
    onWorkspaceConnected: handleWorkspaceConnected,
    applyCollabThreadLinks,
    hydrateSubagentThreads,
    onReviewExited: handleReviewExited,
    approvalAllowlistRef,
    pendingInterruptsRef,
  });

  const handleAccountLoginCompleted = useCallback(
    (workspaceId: string) => {
      handleAccountUpdated(workspaceId);
    },
    [handleAccountUpdated],
  );

  const handleThreadStarted = useCallback(
    (workspaceId: string, thread: Record<string, unknown>) => {
      threadHandlers.onThreadStarted(workspaceId, thread);
      const threadId = String(thread.id ?? "").trim();
      if (!threadId) {
        return;
      }
      const parentThreadId = getParentThreadIdFromThread(thread);
      if (!parentThreadId) {
        return;
      }
      updateThreadParent(parentThreadId, [threadId]);
      onSubagentThreadDetected(workspaceId, threadId);
    },
    [onSubagentThreadDetected, threadHandlers, updateThreadParent],
  );

  const handleThreadArchived = useCallback(
    (workspaceId: string, threadId: string) => {
      if (!workspaceId || !threadId) {
        return;
      }
      threadHandlers.onThreadArchived?.(workspaceId, threadId);
      unpinThread(workspaceId, threadId);

      const skipKey = buildWorkspaceThreadKey(workspaceId, threadId);
      const skipAt = cascadeArchiveSkipRef.current[skipKey] ?? null;
      if (skipAt !== null) {
        delete cascadeArchiveSkipRef.current[skipKey];
        if (
          skipAt > 0 &&
          Date.now() - skipAt >= 0 &&
          Date.now() - skipAt < CASCADE_ARCHIVE_SKIP_TTL_MS
        ) {
          return;
        }
      }

      const descendants = getSubagentDescendantThreadIds({
        rootThreadId: threadId,
        threadParentById: threadParentByIdRef.current,
        isSubagentThread: (candidateId) =>
          isSubagentThread(workspaceId, candidateId),
      });
      if (descendants.length === 0) {
        return;
      }

      onDebug?.({
        id: `${Date.now()}-client-thread-archive-cascade`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/archive cascade",
        payload: { workspaceId, rootThreadId: threadId, descendantCount: descendants.length },
      });

      const now = Date.now();
      Object.entries(cascadeArchiveSkipRef.current).forEach(([key, timestamp]) => {
        if (now - timestamp >= CASCADE_ARCHIVE_SKIP_TTL_MS) {
          delete cascadeArchiveSkipRef.current[key];
        }
      });

      void (async () => {
        for (const descendantId of descendants) {
          const descendantKey = buildWorkspaceThreadKey(workspaceId, descendantId);
          cascadeArchiveSkipRef.current[descendantKey] = Date.now();
          try {
            await archiveThreadService(workspaceId, descendantId);
          } catch (error) {
            delete cascadeArchiveSkipRef.current[descendantKey];
            onDebug?.({
              id: `${Date.now()}-client-thread-archive-cascade-error`,
              timestamp: Date.now(),
              source: "error",
              label: "thread/archive cascade error",
              payload: {
                workspaceId,
                rootThreadId: threadId,
                threadId: descendantId,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }
      })();
    },
    [isSubagentThread, onDebug, threadHandlers, unpinThread],
  );

  const handleThreadUnarchived = useCallback(
    (workspaceId: string, threadId: string) => {
      threadHandlers.onThreadUnarchived?.(workspaceId, threadId);
    },
    [threadHandlers],
  );

  const handleTurnStarted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      threadHandlers.onTurnStarted?.(workspaceId, threadId, turnId);
    },
    [threadHandlers],
  );

  const handleTurnCompleted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      threadHandlers.onTurnCompleted?.(workspaceId, threadId, turnId);
    },
    [threadHandlers],
  );

  const handleTurnError = useCallback(
    (
      workspaceId: string,
      threadId: string,
      turnId: string,
      payload: { message: string; willRetry: boolean },
    ) => {
      threadHandlers.onTurnError?.(workspaceId, threadId, turnId, payload);
    },
    [threadHandlers],
  );

  const handlers = useMemo(
    () => ({
      ...threadHandlers,
      onThreadStarted: handleThreadStarted,
      onThreadArchived: handleThreadArchived,
      onThreadUnarchived: handleThreadUnarchived,
      onTurnStarted: handleTurnStarted,
      onTurnCompleted: handleTurnCompleted,
      onTurnError: handleTurnError,
      onAccountUpdated: handleAccountUpdated,
      onAccountLoginCompleted: handleAccountLoginCompleted,
    }),
    [
      threadHandlers,
      handleThreadStarted,
      handleThreadArchived,
      handleThreadUnarchived,
      handleTurnStarted,
      handleTurnCompleted,
      handleTurnError,
      handleAccountUpdated,
      handleAccountLoginCompleted,
    ],
  );

  useAppServerEvents(handlers);

  const {
    startThreadForWorkspace: startThreadForWorkspaceInternal,
    forkThreadForWorkspace,
    resumeThreadForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    listThreadsForWorkspaces,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    archiveThread,
  } = useThreadActions({
    dispatch,
    itemsByThread: state.itemsByThread,
    threadsByWorkspace: state.threadsByWorkspace,
    activeThreadIdByWorkspace: state.activeThreadIdByWorkspace,
    activeTurnIdByThread: state.activeTurnIdByThread,
    threadParentById: state.threadParentById,
    threadListCursorByWorkspace: state.threadListCursorByWorkspace,
    threadStatusById: state.threadStatusById,
    threadSortKey,
    onDebug,
    getCustomName,
    threadActivityRef,
    loadedThreadsRef,
    replaceOnResumeRef,
    applyCollabThreadLinksFromThread,
    updateThreadParent,
    onSubagentThreadDetected,
    onThreadCodexMetadataDetected,
  });

  useEffect(() => {
    if (!autoArchiveThreadsEnabled) {
      return;
    }
    const normalizedDays = [3, 5, 7, 15, 30].includes(autoArchiveThreadsDays)
      ? autoArchiveThreadsDays
      : 7;
    const connectedWorkspaces = workspaces.filter(
      (workspace) => workspace.id && workspace.connected,
    );
    if (connectedWorkspaces.length === 0) {
      return;
    }
    let cancelled = false;
    const workspacePathLookup = buildWorkspacePathLookup(connectedWorkspaces);
    const workspaceIds = new Set(connectedWorkspaces.map((workspace) => workspace.id));

    const runAutoArchive = async () => {
      if (autoArchiveInFlightRef.current || cancelled) {
        return;
      }
      autoArchiveInFlightRef.current = true;
      const cutoff = Date.now() - normalizedDays * DAY_MS;
      let archivedCount = 0;
      try {
        for (const workspace of connectedWorkspaces) {
          if (cancelled) {
            break;
          }
          let cursor: string | null = null;
          let pagesFetched = 0;
          do {
            pagesFetched += 1;
            const response = (await listThreadsService(
              workspace.id,
              cursor,
              AUTO_ARCHIVE_PAGE_SIZE,
              "updated_at",
            )) as Record<string, unknown>;
            const result = (response.result ?? response) as Record<string, unknown>;
            const data = Array.isArray(result.data)
              ? (result.data as Record<string, unknown>[])
              : [];
            cursor = getThreadListNextCursor(result);
            for (const thread of data) {
              if (cancelled) {
                break;
              }
              const threadId = String(thread.id ?? "");
              if (!threadId || shouldHideSubagentThreadFromSidebar(thread.source)) {
                continue;
              }
              const updatedAt = getThreadTimestamp(thread);
              if (!updatedAt || updatedAt > cutoff) {
                continue;
              }
              const owningWorkspaceId = resolveWorkspaceIdForThreadPath(
                String(thread.cwd ?? ""),
                workspacePathLookup,
                workspaceIds,
              );
              if (owningWorkspaceId !== workspace.id) {
                continue;
              }
              if (activeThreadIdByWorkspaceRef.current[workspace.id] === threadId) {
                continue;
              }
              if (
                threadStatusByIdRef.current[threadId]?.isProcessing ||
                activeTurnIdByThreadRef.current[threadId]
              ) {
                continue;
              }
              if (isThreadPinned(workspace.id, threadId)) {
                continue;
              }
              await archiveThread(workspace.id, threadId);
              archivedCount += 1;
            }
            if (pagesFetched >= AUTO_ARCHIVE_MAX_PAGES_PER_WORKSPACE) {
              break;
            }
          } while (cursor && !cancelled);
        }
        if (archivedCount > 0) {
          onDebug?.({
            id: `${Date.now()}-client-auto-archive-threads`,
            timestamp: Date.now(),
            source: "client",
            label: "thread/auto-archive",
            payload: { archivedCount, days: normalizedDays },
          });
        }
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-auto-archive-threads-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/auto-archive error",
          payload: error instanceof Error ? error.message : String(error),
        });
      } finally {
        autoArchiveInFlightRef.current = false;
      }
    };

    void runAutoArchive();
    const interval = window.setInterval(runAutoArchive, AUTO_ARCHIVE_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    archiveThread,
    autoArchiveThreadsDays,
    autoArchiveThreadsEnabled,
    isThreadPinned,
    onDebug,
    workspaces,
  ]);

  const ensureWorkspaceRuntimeCodexArgsBestEffort = useCallback(
    async (workspaceId: string, threadId: string | null, phase: string) => {
      if (!ensureWorkspaceRuntimeCodexArgs) {
        return;
      }
      try {
        await ensureWorkspaceRuntimeCodexArgs(workspaceId, threadId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onDebug?.({
          id: `${Date.now()}-client-thread-runtime-codex-args-sync-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/runtime-codex-args sync error",
          payload: `${phase}: ${detail}`,
        });
      }
    },
    [ensureWorkspaceRuntimeCodexArgs, onDebug],
  );

  const getWorkspaceThreadIds = useCallback(
    (workspaceId: string, includeThreadId?: string) => {
      const visibleThreadIds = (state.threadsByWorkspace[workspaceId] ?? [])
        .map((thread) => String(thread.id ?? "").trim())
        .filter((threadId) => threadId.length > 0);
      const hiddenThreadIds = Object.keys(
        state.hiddenThreadIdsByWorkspace[workspaceId] ?? {},
      );
      const activeThreadIdForWorkspace =
        state.activeThreadIdByWorkspace[workspaceId] ?? null;
      const threadIds = new Set([...visibleThreadIds, ...hiddenThreadIds]);
      if (activeThreadIdForWorkspace) {
        threadIds.add(activeThreadIdForWorkspace);
      }
      if (includeThreadId) {
        threadIds.add(includeThreadId);
      }
      return Array.from(threadIds);
    },
    [
      state.activeThreadIdByWorkspace,
      state.hiddenThreadIdsByWorkspace,
      state.threadsByWorkspace,
    ],
  );

  const hasProcessingThreadInWorkspace = useCallback(
    (workspaceId: string, excludedThreadId?: string) =>
      getWorkspaceThreadIds(workspaceId, excludedThreadId).some(
        (candidateThreadId) =>
          candidateThreadId !== excludedThreadId &&
          Boolean(state.threadStatusById[candidateThreadId]?.isProcessing),
      ),
    [getWorkspaceThreadIds, state.threadStatusById],
  );

  const shouldPreflightRuntimeCodexArgsForSend = useCallback(
    (workspaceId: string, threadId: string) =>
      !hasProcessingThreadInWorkspace(workspaceId, threadId),
    [hasProcessingThreadInWorkspace],
  );

  const startThreadForWorkspace = useCallback(
    async (workspaceId: string, options?: { activate?: boolean }) => {
      await ensureWorkspaceRuntimeCodexArgsBestEffort(workspaceId, null, "start");
      return startThreadForWorkspaceInternal(workspaceId, options);
    },
    [ensureWorkspaceRuntimeCodexArgsBestEffort, startThreadForWorkspaceInternal],
  );

  const startThread = useCallback(async () => {
    if (!activeWorkspaceId) {
      return null;
    }
    return startThreadForWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId, startThreadForWorkspace]);

  const ensureThreadForActiveWorkspace = useCallback(async () => {
    if (!activeWorkspace) {
      return null;
    }
    let threadId = activeThreadId;
    if (!threadId) {
      threadId = await startThreadForWorkspace(activeWorkspace.id);
      if (!threadId) {
        return null;
      }
    } else if (!loadedThreadsRef.current[threadId]) {
      await ensureWorkspaceRuntimeCodexArgsBestEffort(
        activeWorkspace.id,
        threadId,
        "resume",
      );
      await resumeThreadForWorkspace(activeWorkspace.id, threadId);
    }
    return threadId;
  }, [
    activeWorkspace,
    activeThreadId,
    ensureWorkspaceRuntimeCodexArgsBestEffort,
    resumeThreadForWorkspace,
    startThreadForWorkspace,
  ]);

  const ensureThreadForWorkspace = useCallback(
    async (workspaceId: string) => {
      const currentActiveThreadId = state.activeThreadIdByWorkspace[workspaceId] ?? null;
      const shouldActivate = workspaceId === activeWorkspaceId;
      let threadId = currentActiveThreadId;
      if (!threadId) {
        threadId = await startThreadForWorkspace(workspaceId, {
          activate: shouldActivate,
        });
        if (!threadId) {
          return null;
        }
      } else if (!loadedThreadsRef.current[threadId]) {
        await ensureWorkspaceRuntimeCodexArgsBestEffort(workspaceId, threadId, "resume");
        await resumeThreadForWorkspace(workspaceId, threadId);
      }
      if (shouldActivate && currentActiveThreadId !== threadId) {
        dispatch({ type: "setActiveThreadId", workspaceId, threadId });
      }
      return threadId;
    },
    [
      activeWorkspaceId,
      dispatch,
      ensureWorkspaceRuntimeCodexArgsBestEffort,
      loadedThreadsRef,
      resumeThreadForWorkspace,
      startThreadForWorkspace,
      state.activeThreadIdByWorkspace,
    ],
  );

  const {
    interruptTurn,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startUncommittedReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
    startFast,
    startStatus,
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
  } = useThreadMessaging({
    activeWorkspace,
    activeThreadId,
    accessMode,
    model,
    effort,
    serviceTier,
    collaborationMode,
    onSelectServiceTier,
    reviewDeliveryMode,
    steerEnabled,
    customPrompts,
    ensureWorkspaceRuntimeCodexArgs,
    shouldPreflightRuntimeCodexArgsForSend,
    threadStatusById: state.threadStatusById,
    activeTurnIdByThread: state.activeTurnIdByThread,
    tokenUsageByThread: state.tokenUsageByThread,
    rateLimitsByWorkspace: state.rateLimitsByWorkspace,
    pendingInterruptsRef,
    dispatch,
    getCustomName,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    recordThreadActivity,
    safeMessageActivity,
    onDebug,
    pushThreadErrorMessage,
    ensureThreadForActiveWorkspace,
    ensureThreadForWorkspace,
    refreshThread,
    forkThreadForWorkspace,
    updateThreadParent,
    registerDetachedReviewChild,
    renameThread,
  });

  const hasLocalThreadSnapshot = useCallback(
    (threadId: string | null) => {
      if (!threadId) {
        return false;
      }
      return (
        loadedThreadsRef.current[threadId] === true ||
        (itemsByThreadRef.current[threadId]?.length ?? 0) > 0
      );
    },
    [itemsByThreadRef, loadedThreadsRef],
  );

  const setActiveThreadId = useCallback(
    (threadId: string | null, workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      const currentThreadId = state.activeThreadIdByWorkspace[targetId] ?? null;
      dispatch({ type: "setActiveThreadId", workspaceId: targetId, threadId });
      if (threadId && currentThreadId !== threadId) {
        Sentry.metrics.count("thread_switched", 1, {
          attributes: {
            workspace_id: targetId,
            thread_id: threadId,
            reason: "select",
          },
        });
      }
      if (threadId) {
        void (async () => {
          const hasLocalSnapshot = hasLocalThreadSnapshot(threadId);
          if (hasLocalSnapshot) {
            loadedThreadsRef.current[threadId] = true;
            return;
          }
          const hasActiveTurnInWorkspace = hasProcessingThreadInWorkspace(targetId);
          if (!hasActiveTurnInWorkspace) {
            await ensureWorkspaceRuntimeCodexArgsBestEffort(targetId, threadId, "resume");
          }
          await resumeThreadForWorkspace(targetId, threadId);
        })();
      }
    },
    [
      activeWorkspaceId,
      ensureWorkspaceRuntimeCodexArgsBestEffort,
      hasLocalThreadSnapshot,
      hasProcessingThreadInWorkspace,
      loadedThreadsRef,
      resumeThreadForWorkspace,
      state.activeThreadIdByWorkspace,
    ],
  );

  const removeThread = useCallback(
    (workspaceId: string, threadId: string) => {
      unpinThread(workspaceId, threadId);
      dispatch({ type: "removeThread", workspaceId, threadId });
      void archiveThread(workspaceId, threadId);
    },
    [archiveThread, unpinThread],
  );

  return {
    activeThreadId,
    setActiveThreadId,
    hasLocalThreadSnapshot,
    activeItems,
    approvals: state.approvals,
    userInputRequests: state.userInputRequests,
    threadsByWorkspace: state.threadsByWorkspace,
    threadParentById: state.threadParentById,
    isSubagentThread,
    threadStatusById: state.threadStatusById,
    threadResumeLoadingById: state.threadResumeLoadingById,
    threadListLoadingByWorkspace: state.threadListLoadingByWorkspace,
    threadListPagingByWorkspace: state.threadListPagingByWorkspace,
    threadListCursorByWorkspace: state.threadListCursorByWorkspace,
    activeTurnIdByThread: state.activeTurnIdByThread,
    turnDiffByThread: state.turnDiffByThread,
    tokenUsageByThread: state.tokenUsageByThread,
    rateLimitsByWorkspace: state.rateLimitsByWorkspace,
    accountByWorkspace: state.accountByWorkspace,
    planByThread: state.planByThread,
    interruptedThreadById: state.interruptedThreadById,
    lastAgentMessageByThread: state.lastAgentMessageByThread,
    pinnedThreadsVersion,
    refreshAccountRateLimits,
    refreshAccountInfo,
    interruptTurn,
    removeThread,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    renameThread,
    startThread,
    startThreadForWorkspace,
    forkThreadForWorkspace,
    listThreadsForWorkspaces,
    listThreadsForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    loadOlderThreadsForWorkspace,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startUncommittedReview,
    startResume,
    startCompact,
    startApps,
    startMcp,
    startFast,
    startStatus,
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
    handleApprovalDecision,
    handleApprovalRemember,
    handleUserInputSubmit,
  };
}

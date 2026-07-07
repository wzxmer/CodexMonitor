import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppMention,
  ComposerSendIntent,
  ComposerTriggerMode,
  FollowUpMessageBehavior,
  QueuedMessage,
  SendMessageResult,
  WorkspaceInfo,
} from "@/types";

type UseQueuedSendOptions = {
  activeThreadId: string | null;
  activeTurnId: string | null;
  isProcessing: boolean;
  isReviewing: boolean;
  queueFlushPaused?: boolean;
  steerEnabled: boolean;
  followUpMessageBehavior: FollowUpMessageBehavior;
  composerTriggerMode?: ComposerTriggerMode;
  appsEnabled: boolean;
  activeWorkspace: WorkspaceInfo | null;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  sendUserMessage: (
    text: string,
    images?: string[],
    appMentions?: AppMention[],
    options?: { sendIntent?: ComposerSendIntent; replaceMessageId?: string },
  ) => Promise<SendMessageResult>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    text: string,
    images?: string[],
  ) => Promise<void | SendMessageResult>;
  startFork: (text: string) => Promise<void>;
  startReview: (text: string) => Promise<void>;
  startResume: (text: string) => Promise<void>;
  startCompact: (text: string) => Promise<void>;
  startApps: (text: string) => Promise<void>;
  startMcp: (text: string) => Promise<void>;
  startFast: (text: string) => Promise<void>;
  startStatus: (text: string) => Promise<void>;
  clearActiveImages: () => void;
};

type UseQueuedSendResult = {
  queuedByThread: Record<string, QueuedMessage[]>;
  activeQueue: QueuedMessage[];
  handleSend: (
    text: string,
    images?: string[],
    appMentions?: AppMention[],
    submitIntent?: ComposerSendIntent,
    options?: { replaceMessageId?: string },
  ) => Promise<void>;
  queueMessage: (
    text: string,
    images?: string[],
    appMentions?: AppMention[],
  ) => Promise<void>;
  removeQueuedMessage: (threadId: string, messageId: string) => void;
  clearQueuedMessages: (threadId?: string | null) => void;
  steerQueuedMessage: (messageId: string) => Promise<void>;
};

type SlashCommandKind =
  | "apps"
  | "compact"
  | "fast"
  | "fork"
  | "mcp"
  | "new"
  | "resume"
  | "review"
  | "status";

function buildCommandRegex(trigger: string, command: SlashCommandKind) {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}${command}\\b`, "i");
}

function parseSlashCommand(
  text: string,
  appsEnabled: boolean,
  composerTriggerMode: ComposerTriggerMode = "default",
): SlashCommandKind | null {
  const trigger = composerTriggerMode === "swap-slash-at" ? "@" : "/";
  if (appsEnabled && buildCommandRegex(trigger, "apps").test(text)) {
    return "apps";
  }
  if (buildCommandRegex(trigger, "fork").test(text)) {
    return "fork";
  }
  if (buildCommandRegex(trigger, "fast").test(text)) {
    return "fast";
  }
  if (buildCommandRegex(trigger, "mcp").test(text)) {
    return "mcp";
  }
  if (buildCommandRegex(trigger, "review").test(text)) {
    return "review";
  }
  if (buildCommandRegex(trigger, "compact").test(text)) {
    return "compact";
  }
  if (buildCommandRegex(trigger, "new").test(text)) {
    return "new";
  }
  if (buildCommandRegex(trigger, "resume").test(text)) {
    return "resume";
  }
  if (buildCommandRegex(trigger, "status").test(text)) {
    return "status";
  }
  return null;
}

export function useQueuedSend({
  activeThreadId,
  activeTurnId,
  isProcessing,
  isReviewing,
  queueFlushPaused = false,
  steerEnabled,
  followUpMessageBehavior,
  composerTriggerMode = "default",
  appsEnabled,
  activeWorkspace,
  connectWorkspace,
  startThreadForWorkspace,
  sendUserMessage,
  sendUserMessageToThread,
  startFork,
  startReview,
  startResume,
  startCompact,
  startApps,
  startMcp,
  startFast,
  startStatus,
  clearActiveImages,
}: UseQueuedSendOptions): UseQueuedSendResult {
  const [queuedByThread, setQueuedByThread] = useState<
    Record<string, QueuedMessage[]>
  >({});
  const [inFlightByThread, setInFlightByThread] = useState<
    Record<string, QueuedMessage | null>
  >({});
  const [hasStartedByThread, setHasStartedByThread] = useState<
    Record<string, boolean>
  >({});
  const queueCancelGenerationByThread = useRef<Record<string, number>>({});

  const activeQueue = useMemo(
    () => (activeThreadId ? queuedByThread[activeThreadId] ?? [] : []),
    [activeThreadId, queuedByThread],
  );

  const enqueueMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] ?? []), item],
    }));
  }, []);

  const removeQueuedMessage = useCallback(
    (threadId: string, messageId: string) => {
      setQueuedByThread((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] ?? []).filter(
          (entry) => entry.id !== messageId,
        ),
      }));
    },
    [],
  );

  const clearQueuedMessages = useCallback((threadId?: string | null) => {
    if (!threadId) {
      return;
    }
    queueCancelGenerationByThread.current[threadId] =
      (queueCancelGenerationByThread.current[threadId] ?? 0) + 1;
    setQueuedByThread((prev) => {
      if (!prev[threadId]?.length) {
        return prev;
      }
      const { [threadId]: _, ...rest } = prev;
      return rest;
    });
    setInFlightByThread((prev) => {
      if (!prev[threadId]) {
        return prev;
      }
      return { ...prev, [threadId]: null };
    });
    setHasStartedByThread((prev) => {
      if (!prev[threadId]) {
        return prev;
      }
      return { ...prev, [threadId]: false };
    });
  }, []);

  const prependQueuedMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [item, ...(prev[threadId] ?? [])],
    }));
  }, []);

  const createQueuedItem = useCallback(
    (text: string, images: string[], appMentions: AppMention[]): QueuedMessage => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: Date.now(),
      images,
      ...(appMentions.length > 0 ? { appMentions } : {}),
    }),
    [],
  );

  const runSlashCommand = useCallback(
    async (command: SlashCommandKind, trimmed: string) => {
      if (command === "fork") {
        await startFork(trimmed);
        return;
      }
      if (command === "review") {
        await startReview(trimmed);
        return;
      }
      if (command === "resume") {
        await startResume(trimmed);
        return;
      }
      if (command === "compact") {
        await startCompact(trimmed);
        return;
      }
      if (command === "apps") {
        await startApps(trimmed);
        return;
      }
      if (command === "mcp") {
        await startMcp(trimmed);
        return;
      }
      if (command === "fast") {
        await startFast(trimmed);
        return;
      }
      if (command === "status") {
        await startStatus(trimmed);
        return;
      }
      if (command === "new" && activeWorkspace) {
        const threadId = await startThreadForWorkspace(activeWorkspace.id);
        const trigger = composerTriggerMode === "swap-slash-at" ? "@" : "/";
        const rest = trimmed.replace(buildCommandRegex(trigger, "new"), "").trim();
        if (threadId && rest) {
          await sendUserMessageToThread(activeWorkspace, threadId, rest, []);
        }
      }
    },
    [
      activeWorkspace,
      sendUserMessageToThread,
      startFork,
      startReview,
      startResume,
      startCompact,
      startApps,
      startMcp,
      startFast,
      startStatus,
      startThreadForWorkspace,
      composerTriggerMode,
    ],
  );

  const handleSend = useCallback(
    async (
      text: string,
      images: string[] = [],
      appMentions: AppMention[] = [],
      submitIntent: ComposerSendIntent = "default",
      options?: { replaceMessageId?: string },
    ) => {
      const trimmed = text.trim();
      const command = parseSlashCommand(trimmed, appsEnabled, composerTriggerMode);
      const nextImages = command ? [] : images;
      const nextMentions = command ? [] : appMentions;
      const canSteerCurrentTurn =
        isProcessing && steerEnabled && Boolean(activeTurnId);
      const effectiveIntent: ComposerSendIntent = !isProcessing
        ? "default"
        : submitIntent === "queue"
          ? "queue"
          : submitIntent === "steer"
            ? canSteerCurrentTurn
              ? "steer"
              : "queue"
            : followUpMessageBehavior === "steer" && canSteerCurrentTurn
              ? "steer"
              : "queue";
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (isProcessing && activeThreadId && effectiveIntent === "queue") {
        const item = createQueuedItem(trimmed, nextImages, nextMentions);
        enqueueMessage(activeThreadId, item);
        clearActiveImages();
        return;
      }
      if (activeWorkspace && !activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      if (command) {
        await runSlashCommand(command, trimmed);
        clearActiveImages();
        return;
      }
      const sendResult =
        nextMentions.length > 0
          ? await sendUserMessage(trimmed, nextImages, nextMentions, {
              sendIntent: effectiveIntent,
              replaceMessageId: options?.replaceMessageId,
            })
          : await sendUserMessage(trimmed, nextImages, undefined, {
              sendIntent: effectiveIntent,
              replaceMessageId: options?.replaceMessageId,
            });
      if (
        sendResult.status === "steer_failed" &&
        activeThreadId &&
        isProcessing
      ) {
        enqueueMessage(activeThreadId, createQueuedItem(trimmed, nextImages, nextMentions));
      }
      clearActiveImages();
    },
    [
      activeThreadId,
      appsEnabled,
      composerTriggerMode,
      activeWorkspace,
      clearActiveImages,
      connectWorkspace,
      createQueuedItem,
      enqueueMessage,
      activeTurnId,
      followUpMessageBehavior,
      isProcessing,
      isReviewing,
      steerEnabled,
      runSlashCommand,
      sendUserMessage,
    ],
  );

  const queueMessage = useCallback(
    async (
      text: string,
      images: string[] = [],
      appMentions: AppMention[] = [],
    ) => {
      const trimmed = text.trim();
      const command = parseSlashCommand(trimmed, appsEnabled, composerTriggerMode);
      const nextImages = command ? [] : images;
      const nextMentions = command ? [] : appMentions;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (!activeThreadId) {
        return;
      }
      const item = createQueuedItem(trimmed, nextImages, nextMentions);
      enqueueMessage(activeThreadId, item);
      clearActiveImages();
    },
    [
      activeThreadId,
      appsEnabled,
      composerTriggerMode,
      clearActiveImages,
      createQueuedItem,
      enqueueMessage,
      isReviewing,
    ],
  );

  const steerQueuedMessage = useCallback(
    async (messageId: string) => {
      if (!activeThreadId || !activeTurnId || !isProcessing || !steerEnabled) {
        return;
      }
      const item = (queuedByThread[activeThreadId] ?? []).find(
        (entry) => entry.id === messageId,
      );
      if (!item) {
        return;
      }
      const trimmed = item.text.trim();
      if (!trimmed && (item.images ?? []).length === 0) {
        return;
      }
      const mentions = item.appMentions ?? [];
      const result =
        mentions.length > 0
          ? await sendUserMessage(trimmed, item.images ?? [], mentions, {
              sendIntent: "steer",
            })
          : await sendUserMessage(trimmed, item.images ?? [], undefined, {
              sendIntent: "steer",
            });
      if (result.status === "sent") {
        removeQueuedMessage(activeThreadId, messageId);
      }
    },
    [
      activeThreadId,
      activeTurnId,
      isProcessing,
      queuedByThread,
      removeQueuedMessage,
      sendUserMessage,
      steerEnabled,
    ],
  );

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const inFlight = inFlightByThread[activeThreadId];
    if (!inFlight) {
      return;
    }
    if (isProcessing || isReviewing) {
      if (!hasStartedByThread[activeThreadId]) {
        setHasStartedByThread((prev) => ({
          ...prev,
          [activeThreadId]: true,
        }));
      }
      return;
    }
    if (hasStartedByThread[activeThreadId]) {
      setInFlightByThread((prev) => ({ ...prev, [activeThreadId]: null }));
      setHasStartedByThread((prev) => ({ ...prev, [activeThreadId]: false }));
    }
  }, [
    activeThreadId,
    hasStartedByThread,
    inFlightByThread,
    isProcessing,
    isReviewing,
  ]);

  useEffect(() => {
    if (!activeThreadId || isProcessing || isReviewing || queueFlushPaused) {
      return;
    }
    if (inFlightByThread[activeThreadId]) {
      return;
    }
    const queue = queuedByThread[activeThreadId] ?? [];
    if (queue.length === 0) {
      return;
    }
    const threadId = activeThreadId;
    const nextItem = queue[0];
    const cancelGeneration =
      queueCancelGenerationByThread.current[threadId] ?? 0;
    setInFlightByThread((prev) => ({ ...prev, [threadId]: nextItem }));
    setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).slice(1),
    }));
    (async () => {
      try {
        if (
          (queueCancelGenerationByThread.current[threadId] ?? 0) !==
          cancelGeneration
        ) {
          return;
        }
        const trimmed = nextItem.text.trim();
        const command = parseSlashCommand(
          trimmed,
          appsEnabled,
          composerTriggerMode,
        );
        if (command) {
          await runSlashCommand(command, trimmed);
        } else {
          const queuedMentions = nextItem.appMentions ?? [];
          if (queuedMentions.length > 0) {
            await sendUserMessage(nextItem.text, nextItem.images ?? [], queuedMentions);
          } else {
            await sendUserMessage(nextItem.text, nextItem.images ?? []);
          }
        }
      } catch {
        if (
          (queueCancelGenerationByThread.current[threadId] ?? 0) !==
          cancelGeneration
        ) {
          return;
        }
        setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
        setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
        prependQueuedMessage(threadId, nextItem);
      }
    })();
  }, [
    activeThreadId,
    appsEnabled,
    composerTriggerMode,
    inFlightByThread,
    isProcessing,
    isReviewing,
    queueFlushPaused,
    prependQueuedMessage,
    queuedByThread,
    runSlashCommand,
    sendUserMessage,
  ]);

  return {
    queuedByThread,
    activeQueue,
    handleSend,
    queueMessage,
    removeQueuedMessage,
    clearQueuedMessages,
    steerQueuedMessage,
  };
}

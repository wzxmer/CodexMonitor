import { useCallback, useMemo, useState } from "react";
import type {
  AppMention,
  ComposerSendIntent,
  ComposerTriggerMode,
  FollowUpMessageBehavior,
  QueuedMessage,
  SendMessageResult,
  WorkspaceInfo,
} from "../../../types";
import { useComposerImages } from "../../composer/hooks/useComposerImages";
import { useQueuedSend } from "../../threads/hooks/useQueuedSend";

export function useComposerController({
  activeThreadId,
  activeTurnId,
  activeWorkspaceId,
  activeWorkspace,
  isProcessing,
  isReviewing,
  queueFlushPaused = false,
  steerEnabled,
  followUpMessageBehavior,
  composerTriggerMode,
  appsEnabled,
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
}: {
  activeThreadId: string | null;
  activeTurnId: string | null;
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceInfo | null;
  isProcessing: boolean;
  isReviewing: boolean;
  queueFlushPaused?: boolean;
  steerEnabled: boolean;
  followUpMessageBehavior: FollowUpMessageBehavior;
  composerTriggerMode?: ComposerTriggerMode;
  appsEnabled: boolean;
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
  ) => Promise<{ status: "sent" | "blocked" | "steer_failed" }>;
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
}) {
  const [composerDraftsByThread, setComposerDraftsByThread] = useState<
    Record<string, string>
  >({});
  const [prefillDraft, setPrefillDraft] = useState<QueuedMessage | null>(null);
  const [composerInsert, setComposerInsert] = useState<QueuedMessage | null>(
    null,
  );
  const draftKey = activeThreadId ?? activeWorkspaceId;
  const {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    transferActiveImages,
    restoreImagesForDraft,
    setImagesForThread,
    removeImagesForThread,
  } = useComposerImages({ activeThreadId, activeWorkspaceId });

  const {
    activeQueue,
    handleSend,
    queueMessage,
    removeQueuedMessage,
    clearQueuedMessages,
    steerQueuedMessage,
  } = useQueuedSend({
    activeThreadId,
    activeTurnId,
    isProcessing,
    isReviewing,
    queueFlushPaused,
    steerEnabled,
    followUpMessageBehavior,
    composerTriggerMode,
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
    transferActiveImages,
    restoreImagesForDraft,
  });

  const activeDraft = useMemo(
    () =>
      draftKey ? composerDraftsByThread[draftKey] ?? "" : "",
    [composerDraftsByThread, draftKey],
  );

  const handleDraftChange = useCallback(
    (next: string) => {
      if (!draftKey) {
        return;
      }
      setComposerDraftsByThread((prev) => ({
        ...prev,
        [draftKey]: next,
      }));
    },
    [draftKey],
  );

  const handleSendPrompt = useCallback(
    (text: string, appMentions?: AppMention[]) => {
      if (!text.trim()) {
        return;
      }
      void handleSend(text, [], appMentions);
    },
    [handleSend],
  );

  const handleEditQueued = useCallback(
    (item: QueuedMessage) => {
      if (!activeThreadId) {
        return;
      }
      removeQueuedMessage(activeThreadId, item.id);
      setImagesForThread(activeThreadId, item.images ?? []);
      setPrefillDraft(item);
    },
    [activeThreadId, removeQueuedMessage, setImagesForThread],
  );

  const handleDeleteQueued = useCallback(
    (id: string) => {
      if (!activeThreadId) {
        return;
      }
      removeQueuedMessage(activeThreadId, id);
    },
    [activeThreadId, removeQueuedMessage],
  );

  const clearDraftForThread = useCallback((threadId: string) => {
    setComposerDraftsByThread((prev) => {
      if (!(threadId in prev)) {
        return prev;
      }
      const { [threadId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    setImagesForThread,
    removeImagesForThread,
    activeQueue,
    handleSend,
    queueMessage,
    removeQueuedMessage,
    clearQueuedMessages,
    steerQueuedMessage,
    prefillDraft,
    setPrefillDraft,
    composerInsert,
    setComposerInsert,
    activeDraft,
    handleDraftChange,
    handleSendPrompt,
    handleEditQueued,
    handleDeleteQueued,
    clearDraftForThread,
  };
}

import { useEffect, useRef } from "react";
import type { CodexKeyProfile, WorkspaceInfo } from "@/types";

type UseProviderProfileRuntimeSyncArgs = {
  activeProfile: CodexKeyProfile | null;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  settingsLoading: boolean;
  defer: boolean;
  syncWorkspaceRuntime: (workspaceId: string, threadId: string | null) => Promise<void>;
  onError?: (error: unknown) => void;
};

export function useProviderProfileRuntimeSync({
  activeProfile,
  activeWorkspace,
  activeThreadId,
  settingsLoading,
  defer,
  syncWorkspaceRuntime,
  onError,
}: UseProviderProfileRuntimeSyncArgs) {
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  const activeProfileRuntimeKey = activeProfile
    ? JSON.stringify({
        id: activeProfile.id,
        providerKind: activeProfile.providerKind,
        key: activeProfile.key,
        baseUrl: activeProfile.baseUrl,
        model: activeProfile.model,
        contextWindow: activeProfile.contextWindow,
        maxOutputTokens: activeProfile.maxOutputTokens,
        useGateway: activeProfile.useGateway,
        supportsThinking: activeProfile.supportsThinking,
        supportsReasoningEffort: activeProfile.supportsReasoningEffort,
      })
    : "__codex_default__";

  useEffect(() => {
    if (settingsLoading || defer || !activeWorkspace?.connected) {
      return;
    }
    void syncWorkspaceRuntime(activeWorkspace.id, activeThreadIdRef.current).catch((error) => {
      onError?.(error);
    });
  }, [
    activeProfileRuntimeKey,
    activeWorkspace?.connected,
    activeWorkspace?.id,
    defer,
    onError,
    settingsLoading,
    syncWorkspaceRuntime,
  ]);
}

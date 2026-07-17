import { useEffect, useRef } from "react";
import type { AppSettings, CodexKeyProfile, WorkspaceInfo } from "@/types";

export type ProviderRuntimeSettingsSnapshot = {
  activeCodexKeyProfileId: string | null;
  activeProfile: CodexKeyProfile | null;
  syncProviderProfileToLocalConfig: boolean;
};

export function restoreProviderRuntimeSettings(
  current: AppSettings,
  snapshot: ProviderRuntimeSettingsSnapshot,
): AppSettings {
  const profiles = [...current.codexKeyProfiles];
  const activeProfile = snapshot.activeProfile;
  if (activeProfile) {
    const profileIndex = profiles.findIndex(
      (profile) => profile.id === activeProfile.id,
    );
    if (profileIndex >= 0) {
      profiles[profileIndex] = activeProfile;
    } else {
      profiles.push(activeProfile);
    }
  }
  return {
    ...current,
    codexKeyProfiles: profiles,
    activeCodexKeyProfileId: snapshot.activeCodexKeyProfileId,
    syncProviderProfileToLocalConfig: snapshot.syncProviderProfileToLocalConfig,
  };
}

type UseProviderProfileRuntimeSyncArgs = {
  activeProfile: CodexKeyProfile | null;
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  settingsLoading: boolean;
  defer: boolean;
  syncLocalConfig: boolean;
  settingsSnapshot: ProviderRuntimeSettingsSnapshot;
  syncWorkspaceRuntime: (
    workspaceId: string,
    threadId: string | null,
  ) => Promise<void>;
  rollbackSettings: (
    settings: ProviderRuntimeSettingsSnapshot,
  ) => Promise<unknown>;
  onError?: (error: unknown) => void;
};

export function useProviderProfileRuntimeSync({
  activeProfile,
  activeWorkspace,
  activeThreadId,
  settingsLoading,
  defer,
  syncLocalConfig,
  settingsSnapshot,
  syncWorkspaceRuntime,
  rollbackSettings,
  onError,
}: UseProviderProfileRuntimeSyncArgs) {
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  const settingsSnapshotRef = useRef(settingsSnapshot);
  settingsSnapshotRef.current = settingsSnapshot;
  const lastSuccessfulSettingsRef = useRef(settingsSnapshot);
  const latestRequestIdRef = useRef(0);
  const activeProfileRuntimeKey = activeProfile
    ? JSON.stringify({
        id: activeProfile.id,
        providerKind: activeProfile.providerKind,
        keyEnvVar: activeProfile.keyEnvVar,
        key: activeProfile.key,
        baseUrlEnvVar: activeProfile.baseUrlEnvVar,
        baseUrl: activeProfile.baseUrl,
        model: activeProfile.model,
        contextWindow: activeProfile.contextWindow,
        maxOutputTokens: activeProfile.maxOutputTokens,
        useGateway: activeProfile.useGateway,
        supportsThinking: activeProfile.supportsThinking,
        supportsReasoningEffort: activeProfile.supportsReasoningEffort,
      })
    : "__codex_default__";
  const transactionKey = `${activeProfileRuntimeKey}:${syncLocalConfig}`;
  const desiredTransactionRef = useRef({ key: transactionKey, revision: 0 });
  if (desiredTransactionRef.current.key !== transactionKey) {
    desiredTransactionRef.current = {
      key: transactionKey,
      revision: desiredTransactionRef.current.revision + 1,
    };
  }

  useEffect(() => {
    if (settingsLoading || defer || !activeWorkspace?.connected) {
      return;
    }
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const desiredRevision = desiredTransactionRef.current.revision;
    const requestedSettings = settingsSnapshotRef.current;
    void syncWorkspaceRuntime(activeWorkspace.id, activeThreadIdRef.current)
      .then(() => {
        lastSuccessfulSettingsRef.current = requestedSettings;
      })
      .catch(async (error) => {
        if (
          latestRequestIdRef.current !== requestId ||
          desiredTransactionRef.current.revision !== desiredRevision
        ) {
          return;
        }
        try {
          await rollbackSettings(lastSuccessfulSettingsRef.current);
          onError?.(error);
        } catch (rollbackError) {
          const switchMessage =
            error instanceof Error ? error.message : String(error);
          const message =
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError);
          onError?.(
            new Error(
              `Provider runtime switch failed: ${switchMessage}; settings rollback failed: ${message}`,
            ),
          );
        }
      });
  }, [
    activeWorkspace?.connected,
    activeWorkspace?.id,
    defer,
    onError,
    rollbackSettings,
    settingsLoading,
    syncWorkspaceRuntime,
    transactionKey,
  ]);
}

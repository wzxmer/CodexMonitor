import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  CodexProviderStatus,
} from "@/types";
import type { ThirdPartyKeyUsageSnapshot } from "@app/utils/thirdPartyKeyUsage";
import { getProviderStatus } from "@/services/tauri";
import { resolveCodexProviderBaseUrl } from "@/utils/providerProfiles";
import { useThirdPartyKeyUsage } from "@app/hooks/useThirdPartyKeyUsage";

type UseSidebarProviderUsageArgs = {
  appSettings: AppSettings;
  activeWorkspaceId: string | null;
  homeAccountWorkspaceId: string | null;
};

type ProviderStatusState = {
  requestKey: string;
  status: CodexProviderStatus;
};

type SidebarProviderUsage = {
  workspaceId: string | null;
  codexProviderStatus: CodexProviderStatus | null;
  thirdPartyProviderUsage: ThirdPartyKeyUsageSnapshot | null;
};

export function useSidebarProviderUsage({
  appSettings,
  activeWorkspaceId,
  homeAccountWorkspaceId,
}: UseSidebarProviderUsageArgs): SidebarProviderUsage {
  const workspaceId = activeWorkspaceId ?? homeAccountWorkspaceId;
  const activeProfile = useMemo(
    () =>
      appSettings.codexKeyProfiles.find(
        (profile) => profile.id === appSettings.activeCodexKeyProfileId,
      ) ?? null,
    [appSettings.activeCodexKeyProfileId, appSettings.codexKeyProfiles],
  );
  const profileIdentityByObjectRef = useRef(new WeakMap<object, number>());
  const nextProfileIdentityRef = useRef(1);
  const activeProfileRevision = useMemo(() => {
    if (!activeProfile) {
      return 0;
    }
    const cachedIdentity = profileIdentityByObjectRef.current.get(activeProfile);
    if (cachedIdentity) {
      return cachedIdentity;
    }
    const nextIdentity = nextProfileIdentityRef.current;
    nextProfileIdentityRef.current += 1;
    profileIdentityByObjectRef.current.set(activeProfile, nextIdentity);
    return nextIdentity;
  }, [activeProfile]);
  const activeProfileBaseUrl = activeProfile
    ? resolveCodexProviderBaseUrl(activeProfile.providerKind, activeProfile.baseUrl)
    : null;
  const requestKey = workspaceId
    ? JSON.stringify([
        workspaceId,
        appSettings.codexHome ?? "",
        appSettings.activeCodexKeyProfileId ?? "__default__",
        activeProfileRevision,
        activeProfileBaseUrl ?? "",
      ])
    : null;
  const [statusState, setStatusState] = useState<ProviderStatusState | null>(null);
  const statusCacheRef = useRef(new Map<string, CodexProviderStatus>());

  useEffect(() => {
    if (!workspaceId || !requestKey) {
      setStatusState(null);
      return;
    }
    let canceled = false;
    const cachedStatus = statusCacheRef.current.get(requestKey);
    if (cachedStatus) {
      setStatusState({ requestKey, status: cachedStatus });
    }
    getProviderStatus(workspaceId)
      .then((status) => {
        if (!canceled) {
          statusCacheRef.current.set(requestKey, status);
          setStatusState({ requestKey, status });
        }
      })
      .catch((error) => {
        if (!canceled) {
          const status: CodexProviderStatus = {
            providerName: null,
            baseUrl: null,
            source: "error",
            isConfigured: false,
            isThirdParty: false,
            autoCompactTokenLimit: null,
            modelContextWindow: null,
            error: error instanceof Error ? error.message : String(error),
          };
          statusCacheRef.current.set(requestKey, status);
          setStatusState({ requestKey, status });
        }
      });
    return () => {
      canceled = true;
    };
  }, [requestKey, workspaceId]);

  const codexProviderStatus = requestKey
    ? statusState?.requestKey === requestKey
      ? statusState.status
      : statusCacheRef.current.get(requestKey) ?? null
    : null;
  const thirdPartyProviderUsage = useThirdPartyKeyUsage({
    enabled:
      Boolean(workspaceId) &&
      codexProviderStatus?.isConfigured === true &&
      codexProviderStatus.isThirdParty,
    workspaceId,
    profileId: appSettings.activeCodexKeyProfileId,
    profileRevision: activeProfileRevision,
  });

  return {
    workspaceId,
    codexProviderStatus,
    thirdPartyProviderUsage,
  };
}

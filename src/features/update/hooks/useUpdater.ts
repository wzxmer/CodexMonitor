import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { DebugEntry } from "../../../types";
import {
  cleanupDownloadedReleaseAssets,
  downloadAndOpenReleaseAsset,
} from "../../../services/tauri";
import {
  buildReleaseTagUrl,
  clearPendingPostUpdateVersion,
  fetchLatestReleaseUpdate,
  fetchReleaseNotesForVersion,
  type ReleaseUpdateInfo,
  loadPendingPostUpdateVersion,
  normalizeReleaseVersion,
  savePendingPostUpdateVersion,
} from "../utils/postUpdateRelease";

type UpdateStage =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";

type UpdateProgress = {
  totalBytes?: number;
  downloadedBytes: number;
};

export type UpdateState = {
  stage: UpdateStage;
  version?: string;
  progress?: UpdateProgress;
  error?: string;
};

type PostUpdateNotice =
  | {
      stage: "loading";
      version: string;
      htmlUrl: string;
    }
  | {
      stage: "ready";
      version: string;
      body: string;
      htmlUrl: string;
    }
  | {
      stage: "fallback";
      version: string;
      htmlUrl: string;
    };

export type PostUpdateNoticeState = PostUpdateNotice | null;

type UseUpdaterOptions = {
  enabled?: boolean;
  autoCheckOnMount?: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export function useUpdater({
  enabled = true,
  autoCheckOnMount = true,
  onDebug,
}: UseUpdaterOptions) {
  const [state, setState] = useState<UpdateState>({ stage: "idle" });
  const [postUpdateNotice, setPostUpdateNotice] = useState<PostUpdateNoticeState>(
    null,
  );
  const updateRef = useRef<ReleaseUpdateInfo | null>(null);
  const hasAttemptedAutoCheckRef = useRef(false);
  const postUpdateFetchGenerationRef = useRef(0);

  const resetToIdle = useCallback(async () => {
    updateRef.current = null;
    setState({ stage: "idle" });
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!enabled) {
      return;
    }
    try {
      setState({ stage: "checking" });
      const update = await fetchLatestReleaseUpdate(__APP_VERSION__);
      if (!update) {
        updateRef.current = null;
        setState({ stage: "idle" });
        return;
      }

      updateRef.current = update;
      setState({
        stage: "available",
        version: update.version,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      onDebug?.({
        id: `${Date.now()}-client-updater-error`,
        timestamp: Date.now(),
        source: "error",
        label: "updater/error",
        payload: message,
      });
      setState({ stage: "error", error: message });
    }
  }, [enabled, onDebug]);

  const startUpdate = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const update = updateRef.current;
    if (!update) {
      await checkForUpdates();
      return;
    }

    setState((prev) => ({
      ...prev,
      stage: "downloading",
      progress: {
        totalBytes: update.asset.size,
        downloadedBytes: 0,
      },
      error: undefined,
    }));

    try {
      await downloadAndOpenReleaseAsset(update.asset.url, update.asset.name);
      setState((prev) => ({
        ...prev,
        stage: "installing",
        progress: {
          totalBytes: update.asset.size,
          downloadedBytes: update.asset.size ?? prev.progress?.downloadedBytes ?? 0,
        },
      }));
      savePendingPostUpdateVersion(update.version);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      onDebug?.({
        id: `${Date.now()}-client-updater-error`,
        timestamp: Date.now(),
        source: "error",
        label: "updater/error",
        payload: message,
      });
      setState((prev) => ({
        ...prev,
        stage: "error",
        error: message,
      }));
    }
  }, [checkForUpdates, enabled, onDebug]);

  useEffect(() => {
    if (!enabled || !isTauri()) {
      return;
    }
    void cleanupDownloadedReleaseAssets().catch((error) => {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      onDebug?.({
        id: `${Date.now()}-client-updater-cleanup-error`,
        timestamp: Date.now(),
        source: "error",
        label: "updater/cleanup-error",
        payload: message,
      });
    });
  }, [enabled, onDebug]);

  useEffect(() => {
    if (!enabled || !autoCheckOnMount || import.meta.env.DEV || !isTauri()) {
      return;
    }
    if (hasAttemptedAutoCheckRef.current) {
      return;
    }
    hasAttemptedAutoCheckRef.current = true;
    void checkForUpdates();
  }, [autoCheckOnMount, checkForUpdates, enabled]);

  useEffect(() => {
    if (!enabled || !isTauri()) {
      return;
    }
    const pendingVersion = loadPendingPostUpdateVersion();
    if (!pendingVersion) {
      return;
    }

    const normalizedPendingVersion = normalizeReleaseVersion(pendingVersion);
    const normalizedCurrentVersion = normalizeReleaseVersion(__APP_VERSION__);
    if (
      !normalizedPendingVersion ||
      normalizedPendingVersion !== normalizedCurrentVersion
    ) {
      clearPendingPostUpdateVersion();
      return;
    }

    const fallbackUrl = buildReleaseTagUrl(normalizedPendingVersion);
    const generation = postUpdateFetchGenerationRef.current + 1;
    postUpdateFetchGenerationRef.current = generation;
    let cancelled = false;
    setPostUpdateNotice({
      stage: "loading",
      version: normalizedPendingVersion,
      htmlUrl: fallbackUrl,
    });

    void fetchReleaseNotesForVersion(normalizedPendingVersion)
      .then((releaseInfo) => {
        if (
          cancelled ||
          postUpdateFetchGenerationRef.current !== generation
        ) {
          return;
        }
        if (releaseInfo.body) {
          setPostUpdateNotice({
            stage: "ready",
            version: normalizedPendingVersion,
            body: releaseInfo.body,
            htmlUrl: releaseInfo.htmlUrl,
          });
          return;
        }
        setPostUpdateNotice({
          stage: "fallback",
          version: normalizedPendingVersion,
          htmlUrl: releaseInfo.htmlUrl,
        });
      })
      .catch((error) => {
        if (
          cancelled ||
          postUpdateFetchGenerationRef.current !== generation
        ) {
          return;
        }
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        onDebug?.({
          id: `${Date.now()}-client-updater-release-notes-error`,
          timestamp: Date.now(),
          source: "error",
          label: "updater/release-notes-error",
          payload: message,
        });
        setPostUpdateNotice({
          stage: "fallback",
          version: normalizedPendingVersion,
          htmlUrl: fallbackUrl,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, onDebug]);

  const dismissPostUpdateNotice = useCallback(() => {
    postUpdateFetchGenerationRef.current += 1;
    clearPendingPostUpdateVersion();
    setPostUpdateNotice(null);
  }, []);

  return {
    state,
    startUpdate,
    checkForUpdates,
    dismiss: resetToIdle,
    postUpdateNotice,
    dismissPostUpdateNotice,
  };
}

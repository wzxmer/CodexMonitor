import { useState } from "react";
import type { AppSettings, ManagedSessionCleanupRequest } from "@/types";
import { useI18n } from "@/features/i18n/I18nProvider";
import {
  cleanupManagedSessionsNow,
  previewManagedSessionCleanup,
} from "@services/tauri";
import { loadPinnedThreadIds } from "@threads/utils/threadStorage";

type CleanupPrompt = {
  kind: "enable" | "immediate";
  eligibleCount: number;
};

type Args = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function useSessionCleanupSettings({
  appSettings,
  onUpdateAppSettings,
}: Args) {
  const { t } = useI18n();
  const [cleanupPrompt, setCleanupPrompt] = useState<CleanupPrompt | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupSummary, setCleanupSummary] = useState<string | null>(null);

  const cleanupRequest = (): ManagedSessionCleanupRequest => ({
    retentionDays: appSettings.autoDeleteArchivedThreadsDays,
    protectedThreadIds: loadPinnedThreadIds(),
  });

  const openCleanupPrompt = async (kind: CleanupPrompt["kind"]) => {
    setCleanupBusy(true);
    setCleanupError(null);
    setCleanupSummary(null);
    try {
      const preview = await previewManagedSessionCleanup(cleanupRequest());
      setCleanupPrompt({ kind, eligibleCount: preview.eligibleCount });
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : String(error));
    } finally {
      setCleanupBusy(false);
    }
  };

  const confirmEnableAutoDelete = async () => {
    setCleanupBusy(true);
    setCleanupError(null);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        autoDeleteArchivedThreadsEnabled: true,
      });
      setCleanupPrompt(null);
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : String(error));
    } finally {
      setCleanupBusy(false);
    }
  };

  const confirmImmediateCleanup = async () => {
    setCleanupBusy(true);
    setCleanupError(null);
    try {
      const response = await cleanupManagedSessionsNow(cleanupRequest());
      setCleanupSummary(
        t("settings.session.immediateCleanupResult")
          .replace("{success}", String(response.successCount))
          .replace("{failure}", String(response.failureCount)),
      );
      setCleanupPrompt(null);
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : String(error));
    } finally {
      setCleanupBusy(false);
    }
  };

  return {
    cleanupPrompt,
    cleanupBusy,
    cleanupError,
    cleanupSummary,
    openCleanupPrompt,
    closeCleanupPrompt: () => setCleanupPrompt(null),
    confirmEnableAutoDelete,
    confirmImmediateCleanup,
  };
}

import type { ArchiveManagedSessionsResponse, SessionSource } from "@/types";
import { useI18n } from "@/features/i18n/I18nProvider";

type Props = {
  result: ArchiveManagedSessionsResponse;
  sources: SessionSource[];
  onDismiss: () => void;
};

export function SessionArchiveResultSummary({ result, sources, onDismiss }: Props) {
  const { t } = useI18n();
  const sourceNames = new Map(sources.map((source) => [source.id, source.name]));
  const failures = result.results.filter((item) => !item.success);
  return (
    <div className={`session-archive-summary${failures.length > 0 ? " is-warning" : ""}`} role="status">
      <div className="session-archive-summary-header">
        <strong>{t("sessionManager.archiveSummary")}</strong>
        <button type="button" onClick={onDismiss} aria-label={t("sessionManager.dismiss")}>×</button>
      </div>
      <div>{t("sessionManager.archiveSucceeded")}: {result.successCount} · {t("sessionManager.archiveFailed")}: {result.failureCount}</div>
      {failures.map((item) => (
        <div className="session-archive-summary-error" key={`${item.sourceId}:${item.threadId}`}>
          {sourceNames.get(item.sourceId) ?? item.sourceId} · {item.threadId}: {item.error}
        </div>
      ))}
    </div>
  );
}

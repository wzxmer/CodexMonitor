import { useMemo, useState } from "react";
import Archive from "lucide-react/dist/esm/icons/archive";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Play from "lucide-react/dist/esm/icons/play";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { ManagedSession } from "@/types";
import { useI18n } from "@/features/i18n/I18nProvider";
import { formatRelativeTimeShort } from "@/utils/time";
import { useSessionManagerContext } from "../context/SessionManagerContext";
import { SessionArchiveResultSummary } from "./SessionArchiveResultSummary";
import { SessionManagerToolbar } from "./SessionManagerToolbar";
import { SessionPermanentDeletePrompt } from "./SessionPermanentDeletePrompt";

export function SessionManagerWorkspace() {
  const { t } = useI18n();
  const { manager, focusedSession, sessionPreview, sessionPreviewLoading, sessionPreviewError, resumingKey, resumeSession, deriveSession, currentWorkspace } = useSessionManagerContext();
  const [permanentDeleteSession, setPermanentDeleteSession] = useState<ManagedSession | null>(null);
  const [permanentDeleteChildCount, setPermanentDeleteChildCount] = useState(0);
  const selectedSessions = useMemo(
    () => manager.indexedSessions.filter((session) => manager.selectedSessionKeys.has(session.key) && !session.isArchived),
    [manager.indexedSessions, manager.selectedSessionKeys],
  );
  const source = focusedSession ? manager.sources.find((candidate) => candidate.id === focusedSession.sourceId) : null;

  const requestPermanentDelete = async (session: ManagedSession) => {
    const childCount = await manager.getPermanentDeleteChildCount(session);
    if (childCount == null) return;
    setPermanentDeleteChildCount(childCount);
    setPermanentDeleteSession(session);
  };

  const confirmPermanentDelete = async (cascadeRequested: boolean) => {
    if (!permanentDeleteSession) return;
    const response = await manager.permanentlyDeleteSession(permanentDeleteSession, cascadeRequested);
    if (response) setPermanentDeleteSession(null);
  };

  return (
    <section className="session-manager-workspace" aria-label={t("sessionManager.title")}>
      <header className="session-manager-workspace-header">
        <div>
          <span className="session-manager-workspace-eyebrow">{t("sessionManager.title")} · {t("sessionManager.totalCount")} {manager.totalSessionCount}</span>
          <h1>{focusedSession?.title ?? t("sessionManager.noSelection")}</h1>
        </div>
        <button type="button" className="ghost" onClick={() => void manager.refresh()} disabled={manager.loading}>
          {manager.loading ? t("sidebar.loading") : t("sessionManager.refresh")}
        </button>
      </header>
      <SessionManagerToolbar
        query={manager.query}
        onQueryChange={manager.setQuery}
        showSubagents={manager.showSubagents}
        onShowSubagentsChange={manager.setShowSubagents}
        statusFilter={manager.statusFilter}
        onStatusFilterChange={manager.setStatusFilter}
        sourceFilter={manager.sourceFilter}
        onSourceFilterChange={manager.setSourceFilter}
        sources={manager.sources}
        selectedArchiveCount={selectedSessions.length}
        archiving={manager.archivingKeys.size > 0}
        onArchiveSelected={() => void manager.archiveSessions(selectedSessions)}
      />
      {manager.archiveResult && <SessionArchiveResultSummary result={manager.archiveResult} sources={manager.sources} onDismiss={manager.dismissArchiveResult} />}
      <div className="session-manager-detail">
        {!focusedSession ? (
          <div className="session-manager-detail-empty">{t("sessionManager.noSelectionHint")}</div>
        ) : (
          <>
            <div className="session-manager-detail-meta">
              <span>{source?.name ?? focusedSession.sourceId}</span>
              <span>{focusedSession.isArchived ? t("sessionManager.archived") : t("sessionManager.active")}</span>
              <span>{focusedSession.updatedAt ? formatRelativeTimeShort(focusedSession.updatedAt) : "—"}</span>
            </div>
            <div className="session-manager-detail-path">{focusedSession.cwd ?? t("sessionManager.unknownProject")}</div>
            <div className="session-manager-conversation-preview">
              {sessionPreview?.openingMessage && (
                <section className="session-manager-opening-preview">
                  <h2>{t("sessionManager.openingMessage")}</h2>
                  <p>{sessionPreview.openingMessage}</p>
                </section>
              )}
              <section className="session-manager-latest-preview">
                <h2>{t("sessionManager.latestMessages")}</h2>
                {sessionPreviewLoading ? (
                  <div className="session-manager-preview-state">{t("sessionManager.previewLoading")}</div>
                ) : sessionPreviewError ? (
                  <div className="session-manager-preview-state is-error">{t("sessionManager.previewUnavailable")}</div>
                ) : sessionPreview?.items.length ? (
                  <div className="session-manager-preview-items">
                    {sessionPreview.items.map((item, index) => (
                      <article key={index} className={"session-manager-preview-item is-" + item.role}>
                        <span>{item.role === "user" ? t("sessionManager.previewUser") : t("sessionManager.previewAssistant")}</span>
                        <p>{item.text}</p>
                      </article>
                    ))}
                  </div>
                ) : focusedSession.preview ? (
                  <div className="session-manager-detail-preview">{focusedSession.preview}</div>
                ) : (
                  <div className="session-manager-preview-state">{t("sessionManager.previewEmpty")}</div>
                )}
                {sessionPreview?.incomplete && <div className="session-manager-preview-note">{t("sessionManager.previewIncomplete")}</div>}
              </section>
            </div>
            <div className="session-manager-detail-actions">
              <button type="button" className="primary" onClick={() => void resumeSession(focusedSession)} disabled={resumingKey === focusedSession.key || !focusedSession.projectExists}>
                <Play size={15} aria-hidden />{resumingKey === focusedSession.key ? t("sessionManager.resuming") : t("sessionManager.resume")}
              </button>
              <button type="button" onClick={() => deriveSession(focusedSession)} disabled={resumingKey === focusedSession.key || !currentWorkspace}>
                <GitBranch size={15} aria-hidden />{t("sessionManager.migrateCurrentProject")}
              </button>
              <button type="button" onClick={() => void manager.archiveSessions([focusedSession])} disabled={focusedSession.isArchived || manager.archivingKeys.has(focusedSession.key)}>
                <Archive size={15} aria-hidden />{t("sessionManager.archive")}
              </button>
              {focusedSession.isArchived && (
                <button type="button" className="danger" onClick={() => void requestPermanentDelete(focusedSession)} disabled={manager.deletingKeys.has(focusedSession.key)}>
                  <Trash2 size={15} aria-hidden />{t("sessionManager.permanentDelete")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {permanentDeleteSession && (
        <SessionPermanentDeletePrompt session={permanentDeleteSession} source={manager.sources.find((candidate) => candidate.id === permanentDeleteSession.sourceId)} childCount={permanentDeleteChildCount} busy={manager.deletingKeys.has(permanentDeleteSession.key)} onCancel={() => setPermanentDeleteSession(null)} onConfirm={(cascade) => void confirmPermanentDelete(cascade)} />
      )}
    </section>
  );
}

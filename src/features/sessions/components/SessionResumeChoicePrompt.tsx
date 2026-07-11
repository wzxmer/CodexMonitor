import { useI18n } from "@/features/i18n/I18nProvider";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { useSessionManagerContext } from "../context/SessionManagerContext";

export function SessionResumeChoicePrompt() {
  const { t } = useI18n();
  const { pendingResumeSession, currentWorkspace, resumingKey, resumeInOriginalProject, migrateToCurrentProject, cancelResumeChoice } = useSessionManagerContext();
  if (!pendingResumeSession || !currentWorkspace) return null;
  const busy = resumingKey === pendingResumeSession.key;
  return (
    <ModalShell className="session-resume-choice-modal" onBackdropClick={busy ? undefined : cancelResumeChoice} ariaLabel={t("sessionManager.resumeChoiceTitle")}>
      <div className="ds-modal-title">{t("sessionManager.resumeChoiceTitle")}</div>
      <div className="session-resume-choice-copy">{t("sessionManager.resumeChoiceDescription")}</div>
      <div className="session-derivation-route">
        <div><strong>{t("sessionManager.resumeOriginalProject")}</strong><span>{pendingResumeSession.cwd ?? t("sessionManager.unknownProject")}</span></div>
        <div><strong>{t("sessionManager.migrateCurrentProject")}</strong><span>{currentWorkspace.name} · {currentWorkspace.path}</span></div>
      </div>
      <div className="ds-modal-actions session-resume-choice-actions">
        <button type="button" className="ghost ds-modal-button" onClick={cancelResumeChoice} disabled={busy}>{t("common.cancel")}</button>
        <button type="button" className="ghost ds-modal-button" onClick={() => void resumeInOriginalProject()} disabled={busy}>{busy ? t("sessionManager.resuming") : t("sessionManager.resumeOriginalProject")}</button>
        <button type="button" className="primary ds-modal-button" onClick={migrateToCurrentProject} disabled={busy}>{t("sessionManager.migrateCurrentProject")}</button>
      </div>
    </ModalShell>
  );
}

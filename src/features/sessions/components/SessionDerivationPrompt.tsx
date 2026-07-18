import type { ManagedSessionDerivationPreview, WorkspaceInfo } from "@/types";
import { useI18n } from "@/features/i18n/I18nProvider";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";

type Props = {
  previews: ManagedSessionDerivationPreview[];
  destination: WorkspaceInfo;
  error: string | null;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SessionDerivationPrompt({ previews, destination, error, isBusy, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const preview = previews[0];
  if (!preview) return null;
  const sourceLabel = previews.length === 1
    ? `${preview.sourceName} · ${preview.sourceSession.title}`
    : `${previews.length} ${t("sessionManager.sessionsSelected")}`;
  const handoffContent = previews.length === 1
    ? preview.handoffContent
    : previews.map((item) => `# ${item.sourceSession.title}\n\n${item.handoffContent}`).join("\n\n---\n\n");
  const userMessageCount = previews.reduce((total, item) => total + item.userMessageCount, 0);
  const agentReplyCount = previews.reduce((total, item) => total + item.agentReplyCount, 0);
  return (
    <ModalShell
      cardClassName="session-derivation-modal"
      onBackdropClick={isBusy ? undefined : onCancel}
      ariaLabel={t("sessionManager.deriveTitle")}
    >
      <div className="ds-modal-title">{t("sessionManager.deriveTitle")}</div>
      <div className="session-derivation-route">
        <div><strong>{t("sessionManager.deriveSource")}</strong><span>{sourceLabel}</span></div>
        <div><strong>{t("sessionManager.deriveDestination")}</strong><span>{destination.name} · {destination.path}</span></div>
      </div>
      <div className="session-derivation-counts">
        {t("sessionManager.userMessages")}: {userMessageCount} · {t("sessionManager.finalReplies")}: {agentReplyCount}
      </div>
      {previews.some((item) => item.incomplete) && <div className="session-derivation-warning">{t("sessionManager.deriveIncomplete")}</div>}
      <textarea className="session-derivation-preview" value={handoffContent} readOnly aria-label={t("sessionManager.derivePreview")} />
      {error && <div className="worktree-modal-error">{error}</div>}
      <div className="ds-modal-actions">
        <button type="button" className="ghost ds-modal-button" onClick={onCancel} disabled={isBusy}>{t("common.cancel")}</button>
        <button type="button" className="primary ds-modal-button" onClick={onConfirm} disabled={isBusy}>
          {isBusy ? t("sessionManager.deriving") : t("sessionManager.deriveConfirm")}
        </button>
      </div>
    </ModalShell>
  );
}

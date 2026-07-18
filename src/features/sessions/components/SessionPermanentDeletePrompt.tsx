import { useState } from "react";
import type { ManagedSession, SessionSource } from "@/types";
import { useI18n } from "@/features/i18n/I18nProvider";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";

type Props = { session: ManagedSession; sessions?: ManagedSession[]; source?: SessionSource; childCount: number; busy: boolean; onCancel: () => void; onConfirm: (cascade: boolean) => void };

export function SessionPermanentDeletePrompt({ session, sessions = [session], source, childCount, busy, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const [acknowledged, setAcknowledged] = useState(false);
  const [cascade, setCascade] = useState(false);
  return <ModalShell className="session-delete-modal" onBackdropClick={busy ? undefined : onCancel} ariaLabel={t("sessionManager.permanentDeleteTitle")}>
    <div className="ds-modal-title">{t("sessionManager.permanentDeleteTitle")}</div>
    <div className="session-derivation-warning">{t("sessionManager.permanentDeleteWarning")}</div>
    <div>{sessions.length > 1 ? `${sessions.length} ${t("sessionManager.sessionsSelected")}` : (source?.name ?? session.sourceId)}</div><div>{sessions.length > 1 ? sessions.map((item) => item.threadId).join(", ") : session.threadId}</div><div>{session.archivedAt ? new Date(session.archivedAt).toLocaleString() : "—"}</div>
    {childCount > 0 && <label><input type="checkbox" checked={cascade} onChange={(event) => setCascade(event.target.checked)} />{t("sessionManager.deleteChildren")} ({childCount})</label>}
    <label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t("sessionManager.permanentDeleteAcknowledge")}</label>
    <div className="ds-modal-actions"><button type="button" className="ghost ds-modal-button" onClick={onCancel} disabled={busy}>{t("common.cancel")}</button><button type="button" className="primary ds-modal-button" onClick={() => onConfirm(cascade)} disabled={busy || !acknowledged}>{busy ? t("sessionManager.deleting") : t("sessionManager.permanentDeleteConfirm")}</button></div>
  </ModalShell>;
}

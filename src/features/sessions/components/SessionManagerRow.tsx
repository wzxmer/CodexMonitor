import type { ManagedSession, SessionSource } from "@/types";
import { formatRelativeTimeShort } from "@/utils/time";
import { useI18n } from "@/features/i18n/I18nProvider";

type Props = {
  session: ManagedSession;
  source?: SessionSource;
  selected: boolean;
  resuming: boolean;
  archiving: boolean;
  deleting: boolean;
  compact?: boolean;
  focused?: boolean;
  onToggleSelected: () => void;
  onFocus?: () => void;
  onResume: () => void;
  onArchive: () => void;
  onDerive: () => void;
  onPermanentDelete: () => void;
};

export function SessionManagerRow({ session, source, selected, resuming, archiving, deleting, compact = false, focused = false, onToggleSelected, onFocus, onResume, onArchive, onDerive, onPermanentDelete }: Props) {
  const { t } = useI18n();
  return (
    <div className={`session-manager-row${selected ? " is-selected" : ""}${focused ? " is-focused" : ""}${compact ? " is-compact" : ""}`}>
      <button type="button" className="session-manager-row-select" onClick={onToggleSelected} aria-label={`${t("sessionManager.select")} ${session.title}`}>
        <input type="checkbox" checked={selected} readOnly tabIndex={-1} />
      </button>
      <button type="button" className="session-manager-row-content" onClick={onFocus ?? onResume} onDoubleClick={onFocus ? onResume : undefined} disabled={resuming}>
        <span className="session-manager-row-title">{session.title}</span>
        <span className="session-manager-row-path">{session.cwd ?? t("sessionManager.unknownProject")}</span>
        {!compact && session.preview && <span className="session-manager-row-preview">{session.preview}</span>}
        {!compact && <span className="session-manager-row-tags">
          <span>{source?.name ?? session.sourceId}</span>
          <span>{session.isArchived ? t("sessionManager.archived") : t("sessionManager.active")}</span>
          {!session.projectExists && <span className="is-warning">{t("sessionManager.projectMissing")}</span>}
          {session.isSubagent && <span>{session.subagentNickname ?? t("sessionManager.subagent")}</span>}
        </span>}
      </button>
      <span className="session-manager-row-time">{session.updatedAt ? formatRelativeTimeShort(session.updatedAt) : "—"}</span>
      {!compact && <span className="session-manager-row-actions">
        <button type="button" className="session-manager-row-resume" onClick={onResume} disabled={resuming || archiving || !session.projectExists}>
          {resuming ? t("sessionManager.resuming") : t("sessionManager.resume")}
        </button>
        <button type="button" className="session-manager-row-archive" onClick={onArchive} disabled={archiving || session.isArchived}>
          {archiving ? t("sessionManager.archiving") : t("sessionManager.archive")}
        </button>
        <button type="button" className="session-manager-row-derive" onClick={onDerive} disabled={archiving || resuming}>
          {t("sessionManager.derive")}
        </button>
        {session.isArchived && <button type="button" className="session-manager-row-delete" onClick={onPermanentDelete} disabled={deleting || archiving || resuming}>{deleting ? t("sessionManager.deleting") : t("sessionManager.permanentDelete")}</button>}
      </span>}
    </div>
  );
}

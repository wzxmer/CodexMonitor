import type { ManagedSession, SessionSearchProgress, SessionSource } from "@/types";
import { useI18n } from "@/features/i18n/I18nProvider";
import { SessionManagerRow } from "./SessionManagerRow";

type Props = { sessions: ManagedSession[]; sources: SessionSource[]; selected: Set<string>; resumingKey: string | null; archivingKeys: Set<string>; deletingKeys?: Set<string>; loading: boolean; loadingMore: boolean; error: string | null; hasMore: boolean; searchProgress?: SessionSearchProgress | null; onToggleSelected: (key: string) => void; onResume: (session: ManagedSession) => void; onArchive: (session: ManagedSession) => void; onDerive: (session: ManagedSession) => void; onPermanentDelete?: (session: ManagedSession) => void; onLoadMore: () => void };

export function SessionManagerList(props: Props) {
  const { t } = useI18n();
  const sourceById = new Map(props.sources.map((source) => [source.id, source]));
  if (props.loading) return <div className="session-manager-state">{t("sidebar.loading")}</div>;
  if (props.error) return <div className="session-manager-state is-error">{props.error}</div>;
  return (
    <div className="session-manager-list">
      {props.searchProgress && !props.searchProgress.completed && <div className="session-manager-search-progress">{t("sessionManager.searching")}</div>}
      {props.searchProgress?.incomplete && <div className="session-manager-search-progress is-warning">{t("sessionManager.searchIncomplete")}</div>}
      {props.sessions.length === 0 ? <div className="session-manager-state">{t("sessionManager.empty")}</div> : props.sessions.map((session) => (
        <SessionManagerRow key={session.key} session={session} source={sourceById.get(session.sourceId)} selected={props.selected.has(session.key)} resuming={props.resumingKey === session.key} archiving={props.archivingKeys.has(session.key)} deleting={props.deletingKeys?.has(session.key) ?? false} onToggleSelected={() => props.onToggleSelected(session.key)} onResume={() => props.onResume(session)} onArchive={() => props.onArchive(session)} onDerive={() => props.onDerive(session)} onPermanentDelete={() => props.onPermanentDelete?.(session)} />
      ))}
      {props.hasMore && <button type="button" className="session-manager-load-more" onClick={props.onLoadMore} disabled={props.loadingMore}>{props.loadingMore ? t("sidebar.loading") : t("sessionManager.loadMore")}</button>}
    </div>
  );
}

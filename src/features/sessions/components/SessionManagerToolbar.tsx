import type { SessionSource } from "@/types";
import type { SessionManagerStatusFilter } from "../hooks/useSessionManager";
import { useI18n } from "@/features/i18n/I18nProvider";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  showSubagents: boolean;
  onShowSubagentsChange: (value: boolean) => void;
  statusFilter: SessionManagerStatusFilter;
  onStatusFilterChange: (value: SessionManagerStatusFilter) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  sources: SessionSource[];
  selectedArchiveCount: number;
  archiving: boolean;
  onArchiveSelected: () => void;
};

export function SessionManagerToolbar(props: Props) {
  const { t } = useI18n();
  return (
    <div className="session-manager-toolbar">
      <input className="sidebar-search-input" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder={t("sessionManager.search")} aria-label={t("sessionManager.search")} />
      <div className="session-manager-filters">
        <select value={props.statusFilter} onChange={(event) => props.onStatusFilterChange(event.target.value as SessionManagerStatusFilter)} aria-label={t("sessionManager.statusFilter")}>
          <option value="all">{t("sessionManager.all")}</option>
          <option value="active">{t("sessionManager.active")}</option>
          <option value="archived">{t("sessionManager.archived")}</option>
          <option value="missing">{t("sessionManager.missing")}</option>
        </select>
        <select value={props.sourceFilter} onChange={(event) => props.onSourceFilterChange(event.target.value)} aria-label={t("sessionManager.sourceFilter")}>
          <option value="all">{t("sessionManager.allSources")}</option>
          {props.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
        <label className="session-manager-subagents-toggle">
          <input type="checkbox" checked={props.showSubagents} onChange={(event) => props.onShowSubagentsChange(event.target.checked)} />
          {t("sessionManager.showSubagents")}
        </label>
        <button type="button" className="session-manager-archive-selected" onClick={props.onArchiveSelected} disabled={props.selectedArchiveCount === 0 || props.archiving}>
          {props.archiving ? t("sessionManager.archiving") : `${t("sessionManager.archiveSelected")} (${props.selectedArchiveCount})`}
        </button>
      </div>
    </div>
  );
}

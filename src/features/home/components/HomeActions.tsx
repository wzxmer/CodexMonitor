import { useI18n } from "../../i18n/I18nProvider";

type HomeActionsProps = {
  onStartNoProjectChat: () => void;
  onAddWorkspace: () => void;
  onAddWorkspaceFromUrl: () => void;
};

export function HomeActions({
  onStartNoProjectChat,
  onAddWorkspace,
  onAddWorkspaceFromUrl,
}: HomeActionsProps) {
  const { t } = useI18n();
  return (
    <div className="home-actions">
      <button
        className="home-button primary home-start-no-project-button"
        onClick={onStartNoProjectChat}
        data-tauri-drag-region="false"
      >
        <span className="home-icon" aria-hidden>
          ↵
        </span>
        {t("home.actions.noProjectChat")}
      </button>
      <button
        className="home-button secondary home-add-workspaces-button"
        onClick={onAddWorkspace}
        data-tauri-drag-region="false"
      >
        <span className="home-icon" aria-hidden>
          +
        </span>
        {t("home.actions.addWorkspace")}
      </button>
      <button
        className="home-button secondary home-add-workspace-from-url-button"
        onClick={onAddWorkspaceFromUrl}
        data-tauri-drag-region="false"
      >
        <span className="home-icon" aria-hidden>
          ⤓
        </span>
        {t("home.actions.addWorkspaceFromUrl")}
      </button>
    </div>
  );
}

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
        无项目对话
      </button>
      <button
        className="home-button secondary home-add-workspaces-button"
        onClick={onAddWorkspace}
        data-tauri-drag-region="false"
      >
        <span className="home-icon" aria-hidden>
          +
        </span>
        添加项目
      </button>
      <button
        className="home-button secondary home-add-workspace-from-url-button"
        onClick={onAddWorkspaceFromUrl}
        data-tauri-drag-region="false"
      >
        <span className="home-icon" aria-hidden>
          ⤓
        </span>
        从 URL 添加项目
      </button>
    </div>
  );
}

import type { MouseEvent } from "react";
import Ellipsis from "lucide-react/dist/esm/icons/ellipsis";
import Plus from "lucide-react/dist/esm/icons/plus";

import type { WorkspaceInfo } from "../../../types";

type WorkspaceCardProps = {
  workspace: WorkspaceInfo;
  workspaceName?: React.ReactNode;
  summary?: string | null;
  isActive: boolean;
  isCollapsed: boolean;
  addMenuOpen: boolean;
  addMenuWidth: number;
  hideAddButton?: boolean;
  hideConnectButton?: boolean;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  onShowWorkspaceMenu: (event: MouseEvent, workspaceId: string) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onToggleAddMenu: (anchor: {
    workspaceId: string;
    top: number;
    left: number;
    width: number;
  } | null) => void;
  children?: React.ReactNode;
};

export function WorkspaceCard({
  workspace,
  workspaceName,
  summary = null,
  isActive,
  isCollapsed,
  addMenuOpen,
  addMenuWidth,
  hideAddButton = false,
  hideConnectButton = false,
  onAddAgent,
  onShowWorkspaceMenu,
  onToggleWorkspaceCollapse,
  onConnectWorkspace,
  onToggleAddMenu,
  children,
}: WorkspaceCardProps) {
  const contentCollapsedClass = isCollapsed ? " collapsed" : "";
  const toggleWorkspace = () => {
    onToggleWorkspaceCollapse(workspace.id, !isCollapsed);
  };

  return (
    <div className="workspace-card">
      <div
        className={`workspace-row ${isActive ? "active" : ""}`}
        role="button"
        tabIndex={0}
        onClick={toggleWorkspace}
        onContextMenu={(event) => onShowWorkspaceMenu(event, workspace.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleWorkspace();
          }
        }}
      >
        <div className="workspace-copy">
          <div className="workspace-name-row">
            <div className="workspace-title">
              <span className="workspace-name">{workspaceName ?? workspace.name}</span>
              <button
                className={`workspace-toggle ${isCollapsed ? "" : "expanded"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleWorkspace();
                }}
                data-tauri-drag-region="false"
                aria-label={isCollapsed ? "显示 Agents" : "隐藏 Agents"}
                aria-expanded={!isCollapsed}
              >
                <span className="workspace-toggle-icon">›</span>
              </button>
            </div>
          </div>
          {summary && <div className="workspace-summary">{summary}</div>}
        </div>
        <div className="workspace-actions">
          {!hideAddButton && (
            <>
              <button
                className="ghost workspace-add workspace-add-direct"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddAgent(workspace);
                }}
                data-tauri-drag-region="false"
                aria-label="立即创建"
                title="新建 Agent"
              >
                <Plus size={14} aria-hidden />
              </button>
              <button
                className="ghost workspace-add workspace-more"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  const left = Math.min(
                    Math.max(rect.left, 12),
                    window.innerWidth - addMenuWidth - 12,
                  );
                  const top = rect.bottom + 8;
                  onToggleAddMenu(
                    addMenuOpen
                      ? null
                      : {
                          workspaceId: workspace.id,
                          top,
                          left,
                          width: addMenuWidth,
                        },
                  );
                }}
                data-tauri-drag-region="false"
                aria-label="更多 Agent 选项"
                title="更多 Agent 选项"
                aria-expanded={addMenuOpen}
              >
                <Ellipsis size={15} aria-hidden />
              </button>
            </>
          )}
          {!hideConnectButton && !workspace.connected && (
            <span
              className="connect"
              title="连接项目上下文到共享 Codex 服务"
              onClick={(event) => {
                event.stopPropagation();
                onConnectWorkspace(workspace);
              }}
            >
              连接
            </span>
          )}
        </div>
      </div>
      <div
        className={`workspace-card-content${contentCollapsedClass}`}
        aria-hidden={isCollapsed}
        inert={isCollapsed ? true : undefined}
      >
        <div className="workspace-card-content-inner">{children}</div>
      </div>
    </div>
  );
}

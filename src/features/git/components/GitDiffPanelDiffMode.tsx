import type { MouseEvent as ReactMouseEvent } from "react";
import {
  MagicSparkleIcon,
  MagicSparkleLoaderIcon,
} from "@/features/shared/components/MagicSparkleIcon";
import Download from "lucide-react/dist/esm/icons/download";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Upload from "lucide-react/dist/esm/icons/upload";
import { CommitButton, DiffSection, type DiffFile } from "./GitDiffPanelShared";
import {
  DEPTH_OPTIONS,
  isGitRootNotFound,
  isMissingRepo,
  normalizeRootPath,
} from "./GitDiffPanel.utils";

type GitDiffModeContentProps = {
  error: string | null | undefined;
  showGitRootPanel: boolean;
  onScanGitRoots?: () => void;
  gitRootScanLoading: boolean;
  gitRootScanDepth: number;
  onGitRootScanDepthChange?: (depth: number) => void;
  onPickGitRoot?: () => void | Promise<void>;
  onInitGitRepo?: () => void | Promise<void>;
  initGitRepoLoading: boolean;
  hasGitRoot: boolean;
  onClearGitRoot?: () => void;
  gitRootScanError: string | null | undefined;
  gitRootScanHasScanned: boolean;
  gitRootCandidates: string[];
  gitRoot: string | null;
  onSelectGitRoot?: (path: string) => void;
  showGenerateCommitMessage: boolean;
  showApplyWorktree: boolean;
  commitMessage: string;
  onCommitMessageChange?: (value: string) => void;
  commitMessageLoading: boolean;
  canGenerateCommitMessage: boolean;
  onGenerateCommitMessage?: () => void | Promise<void>;
  worktreeApplyTitle: string | null;
  worktreeApplyLoading: boolean;
  worktreeApplySuccess: boolean;
  onApplyWorktreeChanges?: () => void | Promise<void>;
  stagedFiles: DiffFile[];
  unstagedFiles: DiffFile[];
  commitLoading: boolean;
  onCommit?: () => void | Promise<void>;
  commitsAhead: number;
  commitsBehind: number;
  onPull?: () => void | Promise<void>;
  pullLoading: boolean;
  onPush?: () => void | Promise<void>;
  pushLoading: boolean;
  onSync?: () => void | Promise<void>;
  syncLoading: boolean;
  onStageAllChanges?: () => void | Promise<void>;
  onStageFile?: (path: string) => Promise<void> | void;
  onUnstageFile?: (path: string) => Promise<void> | void;
  onDiscardFile?: (path: string) => Promise<void> | void;
  onDiscardFiles?: (paths: string[]) => Promise<void> | void;
  onReviewUncommittedChanges?: () => void | Promise<void>;
  selectedFiles: Set<string>;
  selectedPath: string | null;
  onSelectFile?: (path: string) => void;
  onFileClick: (
    event: ReactMouseEvent<HTMLDivElement>,
    path: string,
    section: "staged" | "unstaged",
  ) => void;
  onShowFileMenu: (
    event: ReactMouseEvent<HTMLDivElement>,
    path: string,
    section: "staged" | "unstaged",
  ) => void;
  onDiffListClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function GitDiffModeContent({
  error,
  showGitRootPanel,
  onScanGitRoots,
  gitRootScanLoading,
  gitRootScanDepth,
  onGitRootScanDepthChange,
  onPickGitRoot,
  onInitGitRepo,
  initGitRepoLoading,
  hasGitRoot,
  onClearGitRoot,
  gitRootScanError,
  gitRootScanHasScanned,
  gitRootCandidates,
  gitRoot,
  onSelectGitRoot,
  showGenerateCommitMessage,
  showApplyWorktree,
  commitMessage,
  onCommitMessageChange,
  commitMessageLoading,
  canGenerateCommitMessage,
  onGenerateCommitMessage,
  worktreeApplyTitle,
  worktreeApplyLoading,
  worktreeApplySuccess,
  onApplyWorktreeChanges,
  stagedFiles,
  unstagedFiles,
  commitLoading,
  onCommit,
  commitsAhead,
  commitsBehind,
  onPull,
  pullLoading,
  onPush,
  pushLoading,
  onSync,
  syncLoading,
  onStageAllChanges,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onDiscardFiles,
  onReviewUncommittedChanges,
  selectedFiles,
  selectedPath,
  onSelectFile,
  onFileClick,
  onShowFileMenu,
  onDiffListClick,
}: GitDiffModeContentProps) {
  const normalizedGitRoot = normalizeRootPath(gitRoot);
  const missingRepo = isMissingRepo(error);
  const gitRootNotFound = isGitRootNotFound(error);
  const showInitGitRepo = Boolean(onInitGitRepo) && missingRepo && !gitRootNotFound;
  const gitRootTitle = gitRootNotFound
    ? "未找到 Git 根目录。"
    : missingRepo
      ? "这个项目还不是 Git 仓库。"
      : "为这个项目选择仓库。";
  const generateCommitMessageTooltip = "生成提交信息";
  const showWorktreeApplyInUnstaged = showApplyWorktree && unstagedFiles.length > 0;
  const showWorktreeApplyInStaged =
    showApplyWorktree && unstagedFiles.length === 0 && stagedFiles.length > 0;

  return (
    <div className="diff-list" onClick={onDiffListClick}>
      {showGitRootPanel && (
        <div className="git-root-panel">
          <div className="git-root-title">{gitRootTitle}</div>
          {showInitGitRepo && (
            <div className="git-root-primary-action">
              <button
                type="button"
                className="primary git-root-button"
                onClick={() => {
                  void onInitGitRepo?.();
                }}
                disabled={initGitRepoLoading || gitRootScanLoading}
              >
                {initGitRepoLoading ? "正在初始化..." : "初始化 Git"}
              </button>
            </div>
          )}
          <div className="git-root-actions">
            <button
              type="button"
              className="ghost git-root-button"
              onClick={onScanGitRoots}
              disabled={!onScanGitRoots || gitRootScanLoading || initGitRepoLoading}
            >
              扫描项目
            </button>
            <label className="git-root-depth">
              <span>深度</span>
              <select
                className="git-root-select"
                value={gitRootScanDepth}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isNaN(value)) {
                    onGitRootScanDepthChange?.(value);
                  }
                }}
                disabled={gitRootScanLoading || initGitRepoLoading}
              >
                {DEPTH_OPTIONS.map((depth) => (
                  <option key={depth} value={depth}>
                    {depth}
                  </option>
                ))}
              </select>
            </label>
            {onPickGitRoot && (
              <button
                type="button"
                className="ghost git-root-button"
                onClick={() => {
                  void onPickGitRoot();
                }}
                disabled={gitRootScanLoading || initGitRepoLoading}
              >
                选择文件夹
              </button>
            )}
            {hasGitRoot && onClearGitRoot && (
              <button
                type="button"
                className="ghost git-root-button"
                onClick={onClearGitRoot}
                disabled={gitRootScanLoading || initGitRepoLoading}
              >
                使用项目根目录
              </button>
            )}
          </div>
          {gitRootScanLoading && (
            <div className="diff-empty">正在扫描仓库...</div>
          )}
          {!gitRootScanLoading &&
            !gitRootScanError &&
            gitRootScanHasScanned &&
            gitRootCandidates.length === 0 && (
              <div className="diff-empty">没有找到仓库。</div>
            )}
          {gitRootCandidates.length > 0 && (
            <div className="git-root-list">
              {gitRootCandidates.map((path) => {
                const normalizedPath = normalizeRootPath(path);
                const isActive = normalizedGitRoot && normalizedGitRoot === normalizedPath;
                return (
                  <button
                    key={path}
                    type="button"
                    className={`git-root-item ${isActive ? "active" : ""}`}
                    onClick={() => onSelectGitRoot?.(path)}
                  >
                    <span className="git-root-path">{path}</span>
                    {isActive && <span className="git-root-tag">当前</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {showGenerateCommitMessage && (
        <div className="commit-message-section">
          <div className="commit-message-input-wrapper">
            <textarea
              className="commit-message-input"
              placeholder="提交信息..."
              value={commitMessage}
              onChange={(event) => onCommitMessageChange?.(event.target.value)}
              disabled={commitMessageLoading}
              rows={2}
            />
            <button
              type="button"
              className="commit-message-generate-button diff-row-action ds-tooltip-trigger"
              onClick={() => {
                if (!canGenerateCommitMessage) {
                  return;
                }
                void onGenerateCommitMessage?.();
              }}
              disabled={commitMessageLoading || !canGenerateCommitMessage}
              title={generateCommitMessageTooltip}
              data-tooltip={generateCommitMessageTooltip}
              data-tooltip-placement="bottom"
              data-tooltip-align="end"
              aria-label="生成提交信息"
            >
              {commitMessageLoading ? (
                <MagicSparkleLoaderIcon className="commit-message-loader" />
              ) : (
                <MagicSparkleIcon />
              )}
            </button>
          </div>
          <CommitButton
            commitMessage={commitMessage}
            hasStagedFiles={stagedFiles.length > 0}
            hasUnstagedFiles={unstagedFiles.length > 0}
            commitLoading={commitLoading}
            onCommit={onCommit}
          />
        </div>
      )}
      {(commitsAhead > 0 || commitsBehind > 0) && !stagedFiles.length && (
        <div className="push-section">
          <div className="push-sync-buttons">
            {commitsBehind > 0 && (
              <button
                type="button"
                className="push-button-secondary"
                onClick={() => void onPull?.()}
                disabled={!onPull || pullLoading || syncLoading}
                title={`拉取 ${commitsBehind} 个提交`}
              >
                {pullLoading ? (
                  <span className="commit-button-spinner" aria-hidden />
                ) : (
                  <Download size={14} aria-hidden />
                )}
                <span>{pullLoading ? "拉取中..." : "拉取"}</span>
                <span className="push-count">{commitsBehind}</span>
              </button>
            )}
            {commitsAhead > 0 && (
              <button
                type="button"
                className="push-button"
                onClick={() => void onPush?.()}
                disabled={!onPush || pushLoading || commitsBehind > 0}
                title={
                  commitsBehind > 0
                    ? "远端有新提交。先拉取，或使用同步。"
                    : `推送 ${commitsAhead} 个提交`
                }
              >
                {pushLoading ? (
                  <span className="commit-button-spinner" aria-hidden />
                ) : (
                  <Upload size={14} aria-hidden />
                )}
                <span>推送</span>
                <span className="push-count">{commitsAhead}</span>
              </button>
            )}
          </div>
          {commitsAhead > 0 && commitsBehind > 0 && (
            <button
              type="button"
              className="push-button-secondary"
              onClick={() => void onSync?.()}
              disabled={!onSync || syncLoading || pullLoading}
              title="拉取最新改动并推送本地提交"
            >
              {syncLoading ? (
                <span className="commit-button-spinner" aria-hidden />
              ) : (
                <RotateCcw size={14} aria-hidden />
              )}
              <span>{syncLoading ? "同步中..." : "同步（先拉取后推送）"}</span>
            </button>
          )}
        </div>
      )}
      {!error &&
        !stagedFiles.length &&
        !unstagedFiles.length &&
        commitsAhead === 0 &&
        commitsBehind === 0 && <div className="diff-empty">没有检测到改动。</div>}
      {(stagedFiles.length > 0 || unstagedFiles.length > 0) && (
        <>
          {stagedFiles.length > 0 && (
            <DiffSection
              title="已暂存"
              files={stagedFiles}
              section="staged"
              selectedFiles={selectedFiles}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              onUnstageFile={onUnstageFile}
              onDiscardFile={onDiscardFile}
              onDiscardFiles={onDiscardFiles}
              showWorktreeApplyAction={showWorktreeApplyInStaged}
              worktreeApplyTitle={worktreeApplyTitle}
              worktreeApplyLoading={worktreeApplyLoading}
              worktreeApplySuccess={worktreeApplySuccess}
              onApplyWorktreeChanges={onApplyWorktreeChanges}
              onFileClick={onFileClick}
              onShowFileMenu={onShowFileMenu}
            />
          )}
          {unstagedFiles.length > 0 && (
            <DiffSection
              title="未暂存"
              files={unstagedFiles}
              section="unstaged"
              selectedFiles={selectedFiles}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              onStageAllChanges={onStageAllChanges}
              onStageFile={onStageFile}
              onDiscardFile={onDiscardFile}
              onDiscardFiles={onDiscardFiles}
              onReviewUncommittedChanges={onReviewUncommittedChanges}
              showWorktreeApplyAction={showWorktreeApplyInUnstaged}
              worktreeApplyTitle={worktreeApplyTitle}
              worktreeApplyLoading={worktreeApplyLoading}
              worktreeApplySuccess={worktreeApplySuccess}
              onApplyWorktreeChanges={onApplyWorktreeChanges}
              onFileClick={onFileClick}
              onShowFileMenu={onShowFileMenu}
            />
          )}
        </>
      )}
    </div>
  );
}

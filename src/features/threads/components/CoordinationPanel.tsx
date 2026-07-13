import { useMemo, useState } from "react";
import { useI18n } from "@/features/i18n/I18nProvider";
import { useTaskCoordination } from "@/features/app/hooks/useTaskCoordination";
import type {
  TaskCoordinationGroup,
  TaskCoordinationThreadKey,
  TaskResourceClaim,
  ConflictResult,
} from "@/types";

type CoordinationPanelProps = {
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  workspacePath: string | null;
};

export function CoordinationPanel({
  activeWorkspaceId,
  activeThreadId,
  workspacePath,
}: CoordinationPanelProps) {
  const { t } = useI18n();
  const coordination = useTaskCoordination({
    enabled: true,
    activeWorkspaceId,
    activeThreadId,
  });

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [claimResourceKey, setClaimResourceKey] = useState("");
  const [claimKind, setClaimKind] = useState<"file" | "directory" | "logical">("file");
  const [claimAccess, setClaimAccess] = useState<"read" | "write" | "exclusive">("write");
  const [lastClaimResult, setLastClaimResult] = useState<
    TaskResourceClaim | ConflictResult | null
  >(null);

  const selectedGroup = useMemo(
    () => coordination.groups.find((g) => g.id === selectedGroupId) ?? null,
    [coordination.groups, selectedGroupId],
  );

  const threadKey: TaskCoordinationThreadKey | null = useMemo(() => {
    if (!activeWorkspaceId || !activeThreadId) return null;
    return {
      source: "local",
      workspace_id: activeWorkspaceId,
      thread_id: activeThreadId,
    };
  }, [activeWorkspaceId, activeThreadId]);

  const handleCreateGroup = () => {
    if (!workspacePath || !threadKey) return;
    const now = Date.now();
    const group: TaskCoordinationGroup = {
      id: `group-${now}-${Math.random().toString(16).slice(2, 8)}`,
      name: `Coordination ${new Date(now).toLocaleString()}`,
      repository_id: workspacePath,
      repository_root: workspacePath,
      base_revision: null,
      coordinator_thread_key: threadKey,
      mode: "guarded",
      status: "active",
      created_at: now,
      updated_at: now,
    };
    void coordination.createGroup(group);
  };

  const handleAcquireClaim = () => {
    if (!selectedGroupId || !threadKey || !claimResourceKey.trim()) return;
    void coordination
      .acquireClaim(selectedGroupId, threadKey, claimKind, claimResourceKey.trim(), claimAccess)
      .then((result) => {
        setLastClaimResult(result);
      });
  };

  if (!activeWorkspaceId || !activeThreadId) {
    return (
      <div className="coordination-panel">
        <div className="coordination-header">
          <span className="coordination-title">{t("coordination.title")}</span>
        </div>
        <div className="coordination-empty">{t("coordination.noActiveThread")}</div>
      </div>
    );
  }

  return (
    <div className="coordination-panel">
      <div className="coordination-header">
        <span className="coordination-title">{t("coordination.title")}</span>
        <span className="coordination-subtitle">{t("coordination.subtitle")}</span>
      </div>

      {coordination.loading && (
        <div className="coordination-loading">...</div>
      )}
      {coordination.error && (
        <div className="coordination-error">{coordination.error}</div>
      )}

      <div className="coordination-section">
        <button
          type="button"
          className="ghost coordination-create-btn"
          onClick={handleCreateGroup}
          disabled={!workspacePath}
        >
          {t("coordination.createGroup")}
        </button>
      </div>

      {coordination.groups.length > 0 && (
        <div className="coordination-section">
          <div className="coordination-label">{t("coordination.groupList")}</div>
          <select
            className="coordination-group-select"
            value={selectedGroupId ?? ""}
            onChange={(e) => {
              setSelectedGroupId(e.target.value || null);
              setLastClaimResult(null);
            }}
            aria-label={t("coordination.groupList")}
          >
            <option value="">--</option>
            {coordination.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.status})
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedGroup && (
        <div className="coordination-section">
          <div className="coordination-label">{t("coordination.claimResource")}</div>
          <input
            type="text"
            className="coordination-input"
            placeholder="/path/to/resource"
            value={claimResourceKey}
            onChange={(e) => setClaimResourceKey(e.target.value)}
            aria-label={t("coordination.claimResource")}
          />
          <div className="coordination-row">
            <select
              className="coordination-select"
              value={claimKind}
              onChange={(e) =>
                setClaimKind(e.target.value as "file" | "directory" | "logical")
              }
              aria-label={t("coordination.resourceKind")}
            >
              <option value="file">File</option>
              <option value="directory">Directory</option>
              <option value="logical">Logical</option>
            </select>
            <select
              className="coordination-select"
              value={claimAccess}
              onChange={(e) =>
                setClaimAccess(e.target.value as "read" | "write" | "exclusive")
              }
              aria-label={t("coordination.accessLevel")}
            >
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="exclusive">Exclusive</option>
            </select>
            <button
              type="button"
              className="primary coordination-claim-btn"
              onClick={handleAcquireClaim}
              disabled={!claimResourceKey.trim()}
            >
              {t("coordination.claimResource")}
            </button>
          </div>
          {lastClaimResult && "conflicting_claim_id" in lastClaimResult && (
            <div className="coordination-conflict">
              {t("coordination.conflictBlocked")}: {(lastClaimResult as ConflictResult).reason}
            </div>
          )}
          {lastClaimResult && "resource_key" in lastClaimResult && (
            <div className="coordination-claim-granted">
              {t("coordination.claimGranted")}: {(lastClaimResult as TaskResourceClaim).resource_key}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

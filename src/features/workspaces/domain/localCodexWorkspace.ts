import type { WorkspaceGroup } from "@/types";
import type { WorkspaceGroupSection } from "./workspaceGroups";

export const LOCAL_CODEX_WORKSPACE_ID = "__local_codex_sessions__";
export const LOCAL_CODEX_GROUP_ID = "__local_codex_group__";
export const LOCAL_CODEX_GROUP_NAME = "本机 Codex";
export const LOCAL_CODEX_WORKSPACE_NAME = "本机 Codex 历史会话";

export function isLocalCodexWorkspaceId(workspaceId: string | null | undefined) {
  return workspaceId === LOCAL_CODEX_WORKSPACE_ID;
}

export function appendLocalCodexWorkspaceGroup(
  groups: WorkspaceGroupSection[],
  workspaceGroups: WorkspaceGroup[],
): WorkspaceGroupSection[] {
  const localGroup = workspaceGroups.find((group) => group.id === LOCAL_CODEX_GROUP_ID);
  return [
    ...groups,
    {
      id: LOCAL_CODEX_GROUP_ID,
      name: localGroup?.name ?? LOCAL_CODEX_GROUP_NAME,
      workspaces: [
        {
          id: LOCAL_CODEX_WORKSPACE_ID,
          name: LOCAL_CODEX_WORKSPACE_NAME,
          path: "",
          connected: true,
          settings: {
            sidebarCollapsed: false,
            groupId: LOCAL_CODEX_GROUP_ID,
            sortOrder: Number.MAX_SAFE_INTEGER,
          },
        },
      ],
    },
  ];
}

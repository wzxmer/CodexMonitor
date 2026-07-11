export const LOCAL_CODEX_WORKSPACE_ID = "__local_codex_sessions__";
export const LOCAL_CODEX_GROUP_ID = "__local_codex_group__";
export const LOCAL_CODEX_GROUP_NAME = "本机 Codex";
export const LOCAL_CODEX_WORKSPACE_NAME = "无项目对话";

export function isLocalCodexWorkspaceId(workspaceId: string | null | undefined) {
  return workspaceId === LOCAL_CODEX_WORKSPACE_ID;
}

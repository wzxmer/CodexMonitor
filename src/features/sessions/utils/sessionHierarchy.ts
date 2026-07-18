import type { ManagedSession } from "@/types";

export type ManagedSessionTree = {
  root: ManagedSession;
  rows: Array<{ session: ManagedSession; depth: number }>;
};

const scopedThreadKey = (session: Pick<ManagedSession, "sourceId" | "threadId">) =>
  `${session.sourceId}:${session.threadId}`;

export function buildManagedSessionTrees(sessions: ManagedSession[]): ManagedSessionTree[] {
  const sessionByThread = new Map(sessions.map((session) => [scopedThreadKey(session), session]));
  const childrenByParent = new Map<string, ManagedSession[]>();
  const roots: ManagedSession[] = [];

  sessions.forEach((session) => {
    const parentKey = session.parentThreadId
      ? `${session.sourceId}:${session.parentThreadId}`
      : null;
    if (!parentKey || parentKey === scopedThreadKey(session) || !sessionByThread.has(parentKey)) {
      roots.push(session);
      return;
    }
    const children = childrenByParent.get(parentKey) ?? [];
    children.push(session);
    childrenByParent.set(parentKey, children);
  });

  const visited = new Set<string>();
  const buildTree = (root: ManagedSession): ManagedSessionTree => {
    const rows: ManagedSessionTree["rows"] = [];
    const visiting = new Set<string>();
    const visit = (session: ManagedSession, depth: number) => {
      if (visited.has(session.key) || visiting.has(session.key)) return;
      visiting.add(session.key);
      visited.add(session.key);
      rows.push({ session, depth });
      (childrenByParent.get(scopedThreadKey(session)) ?? []).forEach((child) => visit(child, depth + 1));
      visiting.delete(session.key);
    };
    visit(root, 0);
    return { root, rows };
  };

  const trees = roots.map(buildTree);
  sessions.forEach((session) => {
    if (!visited.has(session.key)) trees.push(buildTree(session));
  });
  return trees;
}

import { describe, expect, it } from "vitest";
import type { ManagedSession } from "@/types";
import { buildManagedSessionTrees } from "./sessionHierarchy";

const session = (threadId: string, parentThreadId: string | null = null): ManagedSession => ({
  key: `source-a:${threadId}`,
  sourceId: "source-a",
  threadId,
  sourceKind: "cli",
  cwd: "C:/project",
  title: threadId,
  preview: null,
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  isArchived: false,
  parentThreadId,
  isSubagent: parentThreadId !== null,
  subagentNickname: null,
  subagentRole: null,
  projectExists: true,
  fileStatus: "mapped",
  fileConfidence: "exact",
});

describe("buildManagedSessionTrees", () => {
  it("preserves root and sibling order while nesting descendants", () => {
    const parent = session("parent");
    const siblingRoot = session("root-b");
    const childA = session("child-a", "parent");
    const grandchild = session("grandchild", "child-a");
    const childB = session("child-b", "parent");
    const trees = buildManagedSessionTrees([parent, siblingRoot, childA, grandchild, childB]);
    expect(trees.map((tree) => tree.root.threadId)).toEqual(["parent", "root-b"]);
    expect(trees[0].rows.map(({ session: row, depth }) => [row.threadId, depth])).toEqual([
      ["parent", 0],
      ["child-a", 1],
      ["grandchild", 2],
      ["child-b", 1],
    ]);
  });

  it("promotes an orphan and remains finite for cycles", () => {
    const orphan = session("orphan", "missing");
    const cycleA = session("cycle-a", "cycle-b");
    const cycleB = session("cycle-b", "cycle-a");
    const rows = buildManagedSessionTrees([orphan, cycleA, cycleB]).flatMap((tree) => tree.rows);
    expect(rows.map(({ session: row }) => row.threadId)).toEqual(["orphan", "cycle-a", "cycle-b"]);
  });
});

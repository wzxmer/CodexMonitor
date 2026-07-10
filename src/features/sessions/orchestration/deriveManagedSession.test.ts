import { describe, expect, it, vi } from "vitest";
import type { ManagedSessionDerivationPreview, WorkspaceInfo } from "@/types";
import { deriveManagedSessionIntoWorkspace } from "./deriveManagedSession";

const destination: WorkspaceInfo = { id: "ws-1", name: "Target", path: "C:/target", connected: false, kind: "main", parentId: null, worktree: null, settings: { sidebarCollapsed: false } };
const preview: ManagedSessionDerivationPreview = {
  sourceSession: { key: "source-a:thread-a", sourceId: "source-a", threadId: "thread-a", sourceKind: "cli", cwd: "C:/source", title: "Original", preview: null, createdAt: 1, updatedAt: 2, archivedAt: null, isArchived: false, parentThreadId: null, isSubagent: false, subagentNickname: null, subagentRole: null, projectExists: true, fileStatus: "mapped", fileConfidence: "exact" },
  sourceName: "Primary",
  sourceSessionKey: "source-a:thread-a",
  handoffContent: "# Session handoff",
  userMessageCount: 1,
  agentReplyCount: 1,
  incomplete: false,
};

describe("deriveManagedSessionIntoWorkspace", () => {
  it("connects, starts, sends, then persists provenance", async () => {
    const calls: string[] = [];
    const threadId = await deriveManagedSessionIntoWorkspace({
      destination,
      preview,
      connectWorkspace: vi.fn(async () => { calls.push("connect"); }),
      startThreadForWorkspace: vi.fn(async () => { calls.push("start"); return "thread-new"; }),
      sendUserMessageToThread: vi.fn(async () => { calls.push("send"); return { status: "sent" as const }; }),
      persistDerivation: vi.fn(() => { calls.push("persist"); }),
      startError: "start failed",
      sendError: "send failed",
      now: () => 10,
    });
    expect(threadId).toBe("thread-new");
    expect(calls).toEqual(["connect", "start", "send", "persist"]);
  });

  it("does not persist provenance when send fails", async () => {
    const persistDerivation = vi.fn();
    await expect(deriveManagedSessionIntoWorkspace({
      destination: { ...destination, connected: true },
      preview,
      connectWorkspace: vi.fn(),
      startThreadForWorkspace: vi.fn().mockResolvedValue("thread-new"),
      sendUserMessageToThread: vi.fn().mockResolvedValue({ status: "blocked" }),
      persistDerivation,
      startError: "start failed",
      sendError: "send failed",
    })).rejects.toThrow("send failed");
    expect(persistDerivation).not.toHaveBeenCalled();
  });
});

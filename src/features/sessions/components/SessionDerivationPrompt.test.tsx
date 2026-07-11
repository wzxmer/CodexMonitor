// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionDerivationPrompt } from "./SessionDerivationPrompt";

afterEach(cleanup);

describe("SessionDerivationPrompt", () => {
  it("previews source, destination, counts, and confirms", () => {
    const onConfirm = vi.fn();
    render(<SessionDerivationPrompt
      preview={{
        sourceSession: { key: "source-a:thread-a", sourceId: "source-a", threadId: "thread-a", sourceKind: "cli", cwd: "C:/source", title: "Original", preview: null, createdAt: 1, updatedAt: 2, archivedAt: null, isArchived: false, parentThreadId: null, isSubagent: false, subagentNickname: null, subagentRole: null, projectExists: true, fileStatus: "mapped", fileConfidence: "exact" },
        sourceName: "Primary",
        sourceSessionKey: "source-a:thread-a",
        handoffContent: "# Session handoff",
        userMessageCount: 2,
        agentReplyCount: 1,
        incomplete: false,
      }}
      destination={{ id: "ws-1", name: "Target", path: "C:/target", connected: true, kind: "main", parentId: null, worktree: null, settings: { sidebarCollapsed: false } }}
      error={null}
      isBusy={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />);
    expect(screen.getByText(/Primary · Original/)).toBeTruthy();
    expect(screen.getByText(/Target · C:\/target/)).toBeTruthy();
    expect((screen.getByLabelText("交接内容预览") as HTMLTextAreaElement).value).toBe("# Session handoff");
    fireEvent.click(screen.getByRole("button", { name: "创建引用会话" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

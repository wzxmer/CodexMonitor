// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConversationItem, ThreadSummary } from "@/types";
import { generateRunMetadata } from "@services/tauri";
import { useThreadTitleAutogeneration } from "./useThreadTitleAutogeneration";

vi.mock("@services/tauri", () => ({
  generateRunMetadata: vi.fn(),
}));

describe("useThreadTitleAutogeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup({
    enabled = true,
    initialCustomName,
    threadName = "New Agent",
    parentThreadName,
    existingItems = [],
  }: {
    enabled?: boolean;
    initialCustomName?: string;
    threadName?: string;
    parentThreadName?: string;
    existingItems?: ConversationItem[];
  } = {}) {
    let customName = initialCustomName;
    const getCustomName = vi.fn(() => customName);
    const renameThread = vi.fn((_workspaceId: string, _threadId: string, title: string) => {
      customName = title;
    });

    const itemsByThreadRef = {
      current: { "thread-1": existingItems },
    };
    const threadsByWorkspaceRef: {
      current: Record<string, ThreadSummary[]>;
    } = {
      current: {
        "ws-1": [
          ...(parentThreadName
            ? [
                {
                  id: "thread-parent",
                  name: parentThreadName,
                  updatedAt: 1,
                } as ThreadSummary,
              ]
            : []),
          { id: "thread-1", name: threadName, updatedAt: 0 } as ThreadSummary,
        ],
      },
    };
    const persistGeneratedTitle = vi.fn(
      (_workspaceId: string, threadId: string, title: string) => {
        const index = threadsByWorkspaceRef.current["ws-1"].findIndex(
          (thread) => thread.id === threadId,
        );
        if (index >= 0) {
          threadsByWorkspaceRef.current["ws-1"][index] = {
            ...threadsByWorkspaceRef.current["ws-1"][index],
            name: title,
          };
        }
      },
    );

    const { result } = renderHook(() =>
      useThreadTitleAutogeneration({
        enabled,
        itemsByThreadRef,
        threadsByWorkspace: threadsByWorkspaceRef.current,
        threadsByWorkspaceRef,
        getCustomName,
        renameThread,
        persistGeneratedTitle,
      }),
    );

    return {
      result,
      getCustomName,
      renameThread,
      persistGeneratedTitle,
      setCustomName: (value: string) => {
        customName = value;
      },
      setThreadName: (value: string) => {
        const index = threadsByWorkspaceRef.current["ws-1"].findIndex(
          (thread) => thread.id === "thread-1",
        );
        threadsByWorkspaceRef.current["ws-1"][index] = {
          ...threadsByWorkspaceRef.current["ws-1"][index],
          name: value,
        };
      },
      setWorkspaceThreads: (workspaceId: string, threads: ThreadSummary[]) => {
        threadsByWorkspaceRef.current[workspaceId] = threads;
      },
    };
  }

  it("generates and persists a title for the first user message in a new thread", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Generated Title",
      worktreeName: "feat/generated-title",
    });
    const { result, renameThread } = setup();

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).toHaveBeenCalledWith("ws-1", "Hello there");
    expect(renameThread).toHaveBeenCalledWith("ws-1", "thread-1", "Generated Title");
  });

  it("does nothing when disabled", async () => {
    const { result } = setup({ enabled: false });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("does not override custom names", async () => {
    const { result } = setup({ initialCustomName: "Custom" });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("generates when the current thread name is only the prompt preview", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Generated Title",
      worktreeName: "feat/generated-title",
    });
    const { result, renameThread } = setup({
      threadName: "Summarize this service failure",
    });

    await act(async () => {
      await result.current.onUserMessageCreated(
        "ws-1",
        "thread-1",
        "Summarize this service failure",
      );
    });

    expect(generateRunMetadata).toHaveBeenCalledWith(
      "ws-1",
      "Summarize this service failure",
    );
    expect(renameThread).toHaveBeenCalledWith("ws-1", "thread-1", "Generated Title");
  });

  it("does not override a manual-looking thread name that differs from the prompt preview", async () => {
    const { result } = setup({
      threadName: "Manual incident notes",
    });

    await act(async () => {
      await result.current.onUserMessageCreated(
        "ws-1",
        "thread-1",
        "Summarize this service failure",
      );
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("does not run when a user message already exists", async () => {
    const { result } = setup({
      existingItems: [{ id: "user-1", kind: "message", role: "user", text: "Old" }],
    });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("still generates when the first user message was already echoed locally", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Generated Title",
      worktreeName: "feat/generated-title",
    });
    const { result, renameThread } = setup({
      existingItems: [
        { id: "local-user-1", kind: "message", role: "user", text: "Hello there" },
      ],
    });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).toHaveBeenCalledWith("ws-1", "Hello there");
    expect(renameThread).toHaveBeenCalledWith("ws-1", "thread-1", "Generated Title");
  });

  it("does not treat a matching old message in an existing conversation as local echo", async () => {
    const { result } = setup({
      existingItems: [
        { id: "user-1", kind: "message", role: "user", text: "Hello there" },
        { id: "assistant-1", kind: "message", role: "assistant", text: "Hi" },
      ],
    });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("treats UUID placeholder thread names as auto-generated", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Commit review summary",
      worktreeName: "feat/review-summary",
    });
    const { result, renameThread } = setup({
      threadName: "019c9e0e-7f97-78f2-a719-d28af9fb76b6",
    });

    await act(async () => {
      await result.current.onUserMessageCreated("ws-1", "thread-1", "Review this commit");
    });

    expect(generateRunMetadata).toHaveBeenCalledWith("ws-1", "Review this commit");
    expect(renameThread).toHaveBeenCalledWith("ws-1", "thread-1", "Commit review summary");
  });

  it("avoids duplicate generation while in flight", async () => {
    let resolvePromise!: (value: { title: string; worktreeName: string }) => void;
    const pending = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(generateRunMetadata).mockReturnValue(pending);

    const { result } = setup();

    const p1 = result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    const p2 = result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there again");

    expect(generateRunMetadata).toHaveBeenCalledTimes(1);

    resolvePromise({ title: "Generated Title", worktreeName: "feat/x" });
    await act(async () => {
      await Promise.all([p1, p2]);
    });
  });

  it("does not override if a custom name appears while generating", async () => {
    let resolvePromise!: (value: { title: string; worktreeName: string }) => void;
    const pending = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(generateRunMetadata).mockReturnValue(pending);

    const { result, renameThread, setCustomName } = setup();

    const promise = result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    setCustomName("Manual rename");
    resolvePromise({ title: "Generated Title", worktreeName: "feat/x" });

    await act(async () => {
      await promise;
    });

    expect(renameThread).not.toHaveBeenCalled();
  });

  it("does not override if a formal Codex title appears while generating", async () => {
    let resolvePromise!: (value: { title: string; worktreeName: string }) => void;
    const pending = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(generateRunMetadata).mockReturnValue(pending);

    const { result, renameThread, setThreadName } = setup({
      threadName: "Summarize this service failure",
    });

    const promise = result.current.onUserMessageCreated(
      "ws-1",
      "thread-1",
      "Summarize this service failure",
    );
    setThreadName("Official Codex title");
    resolvePromise({ title: "Generated Title", worktreeName: "feat/x" });

    await act(async () => {
      await promise;
    });

    expect(renameThread).not.toHaveBeenCalled();
  });

  it("does not persist a generated title if disabled while generation is in flight", async () => {
    let resolvePromise!: (value: { title: string; worktreeName: string }) => void;
    const pending = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(generateRunMetadata).mockReturnValue(pending);

    let enabled = true;
    const getCustomName = vi.fn(() => undefined);
    const renameThread = vi.fn();
    const itemsByThreadRef = { current: { "thread-1": [] } };
    const threadsByWorkspaceRef = {
      current: {
        "ws-1": [
          { id: "thread-1", name: "New Agent", updatedAt: 0 } as ThreadSummary,
        ],
      },
    };
    const { result, rerender } = renderHook(() =>
      useThreadTitleAutogeneration({
        enabled,
        itemsByThreadRef,
        threadsByWorkspace: threadsByWorkspaceRef.current,
        threadsByWorkspaceRef,
        getCustomName,
        renameThread,
        persistGeneratedTitle: renameThread,
      }),
    );

    const promise = result.current.onUserMessageCreated("ws-1", "thread-1", "Hello there");
    enabled = false;
    rerender();
    resolvePromise({ title: "Generated Title", worktreeName: "feat/x" });

    await act(async () => {
      await promise;
    });

    expect(renameThread).not.toHaveBeenCalled();
  });

  it("generates a Chinese display title for an English subagent slug under a Chinese parent", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "分支清理审查",
      worktreeName: "chore/branch-cleanup-audit",
    });
    const { result, renameThread, persistGeneratedTitle } = setup({
      parentThreadName: "完善 Context 与 Provider 跨层反馈链",
      threadName: "branch cleanup audit",
    });

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", {
        id: "thread-1",
        name: null,
        source: {
          subAgent: {
            thread_spawn: {
              parent_thread_id: "thread-parent",
              agent_path: "/root/branch_cleanup_audit",
            },
          },
        },
      });
    });

    expect(generateRunMetadata).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining(
        "父会话标题 / Parent conversation title：完善 Context 与 Provider 跨层反馈链",
      ),
    );
    expect(generateRunMetadata).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining(
        "子任务标识 / Subagent task identifier：branch cleanup audit",
      ),
    );
    expect(vi.mocked(generateRunMetadata).mock.calls[0]?.[1]).not.toContain(
      "只输出标题",
    );
    expect(persistGeneratedTitle).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "分支清理审查",
    );
    expect(renameThread).not.toHaveBeenCalled();
  });

  it("keeps English subagent titles under an English parent", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Branch Cleanup Audit",
      worktreeName: "chore/branch-cleanup-audit",
    });
    const { result, persistGeneratedTitle } = setup({
      parentThreadName: "Stabilize Session Routing",
      threadName: "branch cleanup audit",
    });

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", {
        id: "thread-1",
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "thread-parent",
              agent_path: "/root/branch_cleanup_audit",
            },
          },
        },
      });
    });

    expect(generateRunMetadata).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining("Parent conversation title: Stabilize Session Routing"),
    );
    expect(vi.mocked(generateRunMetadata).mock.calls[0]?.[1]).not.toContain(
      "Return only the title",
    );
    expect(persistGeneratedTitle).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "Branch Cleanup Audit",
    );
  });

  it("does not replace an existing formal subagent title", async () => {
    const { result } = setup({
      parentThreadName: "完善会话路由",
      threadName: "已有正式标题",
    });

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", {
        id: "thread-1",
        name: "已有正式标题",
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "thread-parent",
              agent_path: "/root/routing_audit",
            },
          },
        },
      });
    });

    expect(generateRunMetadata).not.toHaveBeenCalled();
  });

  it("does not treat a subagent placeholder name as a formal title", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "路由审查",
      worktreeName: "chore/routing-audit",
    });
    const { result, persistGeneratedTitle } = setup({
      parentThreadName: "完善会话路由",
      threadName: "New Agent",
    });

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", {
        id: "thread-1",
        name: "New Agent",
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "thread-parent",
              agent_path: "/root/routing_audit",
            },
          },
        },
      });
    });

    expect(persistGeneratedTitle).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "路由审查",
    );
  });

  it("delegates mixed Chinese titles to the parent-language metadata rule", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "修复接口地址",
      worktreeName: "fix/api-provider-url",
    });
    const { result } = setup({
      parentThreadName: "Provider 兼容性检查",
      threadName: "api provider url fix",
    });

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", {
        id: "thread-1",
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "thread-parent",
              agent_path: "/root/api_provider_url_fix",
            },
          },
        },
      });
    });

    expect(generateRunMetadata).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining(
        "父会话标题 / Parent conversation title：Provider 兼容性检查",
      ),
    );
  });

  it("does not force Chinese for an English-primary mixed parent title", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Fix Locale Fallback",
      worktreeName: "fix/locale-fallback",
    });
    const { result, persistGeneratedTitle } = setup({
      parentThreadName: "Fix the 中文 locale fallback",
      threadName: "locale fallback fix",
    });

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", {
        id: "thread-1",
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "thread-parent",
              agent_path: "/root/locale_fallback_fix",
            },
          },
        },
      });
    });

    expect(generateRunMetadata).toHaveBeenCalledWith(
      "ws-1",
      expect.stringContaining(
        "父会话标题 / Parent conversation title：Fix the 中文 locale fallback",
      ),
    );
    expect(persistGeneratedTitle).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "Fix Locale Fallback",
    );
  });

  it("rejects a generated title that does not match the parent language", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Branch Cleanup Audit",
      worktreeName: "chore/branch-cleanup-audit",
    });
    const { result, persistGeneratedTitle } = setup({
      parentThreadName: "完善会话路由",
      threadName: "branch cleanup audit",
    });

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", {
        id: "thread-1",
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "thread-parent",
              agent_path: "/root/branch_cleanup_audit",
            },
          },
        },
      });
    });

    expect(persistGeneratedTitle).not.toHaveBeenCalled();
  });

  it("bounds retries after repeated language-mismatched subagent titles", async () => {
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Branch Cleanup Audit",
      worktreeName: "chore/branch-cleanup-audit",
    });
    const { result } = setup({
      parentThreadName: "完善会话路由",
      threadName: "branch cleanup audit",
    });
    const thread = {
      id: "thread-1",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "thread-parent",
            agent_path: "/root/branch_cleanup_audit",
          },
        },
      },
    };

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", thread);
      await result.current.onSubagentThreadDetected("ws-1", thread);
      await result.current.onSubagentThreadDetected("ws-1", thread);
    });

    expect(generateRunMetadata).toHaveBeenCalledTimes(2);
  });

  it("automatically retries a failed subagent title once", async () => {
    vi.useFakeTimers();
    vi.mocked(generateRunMetadata).mockResolvedValue({
      title: "Branch Cleanup Audit",
      worktreeName: "chore/branch-cleanup-audit",
    });
    const { result } = setup({
      parentThreadName: "完善会话路由",
      threadName: "branch cleanup audit",
    });

    await act(async () => {
      await result.current.onSubagentThreadDetected("ws-1", {
        id: "thread-1",
        source: {
          subagent: {
            thread_spawn: {
              parent_thread_id: "thread-parent",
              agent_path: "/root/branch_cleanup_audit",
            },
          },
        },
      });
    });
    expect(generateRunMetadata).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(generateRunMetadata).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("serializes title generation across multiple subagents", async () => {
    let resolveFirst!: (value: { title: string; worktreeName: string }) => void;
    const first = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(generateRunMetadata)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        title: "发布审查",
        worktreeName: "chore/release-review",
      });
    const { result } = setup({
      parentThreadName: "完善会话路由",
      threadName: "branch cleanup audit",
    });
    const firstPromise = result.current.onSubagentThreadDetected("ws-1", {
      id: "thread-1",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "thread-parent",
            agent_path: "/root/branch_cleanup_audit",
          },
        },
      },
    });
    const secondPromise = result.current.onSubagentThreadDetected("ws-1", {
      id: "thread-2",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "thread-parent",
            agent_path: "/root/release_review",
          },
        },
      },
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(generateRunMetadata).toHaveBeenCalledTimes(1);

    resolveFirst({
      title: "分支清理审查",
      worktreeName: "chore/branch-cleanup-audit",
    });
    await act(async () => {
      await Promise.all([firstPromise, secondPromise]);
    });

    expect(generateRunMetadata).toHaveBeenCalledTimes(2);
  });

  it("keeps title queues isolated between workspaces", async () => {
    let resolveFirst!: (value: { title: string; worktreeName: string }) => void;
    const first = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(generateRunMetadata)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        title: "发布审查",
        worktreeName: "chore/release-review",
      });
    const { result, setWorkspaceThreads } = setup({
      parentThreadName: "完善会话路由",
      threadName: "branch cleanup audit",
    });
    setWorkspaceThreads("ws-2", [
      { id: "thread-parent-2", name: "准备发布", updatedAt: 1 },
      { id: "thread-2", name: "release review", updatedAt: 0 },
    ]);
    const firstPromise = result.current.onSubagentThreadDetected("ws-1", {
      id: "thread-1",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "thread-parent",
            agent_path: "/root/branch_cleanup_audit",
          },
        },
      },
    });
    const secondPromise = result.current.onSubagentThreadDetected("ws-2", {
      id: "thread-2",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "thread-parent-2",
            agent_path: "/root/release_review",
          },
        },
      },
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(generateRunMetadata).toHaveBeenCalledTimes(2);

    resolveFirst({
      title: "分支清理审查",
      worktreeName: "chore/branch-cleanup-audit",
    });
    await act(async () => {
      await Promise.all([firstPromise, secondPromise]);
    });
  });

  it("does not persist an in-flight subagent title after unmount", async () => {
    let resolvePromise!: (value: { title: string; worktreeName: string }) => void;
    const pending = new Promise<{ title: string; worktreeName: string }>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(generateRunMetadata).mockReturnValue(pending);
    const getCustomName = vi.fn(() => undefined);
    const renameThread = vi.fn();
    const persistGeneratedTitle = vi.fn();
    const itemsByThreadRef = { current: {} };
    const threadsByWorkspaceRef = {
      current: {
        "ws-1": [
          { id: "thread-parent", name: "完善会话路由", updatedAt: 1 },
          { id: "thread-1", name: "routing audit", updatedAt: 0 },
        ],
      },
    };
    const { result, unmount } = renderHook(() =>
      useThreadTitleAutogeneration({
        enabled: true,
        itemsByThreadRef,
        threadsByWorkspace: threadsByWorkspaceRef.current,
        threadsByWorkspaceRef,
        getCustomName,
        renameThread,
        persistGeneratedTitle,
      }),
    );
    const generation = result.current.onSubagentThreadDetected("ws-1", {
      id: "thread-1",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "thread-parent",
            agent_path: "/root/routing_audit",
          },
        },
      },
    });
    unmount();
    resolvePromise({ title: "路由审查", worktreeName: "chore/routing-audit" });

    await act(async () => {
      await generation;
    });

    expect(persistGeneratedTitle).not.toHaveBeenCalled();
  });
});

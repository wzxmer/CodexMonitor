// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerReference, WorkspaceInfo } from "@/types";
import { useComposerController } from "./useComposerController";

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function makeOptions(overrides: Partial<Parameters<typeof useComposerController>[0]> = {}) {
  return {
    activeThreadId: null,
    activeTurnId: null,
    activeWorkspaceId: workspace.id,
    activeWorkspace: workspace,
    isProcessing: false,
    isReviewing: false,
    steerEnabled: true,
    followUpMessageBehavior: "queue" as const,
    appsEnabled: true,
    connectWorkspace: vi.fn().mockResolvedValue(undefined),
    startThreadForWorkspace: vi.fn().mockResolvedValue("thread-1"),
    sendUserMessage: vi.fn().mockResolvedValue({ status: "sent" }),
    sendUserMessageToThread: vi.fn().mockResolvedValue({ status: "sent" }),
    startFork: vi.fn().mockResolvedValue(undefined),
    startReview: vi.fn().mockResolvedValue(undefined),
    startResume: vi.fn().mockResolvedValue(undefined),
    startCompact: vi.fn().mockResolvedValue(undefined),
    startApps: vi.fn().mockResolvedValue(undefined),
    startMcp: vi.fn().mockResolvedValue(undefined),
    startFast: vi.fn().mockResolvedValue(undefined),
    startStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useComposerController", () => {
  const reference = (id: string, prompt = `> ${id}\n\n`): ComposerReference => ({
    id,
    sourceTitle: id,
    sourceRole: "assistant",
    content: `${id} content`,
    prompt,
    mode: "full",
    collapsed: false,
  });

  it("keeps a workspace draft before the first thread exists", () => {
    const options = makeOptions();
    const { result, rerender } = renderHook((props) => useComposerController(props), {
      initialProps: options,
    });

    act(() => {
      result.current.handleDraftChange("no project draft");
    });

    expect(result.current.activeDraft).toBe("no project draft");

    rerender({ ...options, activeThreadId: "thread-1" });
    expect(result.current.activeDraft).toBe("");

    rerender({ ...options, activeThreadId: null });
    expect(result.current.activeDraft).toBe("no project draft");
  });

  it("appends text to an inactive thread draft without overwriting it", () => {
    const options = makeOptions({ activeThreadId: "thread-active" });
    const { result, rerender } = renderHook((props) => useComposerController(props), {
      initialProps: options,
    });

    act(() => {
      result.current.insertDraftForThread("thread-derived", "Referenced content");
      result.current.insertDraftForThread("thread-derived", "Follow-up");
    });

    expect(result.current.activeDraft).toBe("");
    rerender({ ...options, activeThreadId: "thread-derived" });
    expect(result.current.activeDraft).toBe("Referenced content\n\nFollow-up");
    expect(options.sendUserMessageToThread).not.toHaveBeenCalled();
  });

  it("restores a failed first-send image transfer without crossing workspace drafts", async () => {
    let rejectConnection: ((error: Error) => void) | null = null;
    const connectWorkspace = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectConnection = reject;
        }),
    );
    const disconnectedWorkspace = { ...workspace, connected: false };
    const options = makeOptions({
      activeWorkspace: disconnectedWorkspace,
      connectWorkspace,
    });
    const { result, rerender } = renderHook(
      (props) => useComposerController(props),
      { initialProps: options },
    );

    act(() => {
      result.current.attachImages(["/tmp/original.md"]);
    });
    expect(result.current.activeImages).toEqual(["/tmp/original.md"]);

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.handleSend(
        "First send",
        result.current.activeImages,
      );
      await Promise.resolve();
    });
    expect(result.current.activeImages).toEqual([]);
    expect(options.sendUserMessage).not.toHaveBeenCalled();

    act(() => {
      result.current.attachImages(["/tmp/new.md"]);
    });
    const otherWorkspace = {
      ...workspace,
      id: "workspace-2",
      name: "Other",
      connected: true,
    };
    rerender({
      ...options,
      activeWorkspaceId: otherWorkspace.id,
      activeWorkspace: otherWorkspace,
    });
    act(() => {
      result.current.attachImages(["/tmp/other-workspace.md"]);
    });

    await act(async () => {
      rejectConnection?.(new Error("offline"));
      await expect(sendPromise).rejects.toThrow("offline");
    });
    expect(result.current.activeImages).toEqual(["/tmp/other-workspace.md"]);

    rerender(options);
    expect(result.current.activeImages).toEqual([
      "/tmp/new.md",
      "/tmp/original.md",
    ]);
  });

  it("does not revive transferred images cleared while connection is pending", async () => {
    let rejectConnection: ((error: Error) => void) | null = null;
    const connectWorkspace = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectConnection = reject;
        }),
    );
    const options = makeOptions({
      activeWorkspace: { ...workspace, connected: false },
      connectWorkspace,
    });
    const { result } = renderHook((props) => useComposerController(props), {
      initialProps: options,
    });

    act(() => {
      result.current.attachImages(["/tmp/original.md"]);
    });
    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.handleSend(
        "First send",
        result.current.activeImages,
      );
      await Promise.resolve();
    });
    expect(result.current.activeImages).toEqual([]);

    act(() => {
      result.current.clearActiveImages();
    });
    await act(async () => {
      rejectConnection?.(new Error("offline"));
      await expect(sendPromise).rejects.toThrow("offline");
    });

    expect(result.current.activeImages).toEqual([]);
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("restores first-send images when sending rejects before a status", async () => {
    let rejectSend: ((error: Error) => void) | null = null;
    const sendUserMessage = vi.fn(
      () =>
        new Promise<{ status: "sent" }>((_, reject) => {
          rejectSend = reject;
        }),
    );
    const options = makeOptions({ sendUserMessage });
    const { result } = renderHook((props) => useComposerController(props), {
      initialProps: options,
    });

    act(() => {
      result.current.attachImages(["/tmp/original.md"]);
    });
    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.handleSend(
        "First send",
        result.current.activeImages,
      );
      await Promise.resolve();
    });

    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(result.current.activeImages).toEqual([]);

    await act(async () => {
      rejectSend?.(new Error("send failed"));
      await expect(sendPromise).rejects.toThrow("send failed");
    });

    expect(result.current.activeImages).toEqual(["/tmp/original.md"]);
  });

  it("removes and restores one reference without changing surrounding draft text", () => {
    const options = makeOptions({ activeThreadId: "thread-1" });
    const { result } = renderHook((props) => useComposerController(props), { initialProps: options });
    act(() => result.current.handleDraftChange("before\n\nafter"));
    act(() => result.current.addComposerReference(reference("ref-1")));
    act(() => result.current.removeComposerReference("ref-1"));
    expect(result.current.activeDraft).toBe("before\n\nafter");
    expect(result.current.composerReferences).toEqual([]);
    act(() => expect(result.current.undoComposerReference()).toBe(true));
    expect(result.current.activeDraft).toBe("before\n\nafter");
    expect(result.current.composerReferences.map((item) => item.id)).toEqual(["ref-1"]);
    act(() => expect(result.current.redoComposerReference()).toBe(true));
    expect(result.current.activeDraft).toBe("before\n\nafter");
  });

  it("leaves undo to the editor when text changed after a reference operation", () => {
    const options = makeOptions({ activeThreadId: "thread-1" });
    const { result } = renderHook((props) => useComposerController(props), { initialProps: options });
    act(() => result.current.addComposerReference(reference("ref-1")));
    act(() => result.current.handleDraftChange("new body"));

    let handled = true;
    act(() => { handled = result.current.undoComposerReference(); });

    expect(handled).toBe(false);
    expect(result.current.activeDraft).toBe("new body");
    expect(result.current.composerReferences.map((item) => item.id)).toEqual(["ref-1"]);
  });

  it("keeps references after a failed send and clears them after acceptance", async () => {
    const sendUserMessage = vi.fn()
      .mockRejectedValueOnce(new Error("send failed"))
      .mockResolvedValueOnce({ status: "sent" });
    const options = makeOptions({ activeThreadId: "thread-1", sendUserMessage });
    const { result } = renderHook((props) => useComposerController(props), { initialProps: options });
    const item = reference("ref-1");
    act(() => result.current.handleDraftChange("body"));
    act(() => result.current.addComposerReference(item));
    await act(async () => {
      await expect(result.current.handleSend(`${item.prompt}\n\nbody`, [], [], "default", undefined, [item])).rejects.toThrow("send failed");
    });
    expect(result.current.composerReferences).toHaveLength(1);
    expect(result.current.activeDraft).toBe("body");
    await act(async () => {
      await result.current.handleSend(`${item.prompt}\n\nbody`, [], [], "default", undefined, [item]);
    });
    expect(result.current.composerReferences).toEqual([]);
  });

  it("clears accepted references only from the draft that sent them", async () => {
    const options = makeOptions({ activeThreadId: "thread-1" });
    const { result, rerender } = renderHook((props) => useComposerController(props), {
      initialProps: options,
    });
    const sharedReference = reference("shared-ref");
    act(() => result.current.addComposerReference(sharedReference));
    const sendFromThreadOne = result.current.handleSend;

    rerender({ ...options, activeThreadId: "thread-2" });
    act(() => result.current.addComposerReference(sharedReference));

    await act(async () => {
      await sendFromThreadOne(
        sharedReference.prompt,
        [],
        [],
        "default",
        undefined,
        [sharedReference],
      );
    });

    expect(result.current.composerReferences.map((item) => item.id)).toEqual(["shared-ref"]);
    rerender(options);
    expect(result.current.composerReferences).toEqual([]);
  });

  it("restores the body when the backend blocks a referenced send", async () => {
    const options = makeOptions({
      activeThreadId: "thread-1",
      sendUserMessage: vi.fn().mockResolvedValue({ status: "blocked" }),
    });
    const { result } = renderHook((props) => useComposerController(props), { initialProps: options });
    const item = reference("ref-1");
    act(() => result.current.addComposerReference(item));
    await act(async () => {
      await result.current.handleSend(`${item.prompt}body`, [], [], "default", undefined, [item]);
    });
    expect(result.current.activeDraft).toBe("body");
    expect(result.current.composerReferences).toHaveLength(1);
  });

  it("restores an empty body when a reference-only send is blocked", async () => {
    const options = makeOptions({
      activeThreadId: "thread-1",
      sendUserMessage: vi.fn().mockResolvedValue({ status: "blocked" }),
    });
    const { result } = renderHook((props) => useComposerController(props), { initialProps: options });
    const item = reference("ref-1");
    act(() => result.current.addComposerReference(item));
    await act(async () => {
      await result.current.handleSend(item.prompt, [], [], "default", undefined, [item]);
    });
    expect(result.current.activeDraft).toBe("");
    expect(result.current.composerReferences).toHaveLength(1);
  });
});

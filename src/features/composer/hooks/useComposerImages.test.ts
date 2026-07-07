/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { saveComposerImages } from "../../../services/tauri";
import { useComposerImages } from "./useComposerImages";

vi.mock("../../../services/tauri", () => ({
  pickAttachmentFiles: vi.fn().mockResolvedValue([]),
  saveComposerImages: vi.fn(async (_workspaceId: string, images: string[]) =>
    images.map(
      (image) =>
        `/workspace/.codex-monitor/attachments/${
          image.split("/").pop() ?? "image.png"
        }`,
    ),
  ),
}));

type HookResult = ReturnType<typeof useComposerImages>;

type RenderedHook = {
  result: HookResult;
  rerender: (next: { activeThreadId: string | null; activeWorkspaceId: string | null }) => void;
  unmount: () => void;
};

function renderComposerImages(
  initial: { activeThreadId: string | null; activeWorkspaceId: string | null },
): RenderedHook {
  let props = initial;
  let result: HookResult | undefined;

  function Test() {
    result = useComposerImages(props);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(Test));
  });

  return {
    get result() {
      if (!result) {
        throw new Error("Hook not rendered");
      }
      return result;
    },
    rerender: (next) => {
      props = next;
      act(() => {
        root.render(React.createElement(Test));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useComposerImages", () => {
  it("keeps non-image attachments as original paths", async () => {
    const hook = renderComposerImages({
      activeThreadId: "thread-text",
      activeWorkspaceId: "ws-1",
    });

    await act(async () => {
      hook.result.attachImages(["/tmp/notes.md"]);
      await Promise.resolve();
    });

    expect(saveComposerImages).not.toHaveBeenCalled();
    expect(hook.result.activeImages).toEqual(["/tmp/notes.md"]);

    hook.unmount();
  });

  it("attaches images and deduplicates paths", async () => {
    const hook = renderComposerImages({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });

    await act(async () => {
      hook.result.attachImages(["/tmp/a.png", "/tmp/b.png"]);
      await Promise.resolve();
    });

    expect(hook.result.activeImages).toEqual([
      "/workspace/.codex-monitor/attachments/a.png",
      "/workspace/.codex-monitor/attachments/b.png",
    ]);

    await act(async () => {
      hook.result.attachImages(["/tmp/b.png", "/tmp/c.png"]);
      await Promise.resolve();
    });

    expect(hook.result.activeImages).toEqual([
      "/workspace/.codex-monitor/attachments/a.png",
      "/workspace/.codex-monitor/attachments/b.png",
      "/workspace/.codex-monitor/attachments/c.png",
    ]);

    hook.unmount();
  });

  it("removes images and clears empty drafts", async () => {
    const hook = renderComposerImages({
      activeThreadId: "thread-2",
      activeWorkspaceId: "ws-1",
    });

    await act(async () => {
      hook.result.attachImages(["/tmp/a.png", "/tmp/b.png"]);
      await Promise.resolve();
    });

    act(() => {
      hook.result.removeImage("/workspace/.codex-monitor/attachments/a.png");
    });

    expect(hook.result.activeImages).toEqual([
      "/workspace/.codex-monitor/attachments/b.png",
    ]);

    act(() => {
      hook.result.removeImage("/workspace/.codex-monitor/attachments/b.png");
    });

    expect(hook.result.activeImages).toEqual([]);

    hook.unmount();
  });

  it("does not restore an image removed before attachment saving finishes", async () => {
    let resolveSave: (paths: string[]) => void = () => {};
    vi.mocked(saveComposerImages).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const hook = renderComposerImages({
      activeThreadId: "thread-2",
      activeWorkspaceId: "ws-1",
    });

    act(() => {
      hook.result.attachImages(["/tmp/a.png"]);
    });
    expect(hook.result.activeImages).toEqual(["/tmp/a.png"]);

    act(() => {
      hook.result.removeImage("/tmp/a.png");
    });
    expect(hook.result.activeImages).toEqual([]);

    await act(async () => {
      resolveSave(["/workspace/.codex-monitor/attachments/a.png"]);
      await Promise.resolve();
    });
    expect(hook.result.activeImages).toEqual([]);

    hook.unmount();
  });

  it("switches drafts between thread and workspace", async () => {
    const hook = renderComposerImages({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });

    await act(async () => {
      hook.result.attachImages(["/tmp/a.png"]);
      await Promise.resolve();
    });
    expect(hook.result.activeImages).toEqual([
      "/workspace/.codex-monitor/attachments/a.png",
    ]);

    hook.rerender({ activeThreadId: null, activeWorkspaceId: "ws-1" });
    expect(hook.result.activeImages).toEqual([]);

    await act(async () => {
      hook.result.attachImages(["/tmp/b.png"]);
      await Promise.resolve();
    });
    expect(hook.result.activeImages).toEqual([
      "/workspace/.codex-monitor/attachments/b.png",
    ]);

    hook.rerender({ activeThreadId: "thread-1", activeWorkspaceId: "ws-1" });
    expect(hook.result.activeImages).toEqual([
      "/workspace/.codex-monitor/attachments/a.png",
    ]);

    hook.unmount();
  });
});

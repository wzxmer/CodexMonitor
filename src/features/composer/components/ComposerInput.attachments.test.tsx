/** @vitest-environment jsdom */
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useComposerImages } from "../hooks/useComposerImages";
import { ComposerInput } from "./ComposerInput";

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
  invoke: vi.fn(async (_command: string, args: { images?: string[] }) => args.images ?? []),
}));

type HarnessProps = {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  disabled?: boolean;
};

function ComposerHarness({
  activeThreadId,
  activeWorkspaceId,
  disabled = false,
}: HarnessProps) {
  const { activeImages, attachImages, removeImage, clearActiveImages } =
    useComposerImages({ activeThreadId, activeWorkspaceId });
  const [text, setText] = useState("");
  const [, setSelectionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div>
      <ComposerInput
        text={text}
        disabled={disabled}
        sendLabel="发送"
        canStop={false}
        canSend={false}
        isProcessing={false}
        onStop={() => {}}
        onSend={() => {}}
        attachments={activeImages}
        onAddAttachment={() => {}}
        onAttachImages={attachImages}
        onRemoveAttachment={removeImage}
        onTextChange={(next, nextSelection) => {
          setText(next);
          setSelectionStart(nextSelection);
        }}
        onSelectionChange={setSelectionStart}
        onKeyDown={() => {}}
        textareaRef={textareaRef}
        suggestionsOpen={false}
        suggestions={[]}
        highlightIndex={0}
        onHighlightIndex={() => {}}
        onSelectSuggestion={() => {}}
      />
      <button
        type="button"
        data-testid="clear-images"
        onClick={clearActiveImages}
      >
        Clear
      </button>
    </div>
  );
}

type RenderedHarness = {
  container: HTMLDivElement;
  rerender: (next: HarnessProps) => void;
  unmount: () => void;
};

function renderComposerHarness(initial: HarnessProps): RenderedHarness {
  let props = initial;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ComposerHarness {...props} />);
  });

  return {
    container,
    rerender: (next) => {
      props = next;
      act(() => {
        root.render(<ComposerHarness {...props} />);
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

function getAttachmentNames(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll(".composer-attachment-name"),
  ).map((node) => node.textContent ?? "");
}

function getTextarea(container: HTMLElement) {
  const textarea = container.querySelector("textarea");
  if (!textarea) {
    throw new Error("Textarea not found");
  }
  return textarea;
}

function dispatchDrop(
  element: HTMLElement,
  files: File[],
  items: Array<{ kind: string; getAsFile: () => File | null }> = [],
) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files,
      items,
    },
  });
  element.dispatchEvent(event);
}

function dispatchPaste(
  element: HTMLElement,
  items: Array<{ type: string; getAsFile: () => File | null }>,
) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      items,
    },
  });
  element.dispatchEvent(event);
}

function setMockFileReader() {
  const OriginalFileReader = window.FileReader;
  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;

    readAsDataURL(file: File) {
      this.result = `data:${file.type};base64,MOCK`;
      this.onload?.({} as ProgressEvent<FileReader>);
    }
  }
  window.FileReader = MockFileReader as typeof FileReader;
  return () => {
    window.FileReader = OriginalFileReader;
  };
}

describe("Composer attachments integration", () => {
  it("previews image files in-app and copies image data from attachment actions", async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalClipboardItem = globalThis.ClipboardItem;
    const originalFetch = globalThis.fetch;
    const write = vi.fn().mockResolvedValue(undefined);
    const imageBlob = new Blob(["image"], { type: "image/png" });
    Object.defineProperty(navigator, "clipboard", {
      value: { write },
      configurable: true,
    });
    globalThis.ClipboardItem = class ClipboardItem {
      constructor(public readonly items: Record<string, Blob>) {}
    } as unknown as typeof ClipboardItem;
    globalThis.fetch = vi.fn().mockResolvedValue({ blob: async () => imageBlob }) as typeof fetch;

    try {
      const harness = renderComposerHarness({
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-1",
      });
      const textarea = getTextarea(harness.container);
      const image = new File(["data"], "photo.png", { type: "image/png" });
      (image as File & { path?: string }).path = "/tmp/photo.png";

      await act(async () => {
        dispatchDrop(textarea, [image]);
      });

      const openButton = harness.container.querySelector(".composer-attachment-open");
      const copyButton = harness.container.querySelector(".composer-attachment-copy-image");
      expect(openButton).toBeTruthy();
      expect(copyButton).toBeTruthy();
      expect(copyButton?.textContent).toBe("");
      expect(copyButton?.getAttribute("aria-label")).toContain("复制图片");

      await act(async () => {
        (openButton as HTMLButtonElement).click();
      });
      expect(document.body.querySelector(".composer-image-preview")).toBeTruthy();
      expect(document.body.querySelector(".composer-image-preview img")?.getAttribute("src")).toBe(
        "tauri:///tmp/photo.png",
      );

      act(() => {
        (document.body.querySelector(".composer-image-preview-close") as HTMLButtonElement).click();
      });
      expect(document.body.querySelector(".composer-image-preview")).toBeNull();

      await act(async () => {
        (copyButton as HTMLButtonElement).click();
      });
      expect(write).toHaveBeenCalledOnce();

      harness.unmount();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      }
      globalThis.ClipboardItem = originalClipboardItem;
      globalThis.fetch = originalFetch;
    }
  });

  it("shortens generated image storage names in attachment pills", async () => {
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);
    const image = new File(["data"], "generated.png", { type: "image/png" });
    (image as File & { path?: string }).path =
      "C:\\attachments\\image-20260711-131154.846-69cc1234-1234-5678-9012-abcdefabcdef.png";

    await act(async () => {
      dispatchDrop(textarea, [image]);
    });

    expect(getAttachmentNames(harness.container)).toEqual(["image-131154.png"]);
    harness.unmount();
  });

  it("attaches dropped files and dedupes paths", async () => {
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const image = new File(["data"], "photo.png", { type: "image/png" });
    (image as File & { path?: string }).path = "/tmp/photo.png";
    const nonImage = new File(["data"], "notes.txt", { type: "text/plain" });
    (nonImage as File & { path?: string }).path = "/tmp/notes.txt";

    await act(async () => {
      dispatchDrop(textarea, [image, nonImage]);
    });

    expect(getAttachmentNames(harness.container)).toEqual(["photo.png", "notes.txt"]);

    const imageTwo = new File(["data"], "second.jpg", { type: "image/jpeg" });
    (imageTwo as File & { path?: string }).path = "/tmp/second.jpg";

    await act(async () => {
      dispatchDrop(textarea, [image, imageTwo]);
    });

    expect(getAttachmentNames(harness.container)).toEqual([
      "photo.png",
      "notes.txt",
      "second.jpg",
    ]);

    harness.unmount();
  });

  it("attaches pasted files as data URLs and ignores text-only clipboard items", async () => {
    const restoreFileReader = setMockFileReader();
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const image = new File(["data"], "paste.png", { type: "image/png" });
    const imageItem = { type: "image/png", getAsFile: () => image };
    const textItem = { type: "text/plain", getAsFile: () => null };

    await act(async () => {
      dispatchPaste(textarea, [textItem, imageItem]);
    });

    expect(getAttachmentNames(harness.container)).toEqual(["paste.png"]);
    expect(harness.container.querySelector(".composer-attachment-thumb img")).toBeTruthy();

    harness.unmount();
    restoreFileReader();
  });

  it("shows pasted non-image file data as an attachment without image preview", async () => {
    const restoreFileReader = setMockFileReader();
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const file = new File(["data"], "notes.txt", { type: "text/plain" });
    const item = { kind: "file", type: "text/plain", getAsFile: () => file };

    await act(async () => {
      dispatchPaste(textarea, [item]);
    });

    expect(getAttachmentNames(harness.container)).toEqual(["notes.txt"]);
    expect(harness.container.querySelector(".composer-attachment-thumb img")).toBeNull();

    harness.unmount();
    restoreFileReader();
  });

  it("removes attachments and clears drafts", async () => {
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const first = new File(["data"], "first.png", { type: "image/png" });
    (first as File & { path?: string }).path = "/tmp/first.png";
    const second = new File(["data"], "second.png", { type: "image/png" });
    (second as File & { path?: string }).path = "/tmp/second.png";

    await act(async () => {
      dispatchDrop(textarea, [first, second]);
    });

    expect(getAttachmentNames(harness.container)).toEqual([
      "first.png",
      "second.png",
    ]);

    const removeButtons = harness.container.querySelectorAll(
      ".composer-attachment-remove",
    );
    expect(removeButtons.length).toBe(2);

    act(() => {
      (removeButtons[0] as HTMLButtonElement).click();
    });

    expect(getAttachmentNames(harness.container)).toEqual(["second.png"]);

    const clearButton = harness.container.querySelector(
      "[data-testid='clear-images']",
    );
    if (!clearButton) {
      throw new Error("Clear button missing");
    }

    act(() => {
      (clearButton as HTMLButtonElement).click();
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.unmount();
  });

  it("keeps attachments scoped per thread", async () => {
    const harness = renderComposerHarness({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const threadOneImage = new File(["data"], "thread-one.png", {
      type: "image/png",
    });
    (threadOneImage as File & { path?: string }).path = "/tmp/thread-one.png";

    await act(async () => {
      dispatchDrop(textarea, [threadOneImage]);
    });

    expect(getAttachmentNames(harness.container)).toEqual(["thread-one.png"]);

    harness.rerender({
      activeThreadId: "thread-2",
      activeWorkspaceId: "ws-1",
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    const threadTwoImage = new File(["data"], "thread-two.png", {
      type: "image/png",
    });
    (threadTwoImage as File & { path?: string }).path = "/tmp/thread-two.png";

    await act(async () => {
      dispatchDrop(getTextarea(harness.container), [threadTwoImage]);
    });

    expect(getAttachmentNames(harness.container)).toEqual(["thread-two.png"]);

    harness.rerender({
      activeThreadId: "thread-1",
      activeWorkspaceId: "ws-1",
    });

    expect(getAttachmentNames(harness.container)).toEqual(["thread-one.png"]);

    harness.unmount();
  });

  it("keeps draft attachments scoped per workspace when no thread is active", async () => {
    const harness = renderComposerHarness({
      activeThreadId: null,
      activeWorkspaceId: "ws-1",
    });
    const textarea = getTextarea(harness.container);

    const draftImage = new File(["data"], "draft-one.png", {
      type: "image/png",
    });
    (draftImage as File & { path?: string }).path = "/tmp/draft-one.png";

    await act(async () => {
      dispatchDrop(textarea, [draftImage]);
    });

    expect(getAttachmentNames(harness.container)).toEqual(["draft-one.png"]);

    harness.rerender({
      activeThreadId: null,
      activeWorkspaceId: "ws-2",
    });

    expect(getAttachmentNames(harness.container)).toEqual([]);

    harness.rerender({
      activeThreadId: null,
      activeWorkspaceId: "ws-1",
    });

    expect(getAttachmentNames(harness.container)).toEqual(["draft-one.png"]);

    harness.unmount();
  });
});

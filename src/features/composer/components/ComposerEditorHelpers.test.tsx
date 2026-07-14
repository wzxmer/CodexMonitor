/** @vitest-environment jsdom */
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ComposerEditorSettings } from "../../../types";
import { Composer } from "./Composer";

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
}));

type HarnessProps = {
  initialText?: string;
  editorSettings: ComposerEditorSettings;
  onAttachImages?: (paths: string[]) => void;
  onReplaceImages?: (paths: string[]) => void;
};

function ComposerHarness({
  initialText = "",
  editorSettings,
  onAttachImages,
  onReplaceImages,
}: HarnessProps) {
  const [draftText, setDraftText] = useState(initialText);
  const [attachments, setAttachments] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <Composer
      onSend={() => {}}
      onStop={() => {}}
      canStop={false}
      isProcessing={false}
      appsEnabled={true}
      steerAvailable={false}
      followUpMessageBehavior="queue"
      composerSendShortcut="enter"
      collaborationModes={[]}
      selectedCollaborationModeId={null}
      onSelectCollaborationMode={() => {}}
      models={[]}
      selectedModelId={null}
      onSelectModel={() => {}}
      reasoningOptions={[]}
      selectedEffort={null}
      onSelectEffort={() => {}}
      selectedServiceTier={null}
      reasoningSupported={false}
      accessMode="current"
      onSelectAccessMode={() => {}}
      skills={[]}
      apps={[]}
      prompts={[]}
      files={[]}
      draftText={draftText}
      onDraftChange={setDraftText}
      pasteUndoKey="test-draft"
      attachedImages={attachments}
      onAttachImages={(paths) => {
        setAttachments((current) => [...current, ...paths]);
        onAttachImages?.(paths);
      }}
      onReplaceImages={(paths: string[]) => {
        setAttachments(paths);
        onReplaceImages?.(paths);
      }}
      onRemoveImage={(path) => setAttachments((current) => current.filter((item) => item !== path))}
      textareaRef={textareaRef}
      dictationEnabled={false}
      editorSettings={editorSettings}
    />
  );
}

type RenderedHarness = {
  container: HTMLDivElement;
  unmount: () => void;
};

function renderComposerHarness(props: HarnessProps): RenderedHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ComposerHarness {...props} />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function getTextarea(container: HTMLElement) {
  const textarea = container.querySelector("textarea");
  if (!textarea) {
    throw new Error("Textarea not found");
  }
  return textarea;
}

function setTextareaValue(
  textarea: HTMLTextAreaElement,
  value: string,
  inputType = "insertText",
) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(textarea, value);
  textarea.setSelectionRange(value.length, value.length);
  textarea.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: value,
      inputType,
    }),
  );
}

function createTextPasteEvent(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
      items: [],
    },
  });
  return event;
}

function createImagePasteEvent(path: string) {
  const file = new File(["image"], "clipboard.png", { type: "image/png" });
  Object.defineProperty(file, "path", { value: path });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: () => "",
      items: [
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => file,
        },
      ],
    },
  });
  return event;
}

async function pressUndo(textarea: HTMLTextAreaElement, redo = false) {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    shiftKey: redo,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    textarea.dispatchEvent(event);
  });
  return event;
}

const smartSettings: ComposerEditorSettings = {
  preset: "smart",
  expandFenceOnSpace: true,
  expandFenceOnEnter: false,
  fenceLanguageTags: true,
  fenceWrapSelection: true,
  autoWrapPasteMultiline: true,
  autoWrapPasteCodeLike: true,
  continueListOnShiftEnter: true,
};

describe("Composer editor helpers", () => {
  it("expands ```lang + Space into a fenced block", async () => {
    const harness = renderComposerHarness({
      initialText: "```ts",
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(5, 5);

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });

    expect(getTextarea(harness.container).value).toBe("```ts\n\n```");

    harness.unmount();
  });

  it("continues numbered lists on Shift+Enter", async () => {
    const harness = renderComposerHarness({
      initialText: "1. First",
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(8, 8);

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    expect(getTextarea(harness.container).value).toBe("1. First\n2. ");

    harness.unmount();
  });

  it("auto-wraps multi-line paste into a fenced block", async () => {
    const harness = renderComposerHarness({
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(0, 0);

    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) =>
          type === "text/plain" ? "line one\nline two" : "",
        items: [],
      },
    });

    await act(async () => {
      textarea.dispatchEvent(event);
    });

    expect(getTextarea(harness.container).value).toBe(
      "```\nline one\nline two\n```",
    );

    harness.unmount();
  });

  it("uses the native insertText path for smart multi-line paste", async () => {
    const harness = renderComposerHarness({
      editorSettings: smartSettings,
    });
    const textarea = getTextarea(harness.container);
    textarea.focus();
    textarea.setSelectionRange(0, 0);
    const originalExecCommand = document.execCommand;
    const execCommand = vi.fn(
      (command: string, _showUi?: boolean, value?: string) => {
        if (command !== "insertText" || typeof value !== "string") {
          return false;
        }
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const next = `${textarea.value.slice(0, start)}${value}${textarea.value.slice(end)}`;
        setTextareaValue(textarea, next);
        return true;
      },
    );
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    try {
      await act(async () => {
        textarea.dispatchEvent(createTextPasteEvent("line one\nline two"));
      });

      expect(execCommand).toHaveBeenCalledWith(
        "insertText",
        false,
        "```\nline one\nline two\n```",
      );
      expect(getTextarea(harness.container).value).toBe(
        "```\nline one\nline two\n```",
      );
    } finally {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
      });
      harness.unmount();
    }
  });

  it("converts a large paste into a restorable text attachment", async () => {
    const harness = renderComposerHarness({
      initialText: "Keep this",
      editorSettings: { ...smartSettings, largePasteBehavior: "smart" },
    });
    const textarea = getTextarea(harness.container);
    textarea.setSelectionRange(4, 4);
    const pasted = Array(80).fill("日志内容").join("\n");
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => pasted, items: [] },
    });

    await act(async () => {
      textarea.dispatchEvent(event);
    });

    expect(getTextarea(harness.container).value).toBe("Keep this");
    expect(harness.container.querySelector(".composer-attachment-name")?.textContent).toMatch(
      /^pasted-text-.*\.txt$/,
    );
    expect(harness.container.querySelector(".composer-attachment-meta")?.textContent).toContain(
      "80",
    );

    const previewButton = Array.from(
      harness.container.querySelectorAll(".composer-attachment-action"),
    ).find((button) => button.textContent?.includes("预览"));
    act(() => {
      (previewButton as HTMLButtonElement).click();
    });
    expect(harness.container.querySelector(".composer-attachment-text-preview")?.textContent).toBe(
      pasted,
    );

    const restoreButton = Array.from(
      harness.container.querySelectorAll(".composer-attachment-action"),
    ).find((button) => button.textContent?.includes("恢复"));
    act(() => {
      (restoreButton as HTMLButtonElement).click();
    });
    expect(getTextarea(harness.container).value).toBe(`Keep${pasted} this`);
    expect(harness.container.querySelector(".composer-attachment-name")).toBeNull();

    harness.unmount();
  });

  it("undoes and redoes a large-paste attachment without changing draft text", async () => {
    const onAttachImages = vi.fn();
    const onReplaceImages = vi.fn();
    const harness = renderComposerHarness({
      initialText: "Keep this",
      editorSettings: { ...smartSettings, largePasteBehavior: "smart" },
      onAttachImages,
      onReplaceImages,
    });
    const textarea = getTextarea(harness.container);
    const pasted = Array(80).fill("日志内容").join("\n");

    await act(async () => {
      textarea.dispatchEvent(createTextPasteEvent(pasted));
    });
    const added = onAttachImages.mock.calls[0]?.[0] as string[];

    await pressUndo(textarea);
    expect.soft(onReplaceImages).toHaveBeenCalledWith([]);
    expect(getTextarea(harness.container).value).toBe("Keep this");

    await pressUndo(textarea, true);
    expect.soft(onAttachImages).toHaveBeenNthCalledWith(2, added);
    expect(getTextarea(harness.container).value).toBe("Keep this");

    harness.unmount();
  });

  it("undoes and redoes an image clipboard attachment", async () => {
    const onAttachImages = vi.fn();
    const onReplaceImages = vi.fn();
    const harness = renderComposerHarness({
      initialText: "Keep this",
      editorSettings: smartSettings,
      onAttachImages,
      onReplaceImages,
    });
    const textarea = getTextarea(harness.container);
    const imagePath = "C:/tmp/clipboard.png";

    await act(async () => {
      textarea.dispatchEvent(createImagePasteEvent(imagePath));
      await Promise.resolve();
    });
    expect(onAttachImages).toHaveBeenCalledWith([imagePath]);

    await pressUndo(textarea);
    expect.soft(onReplaceImages).toHaveBeenCalledWith([]);
    expect(getTextarea(harness.container).value).toBe("Keep this");

    await pressUndo(textarea, true);
    expect.soft(onAttachImages).toHaveBeenNthCalledWith(2, [imagePath]);
    expect(getTextarea(harness.container).value).toBe("Keep this");

    harness.unmount();
  });

  it("leaves the first text undo to the browser after an image paste", async () => {
    const onAttachImages = vi.fn();
    const onReplaceImages = vi.fn();
    const harness = renderComposerHarness({
      initialText: "Keep this",
      editorSettings: smartSettings,
      onAttachImages,
      onReplaceImages,
    });
    const textarea = getTextarea(harness.container);

    await act(async () => {
      textarea.dispatchEvent(createImagePasteEvent("C:/tmp/clipboard.png"));
      await Promise.resolve();
    });
    act(() => {
      setTextareaValue(textarea, "Keep this!");
    });

    const undoEvent = await pressUndo(textarea);

    expect(undoEvent.defaultPrevented).toBe(false);
    expect(onReplaceImages).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("does not intercept attachment undo while an IME composition is active", async () => {
    const onReplaceImages = vi.fn();
    const harness = renderComposerHarness({
      editorSettings: smartSettings,
      onReplaceImages,
    });
    const textarea = getTextarea(harness.container);
    await act(async () => {
      textarea.dispatchEvent(createImagePasteEvent("C:/tmp/clipboard.png"));
      await Promise.resolve();
    });
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      textarea.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(onReplaceImages).not.toHaveBeenCalled();

    harness.unmount();
  });

  it("keeps large paste in the editor when configured", async () => {
    const harness = renderComposerHarness({
      editorSettings: { ...smartSettings, largePasteBehavior: "keepText" },
    });
    const textarea = getTextarea(harness.container);
    const pasted = "x".repeat(12_000);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => pasted, items: [] },
    });

    await act(async () => {
      textarea.dispatchEvent(event);
    });

    expect(harness.container.querySelector(".composer-attachment-name")).toBeNull();
    harness.unmount();
  });
});

/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobilePlatform } from "../../../utils/platformPaths";
import { Composer } from "./Composer";
import type {
  AppOption,
  AppMention,
  ComposerSendIntent,
  ComposerSendShortcut,
  CustomPromptOption,
  FollowUpMessageBehavior,
} from "../../../types";

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
}));

vi.mock("../../../utils/platformPaths", async () => {
  const actual = await vi.importActual<typeof import("../../../utils/platformPaths")>(
    "../../../utils/platformPaths",
  );
  return {
    ...actual,
    isMobilePlatform: vi.fn(() => false),
  };
});

type HarnessProps = {
  onSend: (
    text: string,
    images: string[],
    appMentions?: AppMention[],
    submitIntent?: ComposerSendIntent,
  ) => void;
  apps?: AppOption[];
  prompts?: CustomPromptOption[];
  isProcessing?: boolean;
  followUpMessageBehavior?: FollowUpMessageBehavior;
  composerSendShortcut?: ComposerSendShortcut;
  steerAvailable?: boolean;
  selectedServiceTier?: "fast" | "flex" | null;
  canStop?: boolean;
  onStop?: () => void;
  controlledDraft?: boolean;
};

function ComposerHarness({
  onSend,
  apps = [],
  prompts = [],
  isProcessing = false,
  followUpMessageBehavior = "queue",
  composerSendShortcut = "enter-and-ctrl-enter",
  steerAvailable = false,
  selectedServiceTier = null,
  canStop = false,
  onStop = () => {},
  controlledDraft = true,
}: HarnessProps) {
  const [draftText, setDraftText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <Composer
      onSend={onSend}
      onStop={onStop}
      canStop={canStop}
      isProcessing={isProcessing}
      appsEnabled={true}
      steerAvailable={steerAvailable}
      followUpMessageBehavior={followUpMessageBehavior}
      composerSendShortcut={composerSendShortcut}
      collaborationModes={[]}
      selectedCollaborationModeId={null}
      onSelectCollaborationMode={() => {}}
      models={[]}
      selectedModelId={null}
      onSelectModel={() => {}}
      reasoningOptions={[]}
      selectedEffort={null}
      onSelectEffort={() => {}}
      selectedServiceTier={selectedServiceTier}
      reasoningSupported={false}
      accessMode="current"
      onSelectAccessMode={() => {}}
      skills={[]}
      apps={apps}
      prompts={prompts}
      files={[]}
      draftText={controlledDraft ? draftText : ""}
      onDraftChange={controlledDraft ? setDraftText : undefined}
      textareaRef={textareaRef}
      dictationEnabled={false}
    />
  );
}

describe("Composer send triggers", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(isMobilePlatform).mockReturnValue(false);
    vi.restoreAllMocks();
  });

  it("sends once on Enter", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello world", [], undefined, "default");
  });

  it("sends once on Ctrl+Enter when enabled", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} composerSendShortcut="ctrl-enter" />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "ctrl send" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("ctrl send", [], undefined, "default");
  });

  it("does not send on plain Enter when Ctrl+Enter is selected", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} composerSendShortcut="ctrl-enter" />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "plain enter" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends once on send-button click", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "from button" } });
    fireEvent.click(screen.getByLabelText("发送"));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("from button", [], undefined, "default");
  });

  it("sends a Chinese slash instruction instead of applying a prompt suggestion", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        prompts={[
          {
            name: "自造词",
            path: "prompts/自造词.md",
            content: "自造词",
          },
        ]}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/自造词" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("/自造词", [], undefined, "default");
  });

  it("sends a plus-prefixed Chinese slash instruction instead of applying a prompt suggestion", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        prompts={[
          {
            name: "+自造词",
            path: "prompts/+自造词.md",
            content: "+自造词",
          },
        ]}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/+自造词" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("/+自造词", [], undefined, "default");
  });

  it("shows the fast-mode indicator when enabled", () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} selectedServiceTier="fast" />);

    expect(screen.getByLabelText("快速模式已启用")).toBeTruthy();
  });

  it("blurs the textarea after Enter send on mobile", () => {
    vi.mocked(isMobilePlatform).mockReturnValue(true);
    const onSend = vi.fn();
    const blurSpy = vi.spyOn(HTMLTextAreaElement.prototype, "blur");
    render(<ComposerHarness onSend={onSend} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "dismiss keyboard" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      "dismiss keyboard",
      [],
      undefined,
      "default",
    );
    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it("sends explicit app mentions when an app autocomplete item is selected", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        apps={[
          {
            id: "connector_calendar",
            name: "Calendar App",
            description: "Calendar integration",
            isAccessible: true,
          },
        ]}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "$cal" } });
    fireEvent.keyDown(textarea, { key: "Tab" });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      "$calendar-app",
      [],
      [{ name: "Calendar App", path: "app://connector_calendar" }],
      "default",
    );
  });

  it("uses queue by default while processing when follow-up behavior is queue", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={true}
        followUpMessageBehavior="queue"
        steerAvailable={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "queue this" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("queue this", [], undefined, "queue");
  });

  it("uses opposite follow-up behavior on Shift+Ctrl+Enter while processing", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={true}
        followUpMessageBehavior="queue"
        steerAvailable={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "steer this" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true, ctrlKey: true });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("steer this", [], undefined, "steer");
  });

  it("falls back to queue when steer is selected but unavailable", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={true}
        followUpMessageBehavior="steer"
        steerAvailable={false}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "queue fallback" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(screen.queryByText("追问方式")).toBeNull();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("queue fallback", [], undefined, "queue");
  });

  it("does not restore the last submitted prompt into the composer when stopping a turn", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { rerender } = render(
      <ComposerHarness onSend={onSend} onStop={onStop} />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "revise this answer" } });
    fireEvent.click(screen.getByLabelText("发送"));

    expect((textarea as HTMLTextAreaElement).value).toBe("");

    rerender(<ComposerHarness onSend={onSend} onStop={onStop} canStop />);
    fireEvent.click(screen.getByLabelText("停止"));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps the composer empty after stopping and parent draft rerenders empty", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { rerender } = render(
      <ComposerHarness
        onSend={onSend}
        onStop={onStop}
        controlledDraft={false}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "edit after stop" } });
    fireEvent.click(screen.getByLabelText("发送"));

    rerender(
      <ComposerHarness
        onSend={onSend}
        onStop={onStop}
        canStop
        controlledDraft={false}
      />,
    );
    fireEvent.click(screen.getByLabelText("停止"));
    rerender(
      <ComposerHarness
        onSend={onSend}
        onStop={onStop}
        controlledDraft={false}
      />,
    );

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("treats Shift+Ctrl+Enter like normal send when not processing", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={false}
        followUpMessageBehavior="queue"
        steerAvailable={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "normal shortcut send" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true, ctrlKey: true });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      "normal shortcut send",
      [],
      undefined,
      "default",
    );
  });

  it("does not queue on Tab while processing", () => {
    const onSend = vi.fn();
    render(
      <ComposerHarness
        onSend={onSend}
        isProcessing={true}
        followUpMessageBehavior="queue"
        steerAvailable={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "tab no send" } });
    fireEvent.keyDown(textarea, { key: "Tab" });

    expect(onSend).not.toHaveBeenCalled();
  });
});

/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposerMetaBar } from "./ComposerMetaBar";

describe("ComposerMetaBar", () => {
  it("keeps long model labels available in the trigger and model popover", () => {
    const longModelLabel = "gpt-5.6-sol-max-with-long-provider-name";
    render(
      <ComposerMetaBar
        disabled={false}
        collaborationModes={[]}
        selectedCollaborationModeId={null}
        onSelectCollaborationMode={() => {}}
        models={[
          {
            id: "long-model",
            displayName: longModelLabel,
            model: "gpt-5.6-sol-max",
          },
        ]}
        selectedModelId="long-model"
        onSelectModel={() => {}}
        reasoningOptions={[]}
        selectedEffort={null}
        onSelectEffort={() => {}}
        selectedServiceTier={null}
        reasoningSupported={false}
        accessMode="current"
        onSelectAccessMode={() => {}}
        composerSendShortcut="enter"
      />,
    );

    const trigger = screen.getByRole("button", { name: "模型" });
    expect(trigger.textContent).toBe(longModelLabel);
    expect(trigger.getAttribute("title")).toBe(longModelLabel);
    expect(trigger.closest(".composer-select-wrap--model")).toBeTruthy();

    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox", { name: "模型" });
    expect(listbox.classList.contains("composer-model-select-popover")).toBe(true);
    expect(screen.getByRole("option", { name: longModelLabel }).textContent).toContain(
      longModelLabel,
    );
  });

  it("shows full shortcut mappings as hover titles", () => {
    render(
      <ComposerMetaBar
        disabled={false}
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
        composerSendShortcut="enter"
        onSelectComposerSendShortcut={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "输入快捷键" });
    expect(trigger.getAttribute("title")).toBe(
      "发送：Enter；引导：Ctrl+Enter；换行：Shift+Enter",
    );

    fireEvent.click(trigger);

    expect(
      screen
        .getByRole("option", { name: "聊天：Enter 发送" })
        .getAttribute("title"),
    ).toBe("发送：Enter；引导：Ctrl+Enter；换行：Shift+Enter");
    expect(
      screen
        .getByRole("option", { name: "编辑：Ctrl+Enter 发送" })
        .getAttribute("title"),
    ).toBe(
      "发送：Ctrl+Enter；引导：Shift+Enter；换行：Enter",
    );
    expect(
      screen
        .getByRole("option", { name: "引导优先：Enter 引导" })
        .getAttribute("title"),
    ).toBe("发送/引导：Enter；换行：Ctrl+Enter");
  });

  it("refreshes models from the model control", () => {
    const onRefreshModels = vi.fn();
    render(
      <ComposerMetaBar
        disabled={false}
        collaborationModes={[]}
        selectedCollaborationModeId={null}
        onSelectCollaborationMode={() => {}}
        models={[]}
        selectedModelId={null}
        onSelectModel={() => {}}
        onRefreshModels={onRefreshModels}
        reasoningOptions={[]}
        selectedEffort={null}
        onSelectEffort={() => {}}
        selectedServiceTier={null}
        reasoningSupported={false}
        accessMode="current"
        onSelectAccessMode={() => {}}
        composerSendShortcut="enter"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刷新模型列表" }));
    expect(onRefreshModels).toHaveBeenCalledTimes(1);
  });
});

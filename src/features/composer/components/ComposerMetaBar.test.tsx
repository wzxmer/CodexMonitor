/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposerMetaBar } from "./ComposerMetaBar";

describe("ComposerMetaBar", () => {
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
      "发送：Enter；引导：Shift+Ctrl+Enter；换行：Ctrl+Enter / Shift+Enter",
    );

    fireEvent.click(trigger);

    expect(
      screen
        .getByRole("option", { name: "聊天：Enter 发送" })
        .getAttribute("title"),
    ).toBe("发送：Enter；引导：Shift+Ctrl+Enter；换行：Ctrl+Enter / Shift+Enter");
    expect(
      screen
        .getByRole("option", { name: "编辑：Ctrl+Enter 发送" })
        .getAttribute("title"),
    ).toBe(
      "发送：Ctrl+Enter；引导：Shift+Ctrl+Enter；换行：Enter / Shift+Enter",
    );
    expect(
      screen
        .getByRole("option", { name: "引导优先：Ctrl+Enter 引导" })
        .getAttribute("title"),
    ).toBe(
      "发送：Enter；引导：Ctrl+Enter；换行：Shift+Enter",
    );
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import {
  DEFAULT_UI_CJK_FONT_FAMILY,
  DEFAULT_UI_LATIN_FONT_FAMILY,
} from "@utils/fonts";
import { SettingsDisplaySection } from "./SettingsDisplaySection";

describe("SettingsDisplaySection", () => {
  afterEach(() => {
    cleanup();
  });

  it("applies a style preset to theme, accent, and message style", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            themeAccent: "codex",
            messageReadingStyle: "codex",
            messageCanvasColor: "#ffffff",
            messageUserBubbleColor: "#ffffff",
            messageUserTextColor: "#102033",
            messageAssistantBubbleColor: "#ffffff",
            messageAssistantAccentColor: "#7dadff",
            messageAssistantTextColor: "#263040",
            usageShowRemaining: false,
            showMessageFilePath: true,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /CLI 暗黑/ }));

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "dark",
        themeAccent: "orange",
        messageReadingStyle: "cli",
        messageCanvasColor: "#111315",
        messageUserBubbleColor: "#3a2a1d",
        messageUserTextColor: "#fff3df",
        messageAssistantBubbleColor: "#1b1b1c",
        messageAssistantAccentColor: "#ff9f43",
      }),
    );
  });

  it("applies a pure white canvas preset", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            themeAccent: "codex",
            messageReadingStyle: "codex",
            messageCanvasColor: "#fffaf5",
            messageUserBubbleColor: "#fff4e8",
            messageUserTextColor: "#332519",
            messageAssistantBubbleColor: "#fffaf5",
            messageAssistantAccentColor: "#f28b3c",
            messageAssistantTextColor: "#2d241d",
            usageShowRemaining: false,
            showMessageFilePath: true,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /原生纯白/ }));

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "light",
        messageCanvasColor: "#ffffff",
        messageAssistantBubbleColor: "#ffffff",
      }),
    );
  });

  it("toggles auto-generated thread titles", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const row = screen
      .getByText("自动生成标题")
      .closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    const button = within(row as HTMLElement).getByRole("button");

    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ threadTitleAutogenerationEnabled: true }),
    );
  });
  it("toggles unlimited chat history", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const row = screen.getByText("不限聊天历史").closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    const button = within(row as HTMLElement).getByRole("button");

    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: null }),
    );
  });

  it("disables scrollback controls when unlimited chat history is enabled", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: null,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const presetSelect = screen.getByLabelText("历史消息数量");
    expect((presetSelect as HTMLSelectElement).disabled).toBe(true);

    const maxItemsInput = screen.getByLabelText("最大消息数");
    expect((maxItemsInput as HTMLInputElement).disabled).toBe(true);

    const maxItemsRow = maxItemsInput.closest(".settings-field-row");
    expect(maxItemsRow).toBeTruthy();
    const resetButton = within(maxItemsRow as HTMLElement).getByRole("button", {
      name: "重置",
    });
    expect((resetButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(presetSelect, { target: { value: "1000" } });
    expect(onUpdateAppSettings).not.toHaveBeenCalled();
  });

  it("applies scrollback presets", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("历史消息数量");
    fireEvent.change(select, { target: { value: "1000" } });

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: 1000 }),
    );
  });

  it("applies font clarity presets", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    const onSetUiLatinFontDraft = vi.fn();
    const onSetUiCjkFontDraft = vi.fn();
    const onSetUiFontWeightDraft = vi.fn();
    const onSetMessageFontWeightDraft = vi.fn();

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiLatinFontFamily: "Arial, sans-serif",
            uiCjkFontFamily: "SimSun, serif",
            uiFontWeight: 400,
            messageFontWeight: 450,
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        uiLatinFontDraft="Arial, sans-serif"
        uiCjkFontDraft="SimSun, serif"
        uiFontWeightDraft={400}
        messageFontWeightDraft={450}
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetUiLatinFontDraft={onSetUiLatinFontDraft as any}
        onCommitUiLatinFont={vi.fn(async () => {})}
        onSetUiCjkFontDraft={onSetUiCjkFontDraft as any}
        onCommitUiCjkFont={vi.fn(async () => {})}
        onSetUiFontWeightDraft={onSetUiFontWeightDraft as any}
        onCommitUiFontWeight={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetMessageFontWeightDraft={onSetMessageFontWeightDraft as any}
        onCommitMessageFontWeight={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Windows 清晰/ }));

    expect(onSetUiLatinFontDraft).toHaveBeenCalledWith(
      DEFAULT_UI_LATIN_FONT_FAMILY,
    );
    expect(onSetUiCjkFontDraft).toHaveBeenCalledWith(DEFAULT_UI_CJK_FONT_FAMILY);
    expect(onSetUiFontWeightDraft).toHaveBeenCalledWith(500);
    expect(onSetMessageFontWeightDraft).toHaveBeenCalledWith(500);
    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
        uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
        uiFontWeight: 500,
        messageFontWeight: 500,
      }),
    );
  });

  it("does not persist scrollback draft on blur when toggling unlimited", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const maxItemsInput = screen.getByLabelText("最大消息数");
    fireEvent.change(maxItemsInput, { target: { value: "50" } });

    const unlimitedRow = screen
      .getByText("不限聊天历史")
      .closest(".settings-toggle-row");
    expect(unlimitedRow).toBeTruthy();
    const unlimitedButton = within(unlimitedRow as HTMLElement).getByRole("button");

    fireEvent.blur(maxItemsInput, { relatedTarget: unlimitedButton });
    fireEvent.click(unlimitedButton);

    expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: null }),
    );
  });

  it("does not persist scrollback draft on blur when clicking Reset", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    const maxItemsInput = screen.getByLabelText("最大消息数");
    fireEvent.change(maxItemsInput, { target: { value: "50" } });

    const maxItemsRow = maxItemsInput.closest(".settings-field-row");
    expect(maxItemsRow).toBeTruthy();
    const resetButton = within(maxItemsRow as HTMLElement).getByRole("button", {
      name: "重置",
    });

    fireEvent.blur(maxItemsInput, { relatedTarget: resetButton });
    fireEvent.click(resetButton);

    expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: 200 }),
    );
  });

  it("updates desktop pet type and controls visibility", () => {
    const onUpdateAppSettings = vi.fn(async () => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            usageShowRemaining: false,
            showMessageFilePath: true,
            chatHistoryScrollbackItems: 200,
            threadTitleAutogenerationEnabled: false,
            uiFontFamily: "",
            codeFontFamily: "",
            codeFontSize: 11,
            notificationSoundsEnabled: true,
            systemNotificationsEnabled: true,
            codexPetId: "codex",
            codexPetEnabled: true,
            codexPetWakeVersion: 2,
          } as unknown) as AppSettings
        }
        reduceTransparency={false}
        scaleShortcutTitle=""
        scaleShortcutText=""
        scaleDraft="100%"
        codeFontDraft=""
        codeFontSizeDraft={11}
        onUpdateAppSettings={onUpdateAppSettings}
        onToggleTransparency={vi.fn()}
        onSetScaleDraft={vi.fn() as any}
        onCommitScale={vi.fn(async () => {})}
        onResetScale={vi.fn(async () => {})}
        onSetCodeFontDraft={vi.fn() as any}
        onCommitCodeFont={vi.fn(async () => {})}
        onSetCodeFontSizeDraft={vi.fn() as any}
        onCommitCodeFontSize={vi.fn(async () => {})}
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /默认助手宠物/ }));
    fireEvent.click(screen.getByRole("button", { name: "唤醒" }));
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    const petRow = screen.getByText("Codex 宠物").closest(".settings-toggle-row");
    expect(petRow).toBeTruthy();
    fireEvent.click(within(petRow as HTMLElement).getByRole("button"));

    expect(onUpdateAppSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        codexPetId: "codex",
        codexPetWakeVersion: expect.any(Number),
      }),
    );
    expect(onUpdateAppSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        codexPetWakeVersion: expect.any(Number),
      }),
    );
    expect(onUpdateAppSettings).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        codexPetWakeVersion: 3,
      }),
    );
    expect(onUpdateAppSettings).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        codexPetEnabled: false,
      }),
    );
  });

});

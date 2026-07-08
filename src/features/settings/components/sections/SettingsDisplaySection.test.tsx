// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import {
  DEFAULT_UI_CJK_FONT_FAMILY,
  DEFAULT_UI_LATIN_FONT_FAMILY,
} from "@utils/fonts";
import { SettingsDisplaySection } from "./SettingsDisplaySection";

vi.mock("@services/tauri", () => ({
  listSystemFonts: vi.fn(async () => []),
}));

describe("SettingsDisplaySection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("applies a style preset to theme and message colors", () => {
    const onUpdateAppSettings = vi.fn(async (_next: AppSettings) => {});

    render(
      <SettingsDisplaySection
        appSettings={
          ({
            theme: "system",
            themeAccent: "codex",
            messageReadingStyle: "bubble",
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

    fireEvent.click(screen.getByRole("radio", { name: /黑橙/ }));

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        messageCanvasColor: "#111315",
        messageUserBubbleColor: "#3a2a1d",
        messageUserTextColor: "#fff3df",
        messageAssistantBubbleColor: "#1b1b1c",
        messageAssistantAccentColor: "#ff9f43",
      }),
    );
    const presetSettings = onUpdateAppSettings.mock.calls[0]?.[0];
    expect(presetSettings).toEqual(
      expect.objectContaining({
        theme: "dark",
        themeAccent: "orange",
        messageReadingStyle: "cli",
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
            messageReadingStyle: "bubble",
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

    fireEvent.click(screen.getByRole("radio", { name: /纯白/ }));

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "light",
        themeAccent: "orange",
        messageReadingStyle: "native",
        messageCanvasColor: "#ffffff",
        messageAssistantBubbleColor: "#ffffff",
      }),
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

  it("updates desktop pet type and controls visibility", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "测试声音" }));
    fireEvent.click(screen.getByRole("button", { name: "测试通知" }));
  });

});

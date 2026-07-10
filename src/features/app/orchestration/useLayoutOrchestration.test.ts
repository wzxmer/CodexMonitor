// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppSettings } from "@/types";
import { useAppShellOrchestration } from "./useLayoutOrchestration";

const appSettings = {
  uiFontFamily: "system-ui, sans-serif",
  uiLatinFontFamily: '"Avenir", sans-serif',
  uiCjkFontFamily: '"LXGW WenKai Screen", sans-serif',
  uiFontSize: 13,
  uiFontWeight: 500,
  messageFontSize: 17,
  processFontSize: 11,
  codeFontFamily: '"JetBrains Mono", monospace',
  codeFontSize: 12,
} satisfies Pick<
  AppSettings,
  | "uiFontFamily"
  | "uiLatinFontFamily"
  | "uiCjkFontFamily"
  | "uiFontSize"
  | "uiFontWeight"
  | "messageFontSize"
  | "processFontSize"
  | "codeFontFamily"
  | "codeFontSize"
>;

describe("useAppShellOrchestration", () => {
  it("uses the composed UI font family in app-level CSS variables", () => {
    const { result } = renderHook(() =>
      useAppShellOrchestration({
        isCompact: false,
        isPhone: false,
        isTablet: false,
        sidebarCollapsed: false,
        rightPanelCollapsed: false,
        shouldReduceTransparency: false,
        isWorkspaceDropActive: false,
        centerMode: "chat",
        selectedDiffPath: null,
        showComposer: true,
        activeThreadId: "thread-1",
        sidebarWidth: 320,
        rightPanelWidth: 360,
        chatDiffSplitPositionPercent: 50,
        planPanelHeight: 240,
        terminalPanelHeight: 240,
        debugPanelHeight: 240,
        appSettings,
      }),
    );

    const appStyle = result.current.appStyle as Record<string, string>;

    expect(appStyle["--ui-font-family"]).toBe(
      '"Avenir", "LXGW WenKai Screen", sans-serif, system-ui',
    );
    expect(appStyle["--ui-font-weight"]).toBe("500");
    expect(appStyle["--message-font-family"]).toBe(
      '"Avenir", "LXGW WenKai Screen", sans-serif, system-ui',
    );
    expect(appStyle["--message-font-size"]).toBe("17px");
    expect(appStyle["--process-font-size"]).toBe("11px");
    expect(appStyle["--message-font-weight"]).toBe("500");
    expect(appStyle["--code-font-family"]).toBe(
      '"JetBrains Mono", "LXGW WenKai Screen", monospace, sans-serif, system-ui',
    );
  });
});

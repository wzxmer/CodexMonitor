// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import { useAppShellOrchestration } from "./useLayoutOrchestration";

const isWindowsPlatformMock = vi.hoisted(() => vi.fn());

vi.mock("@utils/platformPaths", () => ({
  isWindowsPlatform: isWindowsPlatformMock,
}));

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
  beforeEach(() => {
    isWindowsPlatformMock.mockReturnValue(false);
  });

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

  it("keeps a dedicated Windows drag strip clear of sidebar and caption controls", () => {
    isWindowsPlatformMock.mockReturnValue(true);
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

    expect(result.current.appClassName).toContain("is-windows");
    expect(appStyle["--window-drag-strip-pointer-events"]).toBe("auto");
    expect(appStyle["--window-drag-strip-left"]).toBe(
      "var(--sidebar-width, 280px)",
    );
    expect(appStyle["--window-drag-strip-right"]).toContain(
      "--window-caption-width",
    );
  });

  it("preserves a usable Windows drag strip in compact windows", () => {
    isWindowsPlatformMock.mockReturnValue(true);
    const { result } = renderHook(() =>
      useAppShellOrchestration({
        isCompact: true,
        isPhone: true,
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

    expect(appStyle["--window-drag-strip-left"]).toBe("64px");
    expect(appStyle["--window-drag-strip-right"]).toContain(
      "--window-caption-width",
    );
  });
});

import { describe, expect, it } from "vitest";
import type { AppSettings } from "@/types";
import { resolveRuntimeThemeAppearance } from "./runtimeThemeAppearance";

const baseSettings = {
  theme: "system",
  themeAccent: "codex",
  messageCanvasColor: "#ffffff",
  messageUserBubbleColor: "#f8fafc",
  messageUserTextColor: "#111827",
  messageAssistantBubbleColor: "#ffffff",
  messageAssistantAccentColor: "#8aa8d8",
  messageAssistantTextColor: "#263040",
} as AppSettings;

describe("resolveRuntimeThemeAppearance", () => {
  it("uses black-orange conversation colors for system dark mode", () => {
    const appearance = resolveRuntimeThemeAppearance(baseSettings, "dark");

    expect(appearance.themeAccent).toBe("orange");
    expect(appearance.conversationAppearance.messageCanvasColor).toBe("#111315");
    expect(appearance.conversationAppearance.messageAssistantBubbleColor).toBe("#1b1b1c");
    expect(appearance.conversationAppearance.composerInputBackgroundColor).toBeUndefined();
  });

  it("preserves saved colors for system light mode", () => {
    const appearance = resolveRuntimeThemeAppearance(baseSettings, "light");

    expect(appearance.themeAccent).toBe("codex");
    expect(appearance.conversationAppearance.messageCanvasColor).toBe("#ffffff");
    expect(appearance.conversationAppearance.composerInputBackgroundColor).toBe("#ffffff");
  });

  it("uses a pure white composer input for the warm white canvas", () => {
    const settings = { ...baseSettings, theme: "light" as const, messageCanvasColor: "#fffaf5" };
    const appearance = resolveRuntimeThemeAppearance(settings, "light");

    expect(appearance.conversationAppearance.composerInputBackgroundColor).toBe("#ffffff");
  });

  it("preserves explicit dark theme customization", () => {
    const settings = {
      ...baseSettings,
      theme: "dark" as const,
      messageCanvasColor: "#12100e",
    };
    const appearance = resolveRuntimeThemeAppearance(settings, "dark");

    expect(appearance.themeAccent).toBe("codex");
    expect(appearance.conversationAppearance.messageCanvasColor).toBe("#12100e");
    expect(appearance.conversationAppearance.composerInputBackgroundColor).toBeUndefined();
  });
});

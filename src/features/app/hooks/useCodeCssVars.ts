import { useEffect } from "react";
import type { AppSettings } from "../../../types";
import { resolveAppLanguage } from "@/features/i18n/appLanguage";

export function useCodeCssVars(appSettings: AppSettings) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty(
      "--ui-font-family",
      `${appSettings.uiLatinFontFamily}, ${appSettings.uiCjkFontFamily}, ${appSettings.uiFontFamily}`,
    );
    root.style.setProperty("--ui-font-size", `${appSettings.uiFontSize}px`);
    root.style.setProperty("--ui-font-weight", `${appSettings.uiFontWeight}`);
    root.style.setProperty("--code-font-family", appSettings.codeFontFamily);
    root.style.setProperty("--message-font-size", `${appSettings.messageFontSize}px`);
    root.style.setProperty("--message-font-family", appSettings.messageFontFamily);
    root.style.setProperty(
      "--message-font-weight",
      `${appSettings.messageFontWeight}`,
    );
    root.style.setProperty("--code-font-size", `${appSettings.codeFontSize}px`);
    root.dataset.themeAccent = appSettings.themeAccent;
    const resolvedLanguage = resolveAppLanguage(appSettings.appLanguage);
    root.dataset.appLanguage = resolvedLanguage;
    root.lang = resolvedLanguage === "zh" ? "zh-CN" : "en";
  }, [
    appSettings.appLanguage,
    appSettings.codeFontFamily,
    appSettings.codeFontSize,
    appSettings.messageFontSize,
    appSettings.messageFontFamily,
    appSettings.messageFontWeight,
    appSettings.themeAccent,
    appSettings.uiCjkFontFamily,
    appSettings.uiFontFamily,
    appSettings.uiFontSize,
    appSettings.uiFontWeight,
    appSettings.uiLatinFontFamily,
  ]);
}


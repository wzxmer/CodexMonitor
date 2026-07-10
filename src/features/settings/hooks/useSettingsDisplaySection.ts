import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "@/types";
import { clampUiScale } from "@utils/uiScale";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_CJK_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_UI_LATIN_FONT_FAMILY,
  clampCodeFontSize,
  clampUiFontSize,
  clampUiFontWeight,
  normalizeFontFamily,
} from "@utils/fonts";

type UseSettingsDisplaySectionArgs = {
  appSettings: AppSettings;
  reduceTransparency: boolean;
  onToggleTransparency: (value: boolean) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  onTestNotificationSound: () => void;
  onTestSystemNotification: () => void;
};

export type SettingsDisplaySectionProps = {
  appSettings: AppSettings;
  reduceTransparency: boolean;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  scaleDraft: string;
  uiFontDraft: string;
  uiLatinFontDraft: string;
  uiCjkFontDraft: string;
  uiFontSizeDraft: number;
  uiFontWeightDraft: number;
  codeFontDraft: string;
  codeFontSizeDraft: number;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onToggleTransparency: (value: boolean) => void;
  onSetScaleDraft: Dispatch<SetStateAction<string>>;
  onCommitScale: () => Promise<void>;
  onResetScale: () => Promise<void>;
  onSetUiFontDraft: Dispatch<SetStateAction<string>>;
  onCommitUiFont: () => Promise<void>;
  onSetUiLatinFontDraft: Dispatch<SetStateAction<string>>;
  onCommitUiLatinFont: () => Promise<void>;
  onSetUiCjkFontDraft: Dispatch<SetStateAction<string>>;
  onCommitUiCjkFont: () => Promise<void>;
  onSetUiFontSizeDraft: Dispatch<SetStateAction<number>>;
  onCommitUiFontSize: (nextSize: number) => Promise<void>;
  onSetUiFontWeightDraft: Dispatch<SetStateAction<number>>;
  onCommitUiFontWeight: (nextWeight: number) => Promise<void>;
  onSetCodeFontDraft: Dispatch<SetStateAction<string>>;
  onCommitCodeFont: () => Promise<void>;
  onSetCodeFontSizeDraft: Dispatch<SetStateAction<number>>;
  onCommitCodeFontSize: (nextSize: number) => Promise<void>;
  onTestNotificationSound: () => void;
  onTestSystemNotification: () => void;
};

export const useSettingsDisplaySection = ({
  appSettings,
  reduceTransparency,
  onToggleTransparency,
  onUpdateAppSettings,
  scaleShortcutTitle,
  scaleShortcutText,
  onTestNotificationSound,
  onTestSystemNotification,
}: UseSettingsDisplaySectionArgs): SettingsDisplaySectionProps => {
  const [scaleDraft, setScaleDraft] = useState(
    `${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`,
  );
  const [uiFontDraft, setUiFontDraft] = useState(appSettings.uiFontFamily);
  const [uiLatinFontDraft, setUiLatinFontDraft] = useState(
    appSettings.uiLatinFontFamily,
  );
  const [uiCjkFontDraft, setUiCjkFontDraft] = useState(appSettings.uiCjkFontFamily);
  const [uiFontSizeDraft, setUiFontSizeDraft] = useState(appSettings.uiFontSize);
  const [uiFontWeightDraft, setUiFontWeightDraft] = useState(
    appSettings.uiFontWeight,
  );
  const [codeFontDraft, setCodeFontDraft] = useState(appSettings.codeFontFamily);
  const [codeFontSizeDraft, setCodeFontSizeDraft] = useState(appSettings.codeFontSize);

  useEffect(() => {
    setScaleDraft(`${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`);
  }, [appSettings.uiScale]);

  useEffect(() => {
    setUiFontDraft(appSettings.uiFontFamily);
  }, [appSettings.uiFontFamily]);

  useEffect(() => {
    setUiLatinFontDraft(appSettings.uiLatinFontFamily);
  }, [appSettings.uiLatinFontFamily]);

  useEffect(() => {
    setUiCjkFontDraft(appSettings.uiCjkFontFamily);
  }, [appSettings.uiCjkFontFamily]);

  useEffect(() => {
    setUiFontSizeDraft(appSettings.uiFontSize);
  }, [appSettings.uiFontSize]);

  useEffect(() => {
    setUiFontWeightDraft(appSettings.uiFontWeight);
  }, [appSettings.uiFontWeight]);

  useEffect(() => {
    setCodeFontDraft(appSettings.codeFontFamily);
  }, [appSettings.codeFontFamily]);

  useEffect(() => {
    setCodeFontSizeDraft(appSettings.codeFontSize);
  }, [appSettings.codeFontSize]);

  const trimmedScale = scaleDraft.trim();
  const parsedPercent = trimmedScale
    ? Number(trimmedScale.replace("%", ""))
    : Number.NaN;
  const parsedScale = Number.isFinite(parsedPercent) ? parsedPercent / 100 : null;

  const handleCommitScale = async () => {
    if (parsedScale === null) {
      setScaleDraft(`${Math.round(clampUiScale(appSettings.uiScale) * 100)}%`);
      return;
    }
    const nextScale = clampUiScale(parsedScale);
    setScaleDraft(`${Math.round(nextScale * 100)}%`);
    if (nextScale === appSettings.uiScale) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiScale: nextScale,
    });
  };

  const handleResetScale = async () => {
    if (appSettings.uiScale === 1) {
      setScaleDraft("100%");
      return;
    }
    setScaleDraft("100%");
    await onUpdateAppSettings({
      ...appSettings,
      uiScale: 1,
    });
  };

  const handleCommitUiFont = async () => {
    const nextFont = normalizeFontFamily(uiFontDraft, DEFAULT_UI_FONT_FAMILY);
    setUiFontDraft(nextFont);
    if (nextFont === appSettings.uiFontFamily) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiFontFamily: nextFont,
    });
  };

  const handleCommitUiLatinFont = async () => {
    const nextFont = normalizeFontFamily(
      uiLatinFontDraft,
      DEFAULT_UI_LATIN_FONT_FAMILY,
    );
    setUiLatinFontDraft(nextFont);
    if (nextFont === appSettings.uiLatinFontFamily) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiLatinFontFamily: nextFont,
    });
  };

  const handleCommitUiCjkFont = async () => {
    const nextFont = normalizeFontFamily(
      uiCjkFontDraft,
      DEFAULT_UI_CJK_FONT_FAMILY,
    );
    setUiCjkFontDraft(nextFont);
    if (nextFont === appSettings.uiCjkFontFamily) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiCjkFontFamily: nextFont,
    });
  };

  const handleCommitUiFontSize = async (nextSize: number) => {
    const clampedSize = clampUiFontSize(nextSize);
    setUiFontSizeDraft(clampedSize);
    if (clampedSize === appSettings.uiFontSize) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiFontSize: clampedSize,
    });
  };

  const handleCommitCodeFont = async () => {
    const nextFont = normalizeFontFamily(codeFontDraft, DEFAULT_CODE_FONT_FAMILY);
    setCodeFontDraft(nextFont);
    if (nextFont === appSettings.codeFontFamily) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      codeFontFamily: nextFont,
    });
  };

  const handleCommitUiFontWeight = async (nextWeight: number) => {
    const clampedWeight = clampUiFontWeight(nextWeight);
    setUiFontWeightDraft(clampedWeight);
    if (clampedWeight === appSettings.uiFontWeight) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      uiFontWeight: clampedWeight,
    });
  };

  const handleCommitCodeFontSize = async (nextSize: number) => {
    const clampedSize = clampCodeFontSize(nextSize);
    setCodeFontSizeDraft(clampedSize);
    if (clampedSize === appSettings.codeFontSize) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      codeFontSize: clampedSize,
    });
  };

  return {
    appSettings,
    reduceTransparency,
    scaleShortcutTitle,
    scaleShortcutText,
    scaleDraft,
    uiFontDraft,
    uiLatinFontDraft,
    uiCjkFontDraft,
    uiFontSizeDraft,
    uiFontWeightDraft,
    codeFontDraft,
    codeFontSizeDraft,
    onUpdateAppSettings,
    onToggleTransparency,
    onSetScaleDraft: setScaleDraft,
    onCommitScale: handleCommitScale,
    onResetScale: handleResetScale,
    onSetUiFontDraft: setUiFontDraft,
    onCommitUiFont: handleCommitUiFont,
    onSetUiLatinFontDraft: setUiLatinFontDraft,
    onCommitUiLatinFont: handleCommitUiLatinFont,
    onSetUiCjkFontDraft: setUiCjkFontDraft,
    onCommitUiCjkFont: handleCommitUiCjkFont,
    onSetUiFontSizeDraft: setUiFontSizeDraft,
    onCommitUiFontSize: handleCommitUiFontSize,
    onSetUiFontWeightDraft: setUiFontWeightDraft,
    onCommitUiFontWeight: handleCommitUiFontWeight,
    onSetCodeFontDraft: setCodeFontDraft,
    onCommitCodeFont: handleCommitCodeFont,
    onSetCodeFontSizeDraft: setCodeFontSizeDraft,
    onCommitCodeFontSize: handleCommitCodeFontSize,
    onTestNotificationSound,
    onTestSystemNotification,
  };
};

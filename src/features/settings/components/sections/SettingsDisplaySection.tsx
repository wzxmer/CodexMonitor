import {
  useEffect,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { AppSettings } from "@/types";
import {
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  CODE_FONT_SIZE_DEFAULT,
  CODE_FONT_FAMILY_PRESETS,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_CJK_FONT_FAMILY,
  DEFAULT_UI_LATIN_FONT_FAMILY,
  MESSAGE_FONT_SIZE_DEFAULT,
  MESSAGE_FONT_SIZE_MAX,
  MESSAGE_FONT_SIZE_MIN,
  MESSAGE_FONT_WEIGHT_DEFAULT,
  MESSAGE_FONT_WEIGHT_MAX,
  MESSAGE_FONT_WEIGHT_MIN,
  UI_CJK_FONT_FAMILY_PRESETS,
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  UI_FONT_WEIGHT_DEFAULT,
  UI_FONT_WEIGHT_MAX,
  UI_FONT_WEIGHT_MIN,
  UI_LATIN_FONT_FAMILY_PRESETS,
} from "@utils/fonts";
import { listSystemFonts } from "@services/tauri";
import { open } from "@tauri-apps/plugin-dialog";

import {
  CHAT_SCROLLBACK_DEFAULT,
  CHAT_SCROLLBACK_MAX,
  CHAT_SCROLLBACK_MIN,
  CHAT_SCROLLBACK_PRESETS,
  clampChatScrollbackItems,
  isChatScrollbackPreset,
} from "@utils/chatScrollback";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { RoundedSelect } from "@/features/design-system/components/select/RoundedSelect";
import { useI18n } from "@/features/i18n/I18nProvider";

const THEME_ACCENT_OPTIONS: Array<{
  value: AppSettings["themeAccent"];
  swatch: string;
}> = [
  {
    value: "codex",
    swatch: "linear-gradient(135deg, #c49aff, #64c8ff)",
  },
  {
    value: "blue",
    swatch: "linear-gradient(135deg, #8ebaff, #5ca8ff)",
  },
  {
    value: "green",
    swatch: "linear-gradient(135deg, #80e0be, #5cd2a6)",
  },
  {
    value: "pink",
    swatch: "linear-gradient(135deg, #ff9ad5, #eb7ebe)",
  },
  {
    value: "orange",
    swatch: "linear-gradient(135deg, #ffb269, #f5a65c)",
  },
];

const STYLE_PRESETS: Array<{
  id: string;
  swatch: string;
  settings: Pick<
    AppSettings,
    | "theme"
    | "themeAccent"
    | "messageReadingStyle"
    | "messageCanvasColor"
    | "messageUserBubbleColor"
    | "messageUserTextColor"
    | "messageAssistantBubbleColor"
    | "messageAssistantAccentColor"
    | "messageAssistantTextColor"
  >;
}> = [
  {
    id: "native-white",
    swatch: "linear-gradient(135deg, #ffffff 0%, #ffffff 62%, #f28b3c 100%)",
    settings: {
      theme: "light",
      themeAccent: "codex",
      messageReadingStyle: "codex",
      messageCanvasColor: "#ffffff",
      messageUserBubbleColor: "#fff7ed",
      messageUserTextColor: "#2e2118",
      messageAssistantBubbleColor: "#ffffff",
      messageAssistantAccentColor: "#f28b3c",
      messageAssistantTextColor: "#201a16",
    },
  },
  {
    id: "native-light",
    swatch: "linear-gradient(135deg, #fffaf5 0%, #f4efe8 58%, #f28b3c 100%)",
    settings: {
      theme: "light",
      themeAccent: "codex",
      messageReadingStyle: "codex",
      messageCanvasColor: "#fffaf5",
      messageUserBubbleColor: "#fff4e8",
      messageUserTextColor: "#332519",
      messageAssistantBubbleColor: "#ffffff",
      messageAssistantAccentColor: "#f28b3c",
      messageAssistantTextColor: "#2d241d",
    },
  },
  {
    id: "native-dark",
    swatch: "linear-gradient(135deg, #171513 0%, #25201b 62%, #f28b3c 100%)",
    settings: {
      theme: "dark",
      themeAccent: "codex",
      messageReadingStyle: "codex",
      messageCanvasColor: "#12100e",
      messageUserBubbleColor: "#3a2617",
      messageUserTextColor: "#fff1df",
      messageAssistantBubbleColor: "#181512",
      messageAssistantAccentColor: "#f28b3c",
      messageAssistantTextColor: "#f1e7dc",
    },
  },
  {
    id: "cli-ember",
    swatch: "linear-gradient(135deg, #151719 0%, #24211d 58%, #ff9f43 100%)",
    settings: {
      theme: "dark",
      themeAccent: "orange",
      messageReadingStyle: "cli",
      messageCanvasColor: "#111315",
      messageUserBubbleColor: "#3a2a1d",
      messageUserTextColor: "#fff3df",
      messageAssistantBubbleColor: "#1b1b1c",
      messageAssistantAccentColor: "#ff9f43",
      messageAssistantTextColor: "#f6e7cf",
    },
  },
];

const FONT_CLARITY_PRESETS: Array<{
  id: string;
  uiLatinFontFamily: string;
  uiCjkFontFamily: string;
  uiFontWeight: number;
  messageFontWeight: number;
}> = [
  {
    id: "standard",
    uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
    uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
    uiFontWeight: UI_FONT_WEIGHT_DEFAULT,
    messageFontWeight: MESSAGE_FONT_WEIGHT_DEFAULT,
  },
  {
    id: "windows-clear",
    uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
    uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
    uiFontWeight: 500,
    messageFontWeight: 500,
  },
  {
    id: "bold-reading",
    uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
    uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
    uiFontWeight: 550,
    messageFontWeight: 550,
  },
  {
    id: "light",
    uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
    uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
    uiFontWeight: 400,
    messageFontWeight: 450,
  },
];

type CodexPetId = NonNullable<AppSettings["codexPetId"]>;

const CODEX_PET_OPTIONS: Array<{
  id: Exclude<CodexPetId, "custom">;
  title: string;
  tone: string;
}> = [
  {
    id: "codex",
    title: "Codex",
    tone: "linear-gradient(135deg, #f28b3c, #ffd4a3)",
  },
  {
    id: "terminal",
    title: "Terminal",
    tone: "linear-gradient(135deg, #58d68d, #9af5c4)",
  },
  {
    id: "review",
    title: "Review",
    tone: "linear-gradient(135deg, #7dadff, #c7d8ff)",
  },
];

type SettingsDisplaySectionProps = {
  appSettings: AppSettings;
  reduceTransparency: boolean;
  scaleShortcutTitle: string;
  scaleShortcutText: string;
  scaleDraft: string;
  uiLatinFontDraft?: string;
  uiCjkFontDraft?: string;
  uiFontSizeDraft?: number;
  uiFontWeightDraft?: number;
  codeFontDraft: string;
  messageFontSizeDraft?: number;
  messageFontWeightDraft?: number;
  codeFontSizeDraft: number;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onToggleTransparency: (value: boolean) => void;
  onSetScaleDraft: Dispatch<SetStateAction<string>>;
  onCommitScale: () => Promise<void>;
  onResetScale: () => Promise<void>;
  onSetUiLatinFontDraft?: Dispatch<SetStateAction<string>>;
  onCommitUiLatinFont?: () => Promise<void>;
  onSetUiCjkFontDraft?: Dispatch<SetStateAction<string>>;
  onCommitUiCjkFont?: () => Promise<void>;
  onSetUiFontSizeDraft?: Dispatch<SetStateAction<number>>;
  onCommitUiFontSize?: (nextSize: number) => Promise<void>;
  onSetUiFontWeightDraft?: Dispatch<SetStateAction<number>>;
  onCommitUiFontWeight?: (nextWeight: number) => Promise<void>;
  onSetCodeFontDraft: Dispatch<SetStateAction<string>>;
  onCommitCodeFont: () => Promise<void>;
  onSetMessageFontSizeDraft?: Dispatch<SetStateAction<number>>;
  onCommitMessageFontSize?: (nextSize: number) => Promise<void>;
  onSetMessageFontWeightDraft?: Dispatch<SetStateAction<number>>;
  onCommitMessageFontWeight?: (nextWeight: number) => Promise<void>;
  onSetCodeFontSizeDraft: Dispatch<SetStateAction<number>>;
  onCommitCodeFontSize: (nextSize: number) => Promise<void>;
  onTestNotificationSound: () => void;
  onTestSystemNotification: () => void;
};

export function SettingsDisplaySection({
  appSettings,
  reduceTransparency,
  scaleShortcutTitle,
  scaleShortcutText,
  scaleDraft,
  uiLatinFontDraft = DEFAULT_UI_LATIN_FONT_FAMILY,
  uiCjkFontDraft = DEFAULT_UI_CJK_FONT_FAMILY,
  uiFontSizeDraft = UI_FONT_SIZE_DEFAULT,
  uiFontWeightDraft = UI_FONT_WEIGHT_DEFAULT,
  codeFontDraft,
  messageFontSizeDraft = MESSAGE_FONT_SIZE_DEFAULT,
  messageFontWeightDraft = MESSAGE_FONT_WEIGHT_DEFAULT,
  codeFontSizeDraft,
  onUpdateAppSettings,
  onToggleTransparency,
  onSetScaleDraft,
  onCommitScale,
  onResetScale,
  onSetUiLatinFontDraft = () => {},
  onCommitUiLatinFont = async () => {},
  onSetUiCjkFontDraft = () => {},
  onCommitUiCjkFont = async () => {},
  onSetUiFontSizeDraft = () => {},
  onCommitUiFontSize = async () => {},
  onSetUiFontWeightDraft = () => {},
  onCommitUiFontWeight = async () => {},
  onSetCodeFontDraft,
  onCommitCodeFont,
  onSetMessageFontSizeDraft = () => {},
  onCommitMessageFontSize = async () => {},
  onSetMessageFontWeightDraft = () => {},
  onCommitMessageFontWeight = async () => {},
  onSetCodeFontSizeDraft,
  onCommitCodeFontSize,
  onTestNotificationSound,
  onTestSystemNotification,
}: SettingsDisplaySectionProps) {
  const { t } = useI18n();
  const languageOptions = [
    { value: "system", label: t("language.auto") },
    { value: "zh", label: t("language.zh") },
    { value: "en", label: t("language.en") },
  ] satisfies Array<{ value: AppSettings["appLanguage"]; label: string }>;
  const scrollbackUnlimited = appSettings.chatHistoryScrollbackItems === null;
  const [scrollbackDraft, setScrollbackDraft] = useState(() => {
    const value = appSettings.chatHistoryScrollbackItems;
    return typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : String(CHAT_SCROLLBACK_DEFAULT);
  });
  const [systemFonts, setSystemFonts] = useState<string[]>([]);

  useEffect(() => {
    const value = appSettings.chatHistoryScrollbackItems;
    if (typeof value === "number" && Number.isFinite(value)) {
      setScrollbackDraft(String(value));
    }
  }, [appSettings.chatHistoryScrollbackItems]);

  useEffect(() => {
    let active = true;
    void listSystemFonts()
      .then((fonts) => {
        if (active) {
          setSystemFonts(fonts);
        }
      })
      .catch(() => {
        if (active) {
          setSystemFonts([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const uiLatinFontOptions = [
    ...UI_LATIN_FONT_FAMILY_PRESETS,
    ...systemFonts.map((font) => ({
      label: font,
      value: `"${font}", "Segoe UI", system-ui, sans-serif`,
    })),
  ].filter(
    (option, index, options) =>
      options.findIndex((candidate) => candidate.value === option.value) === index,
  );
  const uiCjkFontOptions = [
    ...UI_CJK_FONT_FAMILY_PRESETS,
    ...systemFonts.map((font) => ({
      label: font,
      value: `"${font}", "Microsoft YaHei UI", sans-serif`,
    })),
  ].filter(
    (option, index, options) =>
      options.findIndex((candidate) => candidate.value === option.value) === index,
  );
  const codeFontOptions = [
    ...CODE_FONT_FAMILY_PRESETS,
    ...systemFonts.map((font) => ({
      label: font,
      value: `"${font}", "Cascadia Mono", monospace`,
    })),
  ].filter(
    (option, index, options) =>
      options.findIndex((candidate) => candidate.value === option.value) === index,
  );

  const scrollbackPresetValue = (() => {
    const value = appSettings.chatHistoryScrollbackItems;
    if (typeof value === "number" && isChatScrollbackPreset(value)) {
      return String(value);
    }
    return "custom";
  })();
  const codexPetId = appSettings.codexPetId ?? "codex";
  const codexPetWakeVersion = appSettings.codexPetWakeVersion ?? 0;
  const customPetAvailable = Boolean(appSettings.codexPetCustomImagePath);

  const updateCodexPet = (next: Partial<AppSettings>) => {
    void onUpdateAppSettings({
      ...appSettings,
      ...next,
    });
  };

  const wakeCodexPet = () => {
    updateCodexPet({
      codexPetWakeVersion: Date.now(),
    });
  };

  const refreshCodexPet = () => {
    updateCodexPet({
      codexPetWakeVersion: codexPetWakeVersion + 1,
    });
  };

  const importCodexPet = async () => {
    const selection = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
        },
      ],
    });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    updateCodexPet({
      codexPetId: "custom",
      codexPetCustomImagePath: selection,
      codexPetWakeVersion: Date.now(),
    });
  };

  const commitScrollback = () => {
    if (scrollbackUnlimited) {
      return;
    }
    const trimmed = scrollbackDraft.trim();
    const parsed = trimmed ? Number(trimmed) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      const current = appSettings.chatHistoryScrollbackItems;
      const fallback =
        typeof current === "number" && Number.isFinite(current)
          ? current
          : CHAT_SCROLLBACK_DEFAULT;
      setScrollbackDraft(String(fallback));
      return;
    }
    const nextValue = clampChatScrollbackItems(parsed);
    setScrollbackDraft(String(nextValue));
    if (appSettings.chatHistoryScrollbackItems === nextValue) {
      return;
    }
    void onUpdateAppSettings({
      ...appSettings,
      chatHistoryScrollbackItems: nextValue,
    });
  };

  const toggleUnlimitedScrollback = () => {
    const nextUnlimited = !scrollbackUnlimited;
    if (nextUnlimited) {
      void onUpdateAppSettings({
        ...appSettings,
        chatHistoryScrollbackItems: null,
      });
      return;
    }
    const trimmed = scrollbackDraft.trim();
    const parsed = trimmed ? Number(trimmed) : Number.NaN;
    const nextValue = Number.isFinite(parsed)
      ? clampChatScrollbackItems(parsed)
      : CHAT_SCROLLBACK_DEFAULT;
    setScrollbackDraft(String(nextValue));
    void onUpdateAppSettings({
      ...appSettings,
      chatHistoryScrollbackItems: nextValue,
    });
  };

  const selectScrollbackPreset = (rawValue: string) => {
    if (scrollbackUnlimited) {
      return;
    }
    if (rawValue === "custom") {
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const nextValue = clampChatScrollbackItems(parsed);
    setScrollbackDraft(String(nextValue));
    void onUpdateAppSettings({
      ...appSettings,
      chatHistoryScrollbackItems: nextValue,
    });
  };

  const applyFontClarityPreset = (preset: (typeof FONT_CLARITY_PRESETS)[number]) => {
    onSetUiLatinFontDraft(preset.uiLatinFontFamily);
    onSetUiCjkFontDraft(preset.uiCjkFontFamily);
    onSetUiFontWeightDraft(preset.uiFontWeight);
    onSetMessageFontWeightDraft(preset.messageFontWeight);
    void onUpdateAppSettings({
      ...appSettings,
      uiLatinFontFamily: preset.uiLatinFontFamily,
      uiCjkFontFamily: preset.uiCjkFontFamily,
      uiFontWeight: preset.uiFontWeight,
      messageFontWeight: preset.messageFontWeight,
    });
  };

  const activeFontClarityPresetId =
    FONT_CLARITY_PRESETS.find(
      (preset) =>
        preset.uiLatinFontFamily === appSettings.uiLatinFontFamily &&
        preset.uiCjkFontFamily === appSettings.uiCjkFontFamily &&
        preset.uiFontWeight === appSettings.uiFontWeight &&
        preset.messageFontWeight === appSettings.messageFontWeight,
    )?.id ?? null;
  const activeStylePresetId =
    STYLE_PRESETS.find((preset) =>
      Object.entries(preset.settings).every(
        ([key, value]) => appSettings[key as keyof typeof preset.settings] === value,
      ),
    )?.id ?? null;

  return (
    <SettingsSection
      title={t("settings.display.title")}
      subtitle={t("settings.display.subtitle")}
    >
      <div className="settings-subsection-title">
        {t("settings.display.sectionTitle")}
      </div>
      <div className="settings-subsection-subtitle">
        {t("settings.display.sectionSubtitle")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="language-select">
          {t("settings.display.language")}
        </label>
        <RoundedSelect
          ariaLabel={t("settings.display.language")}
          className="settings-select"
          value={appSettings.appLanguage}
          options={languageOptions}
          onChange={(nextValue) =>
            void onUpdateAppSettings({
              ...appSettings,
              appLanguage: nextValue as AppSettings["appLanguage"],
            })
          }
        />
        <div className="settings-help">
          {t("settings.display.languageHelp")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.display.stylePresets")}</div>
        <div className="settings-style-presets" role="radiogroup" aria-label={t("settings.display.stylePresets")}>
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`settings-style-preset${
                activeStylePresetId === preset.id ? " is-selected" : ""
              }`}
              role="radio"
              aria-checked={activeStylePresetId === preset.id}
              onClick={() =>
                void onUpdateAppSettings({
                  ...appSettings,
                  ...preset.settings,
                })
              }
            >
              <span
                className="settings-style-preset-swatch"
                style={{ background: preset.swatch }}
                aria-hidden
              />
              <span className="settings-style-preset-copy">
                <span className="settings-style-preset-title">
                  {t(`settings.display.stylePreset.${preset.id}.title` as any)}
                </span>
                <span className="settings-style-preset-subtitle">
                  {t(`settings.display.stylePreset.${preset.id}.subtitle` as any)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="settings-help">
          {t("settings.display.stylePresetHelp")}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="theme-select">
          {t("settings.display.theme")}
        </label>
        <select
          id="theme-select"
          className="settings-select"
          value={appSettings.theme}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              theme: event.target.value as AppSettings["theme"],
            })
          }
        >
          <option value="system">{t("settings.display.themeSystem")}</option>
          <option value="light">{t("settings.display.themeLight")}</option>
          <option value="dark">{t("settings.display.themeDark")}</option>
          <option value="dim">{t("settings.display.themeDim")}</option>
        </select>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.display.accent")}</div>
        <div className="settings-accent-options" role="radiogroup" aria-label={t("settings.display.accent")}>
          {THEME_ACCENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`settings-accent-option${
                appSettings.themeAccent === option.value ? " is-selected" : ""
              }`}
              role="radio"
              aria-checked={appSettings.themeAccent === option.value}
              onClick={() =>
                void onUpdateAppSettings({
                  ...appSettings,
                  themeAccent: option.value,
                })
              }
            >
              <span
                className="settings-accent-swatch"
                style={{ background: option.swatch }}
                aria-hidden
              />
              <span className="settings-accent-label">
                {t(`settings.display.accent.${option.value}` as any)}
              </span>
            </button>
          ))}
        </div>
        <div className="settings-help">
          {t("settings.display.accentHelp")}
        </div>
      </div>
      <SettingsToggleRow
        title={t("settings.display.showRemainingTitle")}
        subtitle={t("settings.display.showRemainingSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.usageShowRemaining}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              usageShowRemaining: !appSettings.usageShowRemaining,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.display.showFilePathTitle")}
        subtitle={t("settings.display.showFilePathSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.showMessageFilePath}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              showMessageFilePath: !appSettings.showMessageFilePath,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.display.collapseToolsTitle")}
        subtitle={t("settings.display.collapseToolsSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.messageToolGroupsCollapsedByDefault}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              messageToolGroupsCollapsedByDefault:
                !appSettings.messageToolGroupsCollapsedByDefault,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.display.splitDiffTitle")}
        subtitle={t("settings.display.splitDiffSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.splitChatDiffView}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              splitChatDiffView: !appSettings.splitChatDiffView,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.display.autoTitleTitle")}
        subtitle={t("settings.display.autoTitleSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.threadTitleAutogenerationEnabled}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              threadTitleAutogenerationEnabled:
                !appSettings.threadTitleAutogenerationEnabled,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-subsection-title">{t("settings.display.chat")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.display.chatSubtitle")}
      </div>
      <SettingsToggleRow
        title={t("settings.display.unlimitedHistoryTitle")}
        subtitle={t("settings.display.unlimitedHistorySubtitle")}
      >
        <SettingsToggleSwitch
          pressed={scrollbackUnlimited}
          onClick={toggleUnlimitedScrollback}
          data-scrollback-control="true"
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="chat-scrollback-preset">
          {t("settings.display.historyPreset")}
        </label>
        <select
          id="chat-scrollback-preset"
          className="settings-select"
          value={scrollbackPresetValue}
          onChange={(event) => selectScrollbackPreset(event.target.value)}
          data-scrollback-control="true"
          disabled={scrollbackUnlimited}
        >
          <option value="custom">{t("common.custom")}</option>
          {CHAT_SCROLLBACK_PRESETS.map((value) => (
            <option key={value} value={value}>
              {value === CHAT_SCROLLBACK_DEFAULT
                ? t("settings.display.defaultValue").replace("{value}", String(value))
                : value}
            </option>
          ))}
        </select>
        <div className="settings-help">
          {t("settings.display.historyPresetHelp")}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="chat-scrollback-items">
          {t("settings.display.maxEntries")}
        </label>
        <div className="settings-field-row">
          <input
            id="chat-scrollback-items"
            type="text"
            inputMode="numeric"
            className="settings-input"
            value={scrollbackDraft}
            disabled={scrollbackUnlimited}
            onChange={(event) => setScrollbackDraft(event.target.value)}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (
                nextTarget instanceof HTMLElement &&
                nextTarget.dataset.scrollbackControl === "true"
              ) {
                return;
              }
              commitScrollback();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitScrollback();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            data-scrollback-control="true"
            disabled={scrollbackUnlimited}
            onClick={() => {
              setScrollbackDraft(String(CHAT_SCROLLBACK_DEFAULT));
              void onUpdateAppSettings({
                ...appSettings,
                chatHistoryScrollbackItems: CHAT_SCROLLBACK_DEFAULT,
              });
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.display.maxEntriesHelp")
            .replace("{min}", String(CHAT_SCROLLBACK_MIN))
            .replace("{max}", String(CHAT_SCROLLBACK_MAX))}
        </div>
      </div>
      <SettingsToggleRow
        title={t("settings.display.reduceTransparencyTitle")}
        subtitle={t("settings.display.reduceTransparencySubtitle")}
      >
        <SettingsToggleSwitch
          pressed={reduceTransparency}
          onClick={() => onToggleTransparency(!reduceTransparency)}
        />
      </SettingsToggleRow>
      <div className="settings-toggle-row settings-scale-row">
        <div>
          <div className="settings-toggle-title">{t("settings.display.uiScale")}</div>
          <div className="settings-toggle-subtitle" title={scaleShortcutTitle}>
            {scaleShortcutText}
          </div>
        </div>
        <div className="settings-scale-controls">
          <input
            id="ui-scale"
            type="text"
            inputMode="decimal"
            className="settings-input settings-input--scale"
            value={scaleDraft}
            aria-label={t("settings.display.uiScale")}
            onChange={(event) => onSetScaleDraft(event.target.value)}
            onBlur={() => {
              void onCommitScale();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onCommitScale();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-scale-reset"
            onClick={() => {
              void onResetScale();
            }}
          >
            {t("common.reset")}
          </button>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.display.fontClarity")}</div>
        <div className="settings-clarity-options" role="radiogroup" aria-label={t("settings.display.fontClarity")}>
          {FONT_CLARITY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`settings-clarity-option${
                activeFontClarityPresetId === preset.id ? " is-selected" : ""
              }`}
              role="radio"
              aria-checked={activeFontClarityPresetId === preset.id}
              onClick={() => applyFontClarityPreset(preset)}
            >
              <span className="settings-clarity-title">
                {t(`settings.display.fontClarity.${preset.id}.title` as any)}
              </span>
              <span className="settings-clarity-subtitle">
                {t(`settings.display.fontClarity.${preset.id}.subtitle` as any)}
              </span>
            </button>
          ))}
        </div>
        <div className="settings-help">
          {t("settings.display.fontClarityHelp")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">
          {t("settings.display.uiLatinFont")}
        </div>
        <RoundedSelect
          ariaLabel={t("settings.display.uiLatinFont")}
          className="settings-select settings-font-select"
          popoverClassName="settings-font-select-popover"
          value={
            uiLatinFontOptions.some((preset) => preset.value === uiLatinFontDraft)
              ? uiLatinFontDraft
              : "custom"
          }
          options={[...uiLatinFontOptions, { label: t("common.custom"), value: "custom" }]}
          onChange={(nextValue) => {
            if (nextValue === "custom") {
              return;
            }
            onSetUiLatinFontDraft(nextValue);
            void onUpdateAppSettings({
              ...appSettings,
              uiLatinFontFamily: nextValue,
            });
          }}
        />
        <div className="settings-field-row">
          <input
            type="text"
            className="settings-input"
            aria-label={t("settings.display.customUiLatinFont")}
            value={uiLatinFontDraft}
            onChange={(event) => onSetUiLatinFontDraft(event.target.value)}
            onBlur={() => {
              void onCommitUiLatinFont();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onCommitUiLatinFont();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetUiLatinFontDraft(DEFAULT_UI_LATIN_FONT_FAMILY);
              void onUpdateAppSettings({
                ...appSettings,
                uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
              });
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.display.uiLatinFontHelp")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">
          {t("settings.display.uiCjkFont")}
        </div>
        <RoundedSelect
          ariaLabel={t("settings.display.uiCjkFont")}
          className="settings-select settings-font-select"
          popoverClassName="settings-font-select-popover"
          value={
            uiCjkFontOptions.some((preset) => preset.value === uiCjkFontDraft)
              ? uiCjkFontDraft
              : "custom"
          }
          options={[...uiCjkFontOptions, { label: t("common.custom"), value: "custom" }]}
          onChange={(nextValue) => {
            if (nextValue === "custom") {
              return;
            }
            onSetUiCjkFontDraft(nextValue);
            void onUpdateAppSettings({
              ...appSettings,
              uiCjkFontFamily: nextValue,
            });
          }}
        />
        <div className="settings-field-row">
          <input
            type="text"
            className="settings-input"
            aria-label={t("settings.display.customUiCjkFont")}
            value={uiCjkFontDraft}
            onChange={(event) => onSetUiCjkFontDraft(event.target.value)}
            onBlur={() => {
              void onCommitUiCjkFont();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onCommitUiCjkFont();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetUiCjkFontDraft(DEFAULT_UI_CJK_FONT_FAMILY);
              void onUpdateAppSettings({
                ...appSettings,
                uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
              });
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.display.uiCjkFontHelp")}
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="ui-font-size">
          {t("settings.display.uiFontSize")}
        </label>
        <div className="settings-field-row">
          <input
            id="ui-font-size"
            type="range"
            min={UI_FONT_SIZE_MIN}
            max={UI_FONT_SIZE_MAX}
            step={1}
            className="settings-input settings-input--range"
            value={uiFontSizeDraft}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onSetUiFontSizeDraft(nextValue);
              void onCommitUiFontSize(nextValue);
            }}
          />
          <div className="settings-scale-value">{uiFontSizeDraft}px</div>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetUiFontSizeDraft(UI_FONT_SIZE_DEFAULT);
              void onCommitUiFontSize(UI_FONT_SIZE_DEFAULT);
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">{t("settings.display.uiFontSizeHelp")}</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="ui-font-weight">
          {t("settings.display.uiFontWeight")}
        </label>
        <div className="settings-field-row">
          <input
            id="ui-font-weight"
            type="range"
            min={UI_FONT_WEIGHT_MIN}
            max={UI_FONT_WEIGHT_MAX}
            step={50}
            className="settings-input settings-input--range"
            value={uiFontWeightDraft}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onSetUiFontWeightDraft(nextValue);
              void onCommitUiFontWeight(nextValue);
            }}
          />
          <div className="settings-scale-value">{uiFontWeightDraft}</div>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetUiFontWeightDraft(UI_FONT_WEIGHT_DEFAULT);
              void onCommitUiFontWeight(UI_FONT_WEIGHT_DEFAULT);
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">{t("settings.display.uiFontWeightHelp")}</div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">
          {t("settings.display.codeFont")}
        </div>
        <RoundedSelect
          ariaLabel={t("settings.display.codeFont")}
          className="settings-select settings-font-select"
          popoverClassName="settings-font-select-popover"
          value={
            codeFontOptions.some((preset) => preset.value === codeFontDraft)
              ? codeFontDraft
              : "custom"
          }
          options={[...codeFontOptions, { label: t("common.custom"), value: "custom" }]}
          onChange={(nextValue) => {
            if (nextValue === "custom") {
              return;
            }
            onSetCodeFontDraft(nextValue);
            void onUpdateAppSettings({
              ...appSettings,
              codeFontFamily: nextValue,
            });
          }}
        />
        <div className="settings-field-row">
          <input
            type="text"
            className="settings-input"
            aria-label={t("settings.display.customCodeFont")}
            value={codeFontDraft}
            onChange={(event) => onSetCodeFontDraft(event.target.value)}
            onBlur={() => {
              void onCommitCodeFont();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onCommitCodeFont();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetCodeFontDraft(DEFAULT_CODE_FONT_FAMILY);
              void onUpdateAppSettings({
                ...appSettings,
                codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
              });
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">{t("settings.display.codeFontHelp")}</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="message-font-size">
          {t("settings.display.messageFontSize")}
        </label>
        <div className="settings-field-row">
          <input
            id="message-font-size"
            type="range"
            min={MESSAGE_FONT_SIZE_MIN}
            max={MESSAGE_FONT_SIZE_MAX}
            step={1}
            className="settings-input settings-input--range"
            value={messageFontSizeDraft}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onSetMessageFontSizeDraft(nextValue);
              void onCommitMessageFontSize(nextValue);
            }}
          />
          <div className="settings-scale-value">{messageFontSizeDraft}px</div>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetMessageFontSizeDraft(MESSAGE_FONT_SIZE_DEFAULT);
              void onCommitMessageFontSize(MESSAGE_FONT_SIZE_DEFAULT);
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">{t("settings.display.messageFontSizeHelp")}</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="message-font-weight">
          {t("settings.display.messageFontWeight")}
        </label>
        <div className="settings-field-row">
          <input
            id="message-font-weight"
            type="range"
            min={MESSAGE_FONT_WEIGHT_MIN}
            max={MESSAGE_FONT_WEIGHT_MAX}
            step={50}
            className="settings-input settings-input--range"
            value={messageFontWeightDraft}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onSetMessageFontWeightDraft(nextValue);
              void onCommitMessageFontWeight(nextValue);
            }}
          />
          <div className="settings-scale-value">{messageFontWeightDraft}</div>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetMessageFontWeightDraft(MESSAGE_FONT_WEIGHT_DEFAULT);
              void onCommitMessageFontWeight(MESSAGE_FONT_WEIGHT_DEFAULT);
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">{t("settings.display.messageFontWeightHelp")}</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="code-font-size">
          {t("settings.display.codeFontSize")}
        </label>
        <div className="settings-field-row">
          <input
            id="code-font-size"
            type="range"
            min={CODE_FONT_SIZE_MIN}
            max={CODE_FONT_SIZE_MAX}
            step={1}
            className="settings-input settings-input--range"
            value={codeFontSizeDraft}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onSetCodeFontSizeDraft(nextValue);
              void onCommitCodeFontSize(nextValue);
            }}
          />
          <div className="settings-scale-value">{codeFontSizeDraft}px</div>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              onSetCodeFontSizeDraft(CODE_FONT_SIZE_DEFAULT);
              void onCommitCodeFontSize(CODE_FONT_SIZE_DEFAULT);
            }}
          >
            {t("common.reset")}
          </button>
        </div>
        <div className="settings-help">{t("settings.display.codeFontSizeHelp")}</div>
      </div>
      <div className="settings-subsection-title">{t("settings.display.sound")}</div>
      <div className="settings-subsection-subtitle">{t("settings.display.soundSubtitle")}</div>
      <SettingsToggleRow
        title={t("settings.display.codexPetTitle")}
        subtitle={t("settings.display.codexPetSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={Boolean(appSettings.codexPetEnabled)}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              codexPetEnabled: !appSettings.codexPetEnabled,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-codex-pet-panel">
        <div
          className="settings-codex-pet-options"
          role="radiogroup"
          aria-label={t("settings.display.codexPetChoice")}
        >
          {CODEX_PET_OPTIONS.map((pet) => (
            <button
              key={pet.id}
              type="button"
              role="radio"
              aria-checked={codexPetId === pet.id}
              className={`settings-codex-pet-option ${
                codexPetId === pet.id ? "is-selected" : ""
              }`}
              onClick={() =>
                updateCodexPet({
                  codexPetId: pet.id,
                  codexPetWakeVersion: Date.now(),
                })
              }
            >
              <span
                className={`settings-codex-pet-avatar settings-codex-pet-avatar--${pet.id}`}
                style={{ "--pet-tone": pet.tone } as CSSProperties}
                aria-hidden
              >
                <span />
              </span>
              <span className="settings-codex-pet-copy">
                <span className="settings-codex-pet-title">{pet.title}</span>
                <span className="settings-codex-pet-subtitle">
                  {t(`settings.display.codexPet.${pet.id}.subtitle` as any)}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={codexPetId === "custom"}
            className={`settings-codex-pet-option ${
              codexPetId === "custom" ? "is-selected" : ""
            }`}
            onClick={() =>
              customPetAvailable
                ? updateCodexPet({
                    codexPetId: "custom",
                    codexPetWakeVersion: Date.now(),
                  })
                : void importCodexPet()
            }
          >
            <span
              className="settings-codex-pet-avatar settings-codex-pet-avatar--custom"
              aria-hidden
            >
              <span />
            </span>
            <span className="settings-codex-pet-copy">
              <span className="settings-codex-pet-title">
                {t("settings.display.importPet")}
              </span>
              <span className="settings-codex-pet-subtitle">
                {customPetAvailable
                  ? t("settings.display.useCustomImage")
                  : t("settings.display.petFormats")}
              </span>
            </span>
          </button>
        </div>
        {appSettings.codexPetCustomImagePath && (
          <div className="settings-help settings-codex-pet-path">
            {t("settings.display.importedPetPath").replace(
              "{path}",
              appSettings.codexPetCustomImagePath,
            )}
          </div>
        )}
        <div className="settings-sound-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
          onClick={wakeCodexPet}
          >
            {t("settings.display.wakePet")}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
          onClick={refreshCodexPet}
          >
            {t("common.refresh")}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
          onClick={() => void importCodexPet()}
          >
            {t("settings.display.importPetAction")}
          </button>
        </div>
      </div>
      <SettingsToggleRow
        title={t("settings.display.notificationSoundsTitle")}
        subtitle={t("settings.display.notificationSoundsSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.notificationSoundsEnabled}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              notificationSoundsEnabled: !appSettings.notificationSoundsEnabled,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.display.systemNotificationsTitle")}
        subtitle={
          appSettings.codexPetEnabled
            ? t("settings.display.systemNotificationsPetEnabled")
            : t("settings.display.systemNotificationsSubtitle")
        }
      >
        <SettingsToggleSwitch
          pressed={appSettings.systemNotificationsEnabled}
          disabled={Boolean(appSettings.codexPetEnabled)}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              systemNotificationsEnabled: !appSettings.systemNotificationsEnabled,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("settings.display.subagentNotificationsTitle")}
        subtitle={
          appSettings.codexPetEnabled
            ? t("settings.display.subagentNotificationsPetEnabled")
            : t("settings.display.subagentNotificationsSubtitle")
        }
      >
        <SettingsToggleSwitch
          pressed={appSettings.subagentSystemNotificationsEnabled}
          disabled={Boolean(appSettings.codexPetEnabled)}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              subagentSystemNotificationsEnabled:
                !appSettings.subagentSystemNotificationsEnabled,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-sound-actions">
        <button
          type="button"
          className="ghost settings-button-compact"
        onClick={onTestNotificationSound}
        >
          {t("settings.display.testSound")}
        </button>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={onTestSystemNotification}
        disabled={Boolean(appSettings.codexPetEnabled)}
        >
          {t("settings.display.testNotification")}
        </button>
      </div>
    </SettingsSection>
  );
}

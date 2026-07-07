import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
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

const THEME_ACCENT_OPTIONS: Array<{
  value: AppSettings["themeAccent"];
  label: string;
  swatch: string;
}> = [
  {
    value: "codex",
    label: "Codex",
    swatch: "linear-gradient(135deg, #c49aff, #64c8ff)",
  },
  {
    value: "blue",
    label: "蓝",
    swatch: "linear-gradient(135deg, #8ebaff, #5ca8ff)",
  },
  {
    value: "green",
    label: "绿",
    swatch: "linear-gradient(135deg, #80e0be, #5cd2a6)",
  },
  {
    value: "pink",
    label: "粉",
    swatch: "linear-gradient(135deg, #ff9ad5, #eb7ebe)",
  },
  {
    value: "orange",
    label: "橙",
    swatch: "linear-gradient(135deg, #ffb269, #f5a65c)",
  },
];

const STYLE_PRESETS: Array<{
  id: string;
  title: string;
  subtitle: string;
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
    title: "原生纯白",
    subtitle: "纯白背景，橙色点缀",
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
    title: "原生亮色",
    subtitle: "暖白护眼，橙色强调",
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
    title: "原生暗色",
    subtitle: "深底浅字，低刺激",
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
    title: "CLI 暗黑",
    subtitle: "黑橙终端感",
    swatch: "linear-gradient(135deg, #070604 0%, #15100b 55%, #ff9f43 100%)",
    settings: {
      theme: "dark",
      themeAccent: "orange",
      messageReadingStyle: "cli",
      messageCanvasColor: "#070604",
      messageUserBubbleColor: "#3a210c",
      messageUserTextColor: "#fff3df",
      messageAssistantBubbleColor: "#0a0805",
      messageAssistantAccentColor: "#ff9f43",
      messageAssistantTextColor: "#f6e7cf",
    },
  },
];

const FONT_CLARITY_PRESETS: Array<{
  id: string;
  title: string;
  subtitle: string;
  uiLatinFontFamily: string;
  uiCjkFontFamily: string;
  uiFontWeight: number;
  messageFontWeight: number;
}> = [
  {
    id: "standard",
    title: "标准",
    subtitle: "默认字体和字重",
    uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
    uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
    uiFontWeight: UI_FONT_WEIGHT_DEFAULT,
    messageFontWeight: MESSAGE_FONT_WEIGHT_DEFAULT,
  },
  {
    id: "windows-clear",
    title: "Windows 清晰",
    subtitle: "雅黑 UI + 500 字重",
    uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
    uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
    uiFontWeight: 500,
    messageFontWeight: 500,
  },
  {
    id: "bold-reading",
    title: "加粗阅读",
    subtitle: "长对话更醒目",
    uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
    uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
    uiFontWeight: 550,
    messageFontWeight: 550,
  },
  {
    id: "light",
    title: "细字轻量",
    subtitle: "接近原始轻字重",
    uiLatinFontFamily: DEFAULT_UI_LATIN_FONT_FAMILY,
    uiCjkFontFamily: DEFAULT_UI_CJK_FONT_FAMILY,
    uiFontWeight: 400,
    messageFontWeight: 450,
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
      title="显示与声音"
      subtitle="调整视觉效果和声音提醒。"
    >
      <div className="settings-subsection-title">显示</div>
      <div className="settings-subsection-subtitle">
        调整窗口背景和效果的渲染方式。
      </div>
      <div className="settings-field">
        <div className="settings-field-label">风格方案</div>
        <div className="settings-style-presets" role="radiogroup" aria-label="风格方案">
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
                <span className="settings-style-preset-title">{preset.title}</span>
                <span className="settings-style-preset-subtitle">
                  {preset.subtitle}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="settings-help">
          风格方案会同时切换主题、配色和会话消息显示模式。
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="theme-select">
          主题
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
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="dim">暗色</option>
        </select>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">配色</div>
        <div className="settings-accent-options" role="radiogroup" aria-label="配色">
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
              <span className="settings-accent-label">{option.label}</span>
            </button>
          ))}
        </div>
        <div className="settings-help">
          配色只影响链接、选中态、用户消息和强调边框；明暗由主题控制。
        </div>
      </div>
      <SettingsToggleRow
        title="显示 Codex 剩余额度"
        subtitle="显示剩余量，而不是已使用量。"
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
        title="在消息中显示文件路径"
        subtitle="在消息里的文件链接旁显示父级路径。"
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
        title="默认折叠工具调用"
        subtitle="新打开会话时收起工具调用组，只保留文字内容优先可读。"
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
        title="聊天和 Diff 分栏显示"
        subtitle="并排显示聊天和 Diff，而不是互相切换。"
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
        title="自动生成新会话标题"
        subtitle="根据第一条消息生成短标题（会额外消耗 token）。"
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
      <div className="settings-subsection-title">聊天</div>
      <div className="settings-subsection-subtitle">
        控制每个会话保留多少上下文历史。
      </div>
      <SettingsToggleRow
        title="无限聊天历史"
        subtitle="在内存中保留完整会话历史（可能影响性能）。"
      >
        <SettingsToggleSwitch
          pressed={scrollbackUnlimited}
          onClick={toggleUnlimitedScrollback}
          data-scrollback-control="true"
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="chat-scrollback-preset">
          历史保留预设
        </label>
        <select
          id="chat-scrollback-preset"
          className="settings-select"
          value={scrollbackPresetValue}
          onChange={(event) => selectScrollbackPreset(event.target.value)}
          data-scrollback-control="true"
          disabled={scrollbackUnlimited}
        >
          <option value="custom">自定义</option>
          {CHAT_SCROLLBACK_PRESETS.map((value) => (
            <option key={value} value={value}>
              {value === CHAT_SCROLLBACK_DEFAULT ? `${value}（默认）` : value}
            </option>
          ))}
        </select>
        <div className="settings-help">
          数值越大保留的历史越多，但可能增加内存占用。可在会话中使用“从服务器同步”重新拉取旧消息。
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="chat-scrollback-items">
          每个会话最多条目数
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
            重置
          </button>
        </div>
        <div className="settings-help">
          范围：{CHAT_SCROLLBACK_MIN}–{CHAT_SCROLLBACK_MAX}。统计消息、工具调用和其他会话条目。
        </div>
      </div>
      <SettingsToggleRow
        title="降低透明度"
        subtitle="使用纯色界面，替代玻璃效果。"
      >
        <SettingsToggleSwitch
          pressed={reduceTransparency}
          onClick={() => onToggleTransparency(!reduceTransparency)}
        />
      </SettingsToggleRow>
      <div className="settings-toggle-row settings-scale-row">
        <div>
          <div className="settings-toggle-title">界面缩放</div>
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
            aria-label="界面缩放"
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
            重置
          </button>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">字体清晰度</div>
        <div className="settings-clarity-options" role="radiogroup" aria-label="字体清晰度">
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
              <span className="settings-clarity-title">{preset.title}</span>
              <span className="settings-clarity-subtitle">{preset.subtitle}</span>
            </button>
          ))}
        </div>
        <div className="settings-help">
          Windows 字体发虚或偏细时，优先选 Windows 清晰；再按需要微调下面的字重。
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">
          界面英文字体
        </div>
        <RoundedSelect
          ariaLabel="界面英文字体"
          className="settings-select settings-font-select"
          popoverClassName="settings-font-select-popover"
          value={
            uiLatinFontOptions.some((preset) => preset.value === uiLatinFontDraft)
              ? uiLatinFontDraft
              : "custom"
          }
          options={[...uiLatinFontOptions, { label: "自定义", value: "custom" }]}
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
            aria-label="自定义界面英文字体"
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
            重置
          </button>
        </div>
        <div className="settings-help">
          优先用于英文、数字和符号。Windows 推荐 Segoe UI 或 Inter。
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">
          界面中文字体
        </div>
        <RoundedSelect
          ariaLabel="界面中文字体"
          className="settings-select settings-font-select"
          popoverClassName="settings-font-select-popover"
          value={
            uiCjkFontOptions.some((preset) => preset.value === uiCjkFontDraft)
              ? uiCjkFontDraft
              : "custom"
          }
          options={[...uiCjkFontOptions, { label: "自定义", value: "custom" }]}
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
            aria-label="自定义界面中文字体"
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
            重置
          </button>
        </div>
        <div className="settings-help">
          优先用于中文。Windows 推荐 Microsoft YaHei UI。
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="ui-font-size">
          界面字号
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
            重置
          </button>
        </div>
        <div className="settings-help">调整侧边栏、按钮、设置等界面文字。</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="ui-font-weight">
          界面字重
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
            重置
          </button>
        </div>
        <div className="settings-help">Windows 字体偏细时可调到 450 或 500。</div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">
          代码字体
        </div>
        <RoundedSelect
          ariaLabel="代码字体"
          className="settings-select settings-font-select"
          popoverClassName="settings-font-select-popover"
          value={
            codeFontOptions.some((preset) => preset.value === codeFontDraft)
              ? codeFontDraft
              : "custom"
          }
          options={[...codeFontOptions, { label: "自定义", value: "custom" }]}
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
            aria-label="自定义代码字体"
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
            重置
          </button>
        </div>
        <div className="settings-help">应用于 Git Diff 和其他等宽文本。</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="message-font-size">
          消息字号
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
            重置
          </button>
        </div>
        <div className="settings-help">调整聊天消息正文大小，不影响 Diff。</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="message-font-weight">
          消息字重
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
            重置
          </button>
        </div>
        <div className="settings-help">只影响聊天消息正文。</div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="code-font-size">
          代码字号
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
            重置
          </button>
        </div>
        <div className="settings-help">调整代码和 Diff 文本大小。</div>
      </div>
      <div className="settings-subsection-title">声音</div>
      <div className="settings-subsection-subtitle">控制通知声音提醒。</div>
      <SettingsToggleRow
        title="Codex 宠物"
        subtitle="启用后由宠物接管提醒，系统通知会自动静音。"
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
      <SettingsToggleRow
        title="通知声音"
        subtitle="窗口未聚焦时，长时间运行的 agent 完成后播放提示音。"
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
        title="系统通知"
        subtitle={
          appSettings.codexPetEnabled
            ? "Codex 宠物启用中，系统通知已自动静音。"
            : "窗口未聚焦时，长时间运行的 agent 完成后显示系统通知。"
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
        title="子 agent 通知"
        subtitle={
          appSettings.codexPetEnabled
            ? "Codex 宠物启用中，子 agent 系统通知也会静音。"
            : "系统通知中包含派生的子 agent 会话。"
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
          测试声音
        </button>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={onTestSystemNotification}
          disabled={Boolean(appSettings.codexPetEnabled)}
        >
          测试通知
        </button>
      </div>
    </SettingsSection>
  );
}

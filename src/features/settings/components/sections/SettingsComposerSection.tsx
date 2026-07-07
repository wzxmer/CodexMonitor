import type { AppSettings } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type ComposerPreset = AppSettings["composerEditorPreset"];

type SettingsComposerSectionProps = {
  appSettings: AppSettings;
  optionKeyLabel: string;
  composerPresetLabels: Record<ComposerPreset, string>;
  onComposerPresetChange: (preset: ComposerPreset) => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsComposerSection({
  appSettings,
  optionKeyLabel,
  composerPresetLabels,
  onComposerPresetChange,
  onUpdateAppSettings,
}: SettingsComposerSectionProps) {
  return (
    <SettingsSection
      title="输入框"
      subtitle="控制消息编辑器里的辅助功能和格式化行为。"
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-send-shortcut">
          发送快捷键
        </label>
        <select
          id="composer-send-shortcut"
          className="settings-select"
          value={
            appSettings.composerSendShortcut === "enter-and-ctrl-enter"
              ? "enter"
              : appSettings.composerSendShortcut
          }
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              composerSendShortcut: event.target.value as AppSettings["composerSendShortcut"],
            })
          }
        >
          <option value="ctrl-enter">Enter 换行，Ctrl+Enter 发送</option>
          <option value="enter">Enter 发送，Ctrl+Enter 换行</option>
        </select>
        <div className="settings-help">
          Shift+Ctrl+Enter 用于引导当前运行。
        </div>
        <SettingsToggleRow
          title="处理中显示追问提示"
          subtitle="在输入框上方显示排队/Steer 快捷键提示。"
        >
          <SettingsToggleSwitch
            pressed={appSettings.composerFollowUpHintEnabled}
            onClick={() =>
              void onUpdateAppSettings({
                ...appSettings,
                composerFollowUpHintEnabled: !appSettings.composerFollowUpHintEnabled,
              })
            }
          />
        </SettingsToggleRow>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">预设</div>
      <div className="settings-subsection-subtitle">
        选择一个起点，再按需微调下面的开关。
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          预设
        </label>
        <select
          id="composer-preset"
          className="settings-select"
          value={appSettings.composerEditorPreset}
          onChange={(event) =>
            onComposerPresetChange(event.target.value as ComposerPreset)
          }
        >
          {Object.entries(composerPresetLabels).map(([preset, label]) => (
            <option key={preset} value={preset}>
              {label}
            </option>
          ))}
        </select>
        <div className="settings-help">
          预设会更新下面的开关；选择后仍可单独调整。
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">代码围栏</div>
      <SettingsToggleRow
        title="按空格展开围栏"
        subtitle="输入 ``` 后按空格会插入代码块。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnSpace}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnSpace: !appSettings.composerFenceExpandOnSpace,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="按回车展开围栏"
        subtitle="启用后，按回车可展开 ``` 行。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceExpandOnEnter}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceExpandOnEnter: !appSettings.composerFenceExpandOnEnter,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="支持语言标签"
        subtitle="允许用 ```lang + 空格插入带语言的代码块。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceLanguageTags}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceLanguageTags: !appSettings.composerFenceLanguageTags,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="用围栏包裹选区"
        subtitle="创建代码块时包裹当前选中的文本。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceWrapSelection}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceWrapSelection: !appSettings.composerFenceWrapSelection,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="复制代码块时不带围栏"
        subtitle={
          <>
            启用后复制为纯文本。按住 {optionKeyLabel} 可包含 ``` 围栏。
          </>
        }
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerCodeBlockCopyUseModifier}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerCodeBlockCopyUseModifier:
                !appSettings.composerCodeBlockCopyUseModifier,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">粘贴</div>
      <SettingsToggleRow
        title="多行粘贴自动包裹"
        subtitle="把多行粘贴内容放入代码块。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteMultiline}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteMultiline:
                !appSettings.composerFenceAutoWrapPasteMultiline,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="单行代码自动包裹"
        subtitle="粘贴较长的单行代码片段时自动包裹。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerFenceAutoWrapPasteCodeLike}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerFenceAutoWrapPasteCodeLike:
                !appSettings.composerFenceAutoWrapPasteCodeLike,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-divider" />
      <div className="settings-subsection-title">列表</div>
      <SettingsToggleRow
        title="Shift+Enter 延续列表"
        subtitle="当前行有内容时，继续编号或项目符号列表。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.composerListContinuation}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              composerListContinuation: !appSettings.composerListContinuation,
            })
          }
        />
      </SettingsToggleRow>
    </SettingsSection>
  );
}

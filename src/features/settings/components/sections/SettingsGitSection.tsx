import type { AppSettings, ModelOption } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type SettingsGitSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  models: ModelOption[];
  commitMessagePromptDraft: string;
  commitMessagePromptDirty: boolean;
  commitMessagePromptSaving: boolean;
  onSetCommitMessagePromptDraft: (value: string) => void;
  onSaveCommitMessagePrompt: () => Promise<void>;
  onResetCommitMessagePrompt: () => Promise<void>;
};

export function SettingsGitSection({
  appSettings,
  onUpdateAppSettings,
  models,
  commitMessagePromptDraft,
  commitMessagePromptDirty,
  commitMessagePromptSaving,
  onSetCommitMessagePromptDraft,
  onSaveCommitMessagePrompt,
  onResetCommitMessagePrompt,
}: SettingsGitSectionProps) {
  return (
    <SettingsSection
      title="Git"
      subtitle="管理 Git 侧栏中 diff 的加载方式。"
    >
      <SettingsToggleRow
        title="预加载 Git diff"
        subtitle="让查看 Git diff 更快。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.preloadGitDiffs}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              preloadGitDiffs: !appSettings.preloadGitDiffs,
            })
          }
        />
      </SettingsToggleRow>
      <SettingsToggleRow
        title="忽略空白字符变化"
        subtitle="在本地 diff 和提交 diff 中隐藏仅空白字符的变化。"
      >
        <SettingsToggleSwitch
          pressed={appSettings.gitDiffIgnoreWhitespaceChanges}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              gitDiffIgnoreWhitespaceChanges: !appSettings.gitDiffIgnoreWhitespaceChanges,
            })
          }
        />
      </SettingsToggleRow>
      <div className="settings-field">
        <div className="settings-field-label">提交信息提示词</div>
        <div className="settings-help">
          生成提交信息时使用。包含 <code>{"{diff}"}</code> 可插入 Git diff。
        </div>
        <textarea
          className="settings-agents-textarea"
          value={commitMessagePromptDraft}
          onChange={(event) => onSetCommitMessagePromptDraft(event.target.value)}
          spellCheck={false}
          disabled={commitMessagePromptSaving}
        />
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onResetCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            重置
          </button>
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void onSaveCommitMessagePrompt();
            }}
            disabled={commitMessagePromptSaving || !commitMessagePromptDirty}
          >
            {commitMessagePromptSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
      {models.length > 0 && (
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="commit-message-model-select">
            提交信息模型
          </label>
          <div className="settings-help">
            生成提交信息时使用的模型。保持默认则使用项目模型。
          </div>
          <select
            id="commit-message-model-select"
            className="settings-select"
            value={appSettings.commitMessageModelId ?? ""}
            onChange={(event) => {
              const value = event.target.value || null;
              void onUpdateAppSettings({
                ...appSettings,
                commitMessageModelId: value,
              });
            }}
          >
            <option value="">默认</option>
            {models.map((model) => (
              <option key={model.id} value={model.model}>
                {model.displayName?.trim() || model.model}
              </option>
            ))}
          </select>
        </div>
      )}
    </SettingsSection>
  );
}

import type { AppSettings } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";

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
  const { t } = useI18n();
  return (
    <SettingsSection
      title={t("settings.composer.title")}
      subtitle={t("settings.composer.subtitle")}
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-send-shortcut">
          {t("settings.composer.sendShortcut")}
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
          <option value="ctrl-enter">{t("settings.composer.shortcutCtrlEnter")}</option>
          <option value="enter">{t("settings.composer.shortcutEnter")}</option>
        </select>
        <div className="settings-help">
          {t("settings.composer.steerShortcutHelp")}
        </div>
        <SettingsToggleRow
          title={t("settings.composer.followUpHintTitle")}
          subtitle={t("settings.composer.followUpHintSubtitle")}
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
      <div className="settings-subsection-title">{t("settings.composer.presets")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.composer.presetsSubtitle")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="composer-preset">
          {t("settings.composer.preset")}
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
          {t("settings.composer.presetHelp")}
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-subsection-title">{t("settings.composer.codeFences")}</div>
      <SettingsToggleRow
        title={t("settings.composer.expandOnSpaceTitle")}
        subtitle={t("settings.composer.expandOnSpaceSubtitle")}
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
        title={t("settings.composer.expandOnEnterTitle")}
        subtitle={t("settings.composer.expandOnEnterSubtitle")}
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
        title={t("settings.composer.languageTagsTitle")}
        subtitle={t("settings.composer.languageTagsSubtitle")}
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
        title={t("settings.composer.wrapSelectionTitle")}
        subtitle={t("settings.composer.wrapSelectionSubtitle")}
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
        title={t("settings.composer.copyWithoutFenceTitle")}
        subtitle={
          <>
            {t("settings.composer.copyWithoutFencePrefix")} {optionKeyLabel}{" "}
            {t("settings.composer.copyWithoutFenceSuffix")}
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
      <div className="settings-subsection-title">{t("settings.composer.paste")}</div>
      <SettingsToggleRow
        title={t("settings.composer.wrapMultilinePasteTitle")}
        subtitle={t("settings.composer.wrapMultilinePasteSubtitle")}
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
        title={t("settings.composer.wrapCodePasteTitle")}
        subtitle={t("settings.composer.wrapCodePasteSubtitle")}
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
      <div className="settings-subsection-title">{t("settings.composer.lists")}</div>
      <SettingsToggleRow
        title={t("settings.composer.listContinuationTitle")}
        subtitle={t("settings.composer.listContinuationSubtitle")}
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

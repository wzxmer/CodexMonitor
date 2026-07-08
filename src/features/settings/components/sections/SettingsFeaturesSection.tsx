import type { CodexFeature } from "@/types";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";
import type { ResolvedAppLanguage } from "@/features/i18n/appLanguage";
import type { I18nKey } from "@/features/i18n/strings";
import type { SettingsFeaturesSectionProps } from "@settings/hooks/useSettingsFeaturesSection";
import { fileManagerName, openInFileManagerLabel } from "@utils/platformPaths";

const FEATURE_NAMES = [
  "undo",
  "shell_tool",
  "unified_exec",
  "background_terminal",
  "shell_snapshot",
  "js_repl",
  "js_repl_tools_only",
  "web_search_request",
  "web_search_cached",
  "search_tool",
  "runtime_metrics",
  "sqlite",
  "memory_tool",
  "child_agents_md",
  "apply_patch_freeform",
  "use_linux_sandbox_bwrap",
  "request_rule",
  "experimental_windows_sandbox",
  "elevated_windows_sandbox",
  "remote_models",
  "powershell_utf8",
  "enable_request_compression",
  "apps",
  "apps_mcp_gateway",
  "skill_mcp_dependency_install",
  "skill_env_var_dependency_prompt",
  "steer",
  "collaboration_modes",
  "personality",
  "responses_websockets",
  "responses_websockets_v2",
] as const;

const KNOWN_FEATURES = new Set<string>(FEATURE_NAMES);

function formatUnknownFeatureLabel(
  featureName: string,
  language: ResolvedAppLanguage,
  t: (key: I18nKey) => string,
): string {
  const normalized = featureName
    .split("_")
    .filter((part) => part.length > 0)
    .join(" / ");
  if (language === "en") {
    return normalized
      ? normalized.replace(/\b\w/g, (char) => char.toUpperCase())
      : t("features.unknownFeature");
  }
  return normalized
    ? t("features.featureKey").replace("{key}", normalized)
    : t("features.unknownFeature");
}

function formatFeatureLabel(
  feature: CodexFeature,
  language: ResolvedAppLanguage,
  t: (key: I18nKey) => string,
): string {
  if (KNOWN_FEATURES.has(feature.name)) {
    return t(`features.label.${feature.name}` as I18nKey);
  }
  const displayName = feature.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  return formatUnknownFeatureLabel(feature.name, language, t);
}

function featureSubtitle(
  feature: CodexFeature,
  t: (key: I18nKey) => string,
): string {
  if (KNOWN_FEATURES.has(feature.name)) {
    return t(`features.description.${feature.name}` as I18nKey);
  }
  const description = feature.description?.trim();
  if (description) {
    return description;
  }
  if (feature.stage === "deprecated") {
    return t("features.deprecatedFallback");
  }
  if (feature.stage === "removed") {
    return t("features.removedFallback");
  }
  return t("features.featureKey").replace("{key}", `features.${feature.name}`);
}

export function SettingsFeaturesSection({
  appSettings,
  hasFeatureWorkspace,
  openConfigError,
  featureError,
  featuresLoading,
  featureUpdatingKey,
  stableFeatures,
  experimentalFeatures,
  hasDynamicFeatureRows,
  onOpenConfig,
  onToggleCodexFeature,
  onUpdateAppSettings,
}: SettingsFeaturesSectionProps) {
  const { language, t } = useI18n();
  return (
    <SettingsSection
      title={t("features.title")}
      subtitle={t("features.subtitle")}
    >
      <SettingsToggleRow
        title={t("features.configFile")}
        subtitle={`${t("features.configSubtitlePrefix")}${fileManagerName()}${t(
          "features.configSubtitleSuffix",
        )}`}
      >
        <button type="button" className="ghost" onClick={onOpenConfig}>
          {openInFileManagerLabel()}
        </button>
      </SettingsToggleRow>
      {openConfigError && <div className="settings-help">{openConfigError}</div>}
      <SettingsSubsection
        title={t("features.stable")}
        subtitle={t("features.stableSubtitle")}
      />
      <SettingsToggleRow
        title={t("features.personality")}
        subtitle={
          <>
            {t("features.personalitySubtitle")}
          </>
        }
      >
        <select
          id="features-personality-select"
          className="settings-select"
          value={appSettings.personality}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              personality: event.target.value as (typeof appSettings)["personality"],
            })
          }
          aria-label={t("features.personality")}
        >
          <option value="friendly">{t("features.friendly")}</option>
          <option value="pragmatic">{t("features.pragmatic")}</option>
        </select>
      </SettingsToggleRow>
      <SettingsToggleRow
        title={t("features.pauseQueueTitle")}
        subtitle={t("features.pauseQueueSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={appSettings.pauseQueuedMessagesWhenResponseRequired}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              pauseQueuedMessagesWhenResponseRequired:
                !appSettings.pauseQueuedMessagesWhenResponseRequired,
            })
          }
        />
      </SettingsToggleRow>
      {stableFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature, language, t)}
          subtitle={featureSubtitle(feature, t)}
        >
          <SettingsToggleSwitch
            pressed={feature.enabled}
            onClick={() => onToggleCodexFeature(feature)}
            disabled={featureUpdatingKey === feature.name}
          />
        </SettingsToggleRow>
      ))}
      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        stableFeatures.length === 0 && (
        <div className="settings-help">{t("features.noStable")}</div>
      )}
      <SettingsSubsection
        title={t("features.experimental")}
        subtitle={t("features.experimentalSubtitle")}
      />
      {experimentalFeatures.map((feature) => (
        <SettingsToggleRow
          key={feature.name}
          title={formatFeatureLabel(feature, language, t)}
          subtitle={featureSubtitle(feature, t)}
        >
          <SettingsToggleSwitch
            pressed={feature.enabled}
            onClick={() => onToggleCodexFeature(feature)}
            disabled={featureUpdatingKey === feature.name}
          />
        </SettingsToggleRow>
      ))}
      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        hasDynamicFeatureRows &&
        experimentalFeatures.length === 0 && (
          <div className="settings-help">
            {t("features.noExperimental")}
          </div>
        )}
      {featuresLoading && (
        <div className="settings-help">{t("features.loading")}</div>
      )}
      {!hasFeatureWorkspace && !featuresLoading && (
        <div className="settings-help">
          {t("features.connectFirst")}
        </div>
      )}
      {featureError && <div className="settings-help">{featureError}</div>}
    </SettingsSection>
  );
}

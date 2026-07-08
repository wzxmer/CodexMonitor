import type { CodexFeature } from "@/types";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";
import type { ResolvedAppLanguage } from "@/features/i18n/appLanguage";
import type { SettingsFeaturesSectionProps } from "@settings/hooks/useSettingsFeaturesSection";
import { fileManagerName, openInFileManagerLabel } from "@utils/platformPaths";

const FEATURE_LABELS: Record<string, string> = {
  undo: "回合快照",
  shell_tool: "Shell 工具",
  unified_exec: "统一执行工具",
  background_terminal: "后台终端",
  shell_snapshot: "Shell 快照",
  js_repl: "JavaScript REPL",
  js_repl_tools_only: "仅暴露 REPL 工具",
  web_search_request: "旧版网页搜索请求",
  web_search_cached: "旧版网页搜索缓存",
  search_tool: "旧版搜索工具",
  runtime_metrics: "运行指标",
  sqlite: "本地 SQLite 存储",
  memory_tool: "记忆工具",
  child_agents_md: "附加 AGENTS.md",
  apply_patch_freeform: "自由格式补丁",
  use_linux_sandbox_bwrap: "Linux 沙盒",
  request_rule: "请求审批规则",
  experimental_windows_sandbox: "旧版 Windows 沙盒",
  elevated_windows_sandbox: "旧版提权 Windows 沙盒",
  remote_models: "远端模型刷新",
  powershell_utf8: "PowerShell UTF-8",
  enable_request_compression: "请求压缩",
  apps: "ChatGPT Apps",
  apps_mcp_gateway: "Apps MCP 网关",
  skill_mcp_dependency_install: "Skill MCP 依赖安装",
  skill_env_var_dependency_prompt: "Skill 环境变量提示",
  steer: "运行中追加指令",
  collaboration_modes: "协作模式",
  personality: "个性",
  responses_websockets: "Responses WebSocket",
  responses_websockets_v2: "Responses WebSocket v2",
};

const FEATURE_DESCRIPTION_FALLBACKS: Record<string, string> = {
  undo: "每个回合创建可回退快照。",
  shell_tool: "启用默认 Shell 工具。",
  unified_exec: "使用单一 PTY 执行工具。",
  background_terminal: "允许长时间运行的终端命令在后台继续执行。",
  shell_snapshot: "启用 Shell 状态快照。",
  js_repl: "启用基于持久 Node 内核的 JavaScript REPL 工具。",
  js_repl_tools_only: "只把 js_repl 工具直接暴露给模型。",
  web_search_request: "已弃用。请使用顶层 web_search。",
  web_search_cached: "已弃用。请使用顶层 web_search。",
  search_tool: "已移除的旧搜索开关，仅用于兼容旧配置。",
  runtime_metrics: "允许手动读取运行指标快照。",
  sqlite: "把 rollout 元数据保存到本地 SQLite 数据库。",
  memory_tool: "启用启动记忆提取和记忆整理。",
  child_agents_md: "把额外 AGENTS.md 指引追加到用户指令。",
  apply_patch_freeform: "启用自由格式 apply_patch 工具。",
  use_linux_sandbox_bwrap: "使用基于 bubblewrap 的 Linux 沙盒流程。",
  request_rule: "允许请求审批和执行规则建议。",
  experimental_windows_sandbox: "已移除的 Windows 沙盒开关，仅用于兼容旧配置。",
  elevated_windows_sandbox: "已移除的提权 Windows 沙盒开关，仅用于兼容旧配置。",
  remote_models: "AppReady 前刷新远端模型列表。",
  powershell_utf8: "强制 PowerShell 使用 UTF-8 输出。",
  enable_request_compression: "压缩发送给 codex-backend 的流式请求体。",
  apps: "启用 ChatGPT Apps 集成。",
  apps_mcp_gateway: "通过配置的网关转发 Apps MCP 调用。",
  skill_mcp_dependency_install: "允许提示并安装缺失的 MCP 依赖。",
  skill_env_var_dependency_prompt: "缺少 Skill 环境变量依赖时给出提示。",
  steer: "Codex 支持时启用运行中追加指令。",
  collaboration_modes: "启用协作模式预设。",
  personality: "启用个性选择。",
  responses_websockets: "默认使用 Responses API WebSocket 传输。",
  responses_websockets_v2: "启用 Responses API WebSocket v2 模式。",
};

function formatUnknownFeatureLabel(
  featureName: string,
  language: ResolvedAppLanguage,
): string {
  const normalized = featureName
    .split("_")
    .filter((part) => part.length > 0)
    .join(" / ");
  if (language === "en") {
    return normalized
      ? normalized.replace(/\b\w/g, (char) => char.toUpperCase())
      : "Unknown feature";
  }
  return normalized ? `功能键：${normalized}` : "未知功能";
}

function formatFeatureLabel(
  feature: CodexFeature,
  language: ResolvedAppLanguage,
): string {
  const localized = language === "zh" ? FEATURE_LABELS[feature.name] : null;
  if (localized) {
    return localized;
  }
  const displayName = feature.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  return formatUnknownFeatureLabel(feature.name, language);
}

function featureSubtitle(
  feature: CodexFeature,
  language: ResolvedAppLanguage,
): string {
  const fallbackDescription =
    language === "zh" ? FEATURE_DESCRIPTION_FALLBACKS[feature.name] : null;
  if (fallbackDescription) {
    return fallbackDescription;
  }
  const description = feature.description?.trim();
  if (description) {
    return description;
  }
  if (feature.stage === "deprecated") {
    return language === "en"
      ? "Deprecated feature toggle."
      : "已弃用的功能开关。";
  }
  if (feature.stage === "removed") {
    return language === "en"
      ? "Legacy feature toggle retained for backward compatibility."
      : "保留用于向后兼容的旧功能开关。";
  }
  return language === "en"
    ? `Feature key: features.${feature.name}`
    : `功能键：features.${feature.name}`;
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
          title={formatFeatureLabel(feature, language)}
          subtitle={featureSubtitle(feature, language)}
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
          title={formatFeatureLabel(feature, language)}
          subtitle={featureSubtitle(feature, language)}
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

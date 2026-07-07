import { useEffect, useMemo, useRef } from "react";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  CodexDoctorResult,
  CodexStatus,
  CodexUpdateResult,
  ModelOption,
} from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { FileEditorCard } from "@/features/shared/components/FileEditorCard";

type SettingsCodexSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  defaultModels: ModelOption[];
  defaultModelsLoading: boolean;
  defaultModelsError: string | null;
  defaultModelsConnectedWorkspaceCount: number;
  onRefreshDefaultModels: () => void;
  codexPathDraft: string;
  codexArgsDraft: string;
  codexDirty: boolean;
  isSavingSettings: boolean;
  doctorState: {
    status: "idle" | "running" | "done";
    result: CodexDoctorResult | null;
  };
  codexUpdateState: {
    status: "idle" | "running" | "done";
    result: CodexUpdateResult | null;
  };
  codexStatusState: {
    status: "idle" | "loading" | "done";
    result: CodexStatus | null;
    error: string | null;
  };
  mcpStatusState: {
    status: "idle" | "loading" | "done";
    result: unknown | null;
    error: string | null;
    workspaceName: string | null;
  };
  globalAgentsMeta: string;
  globalAgentsError: string | null;
  globalAgentsContent: string;
  globalAgentsLoading: boolean;
  globalAgentsRefreshDisabled: boolean;
  globalAgentsSaveDisabled: boolean;
  globalAgentsSaveLabel: string;
  globalConfigMeta: string;
  globalConfigError: string | null;
  globalConfigContent: string;
  globalConfigLoading: boolean;
  globalConfigRefreshDisabled: boolean;
  globalConfigSaveDisabled: boolean;
  globalConfigSaveLabel: string;
  onSetCodexPathDraft: Dispatch<SetStateAction<string>>;
  onSetCodexArgsDraft: Dispatch<SetStateAction<string>>;
  onSetGlobalAgentsContent: (value: string) => void;
  onSetGlobalConfigContent: (value: string) => void;
  onBrowseCodex: () => Promise<void>;
  onSaveCodexSettings: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onRunCodexUpdate: () => Promise<void>;
  onRefreshCodexStatus: () => void;
  onRefreshMcpStatus: () => void;
  onRefreshGlobalAgents: () => void;
  onSaveGlobalAgents: () => void;
  onRefreshGlobalConfig: () => void;
  onSaveGlobalConfig: () => void;
};

const DEFAULT_REASONING_EFFORT = "medium";

const normalizeEffortValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

function coerceSavedModelSlug(value: string | null, models: ModelOption[]): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const bySlug = models.find((model) => model.model === trimmed);
  if (bySlug) {
    return bySlug.model;
  }
  const byId = models.find((model) => model.id === trimmed);
  return byId ? byId.model : null;
}

const getReasoningSupport = (model: ModelOption | null): boolean => {
  if (!model) {
    return false;
  }
  return model.supportedReasoningEfforts.length > 0 || model.defaultReasoningEffort !== null;
};

const getReasoningOptions = (model: ModelOption | null): string[] => {
  if (!model) {
    return [];
  }
  const supported = model.supportedReasoningEfforts
    .map((effort) => normalizeEffortValue(effort.reasoningEffort))
    .filter((effort): effort is string => Boolean(effort));
  if (supported.length > 0) {
    return Array.from(new Set(supported));
  }
  const fallback = normalizeEffortValue(model.defaultReasoningEffort);
  return fallback ? [fallback] : [];
};

export function SettingsCodexSection({
  appSettings,
  onUpdateAppSettings,
  defaultModels,
  defaultModelsLoading,
  defaultModelsError,
  defaultModelsConnectedWorkspaceCount,
  onRefreshDefaultModels,
  codexPathDraft,
  codexArgsDraft,
  codexDirty,
  isSavingSettings,
  doctorState,
  codexUpdateState,
  codexStatusState,
  mcpStatusState,
  globalAgentsMeta,
  globalAgentsError,
  globalAgentsContent,
  globalAgentsLoading,
  globalAgentsRefreshDisabled,
  globalAgentsSaveDisabled,
  globalAgentsSaveLabel,
  globalConfigMeta,
  globalConfigError,
  globalConfigContent,
  globalConfigLoading,
  globalConfigRefreshDisabled,
  globalConfigSaveDisabled,
  globalConfigSaveLabel,
  onSetCodexPathDraft,
  onSetCodexArgsDraft,
  onSetGlobalAgentsContent,
  onSetGlobalConfigContent,
  onBrowseCodex,
  onSaveCodexSettings,
  onRunDoctor,
  onRunCodexUpdate,
  onRefreshCodexStatus,
  onRefreshMcpStatus,
  onRefreshGlobalAgents,
  onSaveGlobalAgents,
  onRefreshGlobalConfig,
  onSaveGlobalConfig,
}: SettingsCodexSectionProps) {
  const latestModelSlug = defaultModels[0]?.model ?? null;
  const savedModelSlug = useMemo(
    () => coerceSavedModelSlug(appSettings.lastComposerModelId, defaultModels),
    [appSettings.lastComposerModelId, defaultModels],
  );
  const selectedModelSlug = savedModelSlug ?? latestModelSlug ?? "";
  const selectedModel = useMemo(
    () => defaultModels.find((model) => model.model === selectedModelSlug) ?? null,
    [defaultModels, selectedModelSlug],
  );
  const reasoningSupported = useMemo(
    () => getReasoningSupport(selectedModel),
    [selectedModel],
  );
  const reasoningOptions = useMemo(
    () => getReasoningOptions(selectedModel),
    [selectedModel],
  );
  const savedEffort = useMemo(
    () => normalizeEffortValue(appSettings.lastComposerReasoningEffort),
    [appSettings.lastComposerReasoningEffort],
  );
  const selectedEffort = useMemo(() => {
    if (!reasoningSupported) {
      return "";
    }
    if (savedEffort && reasoningOptions.includes(savedEffort)) {
      return savedEffort;
    }
    if (reasoningOptions.includes(DEFAULT_REASONING_EFFORT)) {
      return DEFAULT_REASONING_EFFORT;
    }
    const fallback = normalizeEffortValue(selectedModel?.defaultReasoningEffort);
    if (fallback && reasoningOptions.includes(fallback)) {
      return fallback;
    }
    return reasoningOptions[0] ?? "";
  }, [reasoningOptions, reasoningSupported, savedEffort, selectedModel]);

  const didNormalizeDefaultsRef = useRef(false);
  useEffect(() => {
    if (didNormalizeDefaultsRef.current) {
      return;
    }
    if (!defaultModels.length) {
      return;
    }
    const savedRawModel = (appSettings.lastComposerModelId ?? "").trim();
    const savedRawEffort = (appSettings.lastComposerReasoningEffort ?? "").trim();
    const shouldNormalizeModel = savedRawModel.length === 0 || savedModelSlug === null;
    const shouldNormalizeEffort =
      reasoningSupported &&
      (savedRawEffort.length === 0 ||
        savedEffort === null ||
        !reasoningOptions.includes(savedEffort));
    if (!shouldNormalizeModel && !shouldNormalizeEffort) {
      didNormalizeDefaultsRef.current = true;
      return;
    }

    const next: AppSettings = {
      ...appSettings,
      lastComposerModelId: shouldNormalizeModel ? selectedModelSlug : appSettings.lastComposerModelId,
      lastComposerReasoningEffort: shouldNormalizeEffort
        ? selectedEffort
        : appSettings.lastComposerReasoningEffort,
    };
    didNormalizeDefaultsRef.current = true;
    void onUpdateAppSettings(next);
  }, [
    appSettings,
    defaultModels.length,
    onUpdateAppSettings,
    reasoningOptions,
    reasoningSupported,
    savedEffort,
    savedModelSlug,
    selectedModelSlug,
    selectedEffort,
  ]);

  return (
    <SettingsSection
      title="Codex"
      subtitle="配置 CodexMonitor 使用的 Codex CLI，并检查安装状态。"
    >
      <div className="settings-field">
        <div className="settings-field-row settings-field-row-between">
          <div>
            <div className="settings-field-label">本机配置</div>
            <div className="settings-help">
              自动读取 <code>CODEX_HOME</code>；未设置时使用默认 <code>~/.codex</code>。
            </div>
          </div>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={onRefreshCodexStatus}
            disabled={codexStatusState.status === "loading"}
          >
            {codexStatusState.status === "loading" ? "刷新中..." : "刷新"}
          </button>
        </div>
        {codexStatusState.error && (
          <div className="settings-help settings-help-error">
            读取失败：{codexStatusState.error}
          </div>
        )}
        {codexStatusState.result && (
          <div className="settings-doctor ok">
            <div className="settings-doctor-title">
              Codex 配置已关联（{codexStatusState.result.codexHomeSource}）
            </div>
            <div className="settings-doctor-body">
              <div>CODEX_HOME：{codexStatusState.result.codexHomePath ?? "未解析"}</div>
              <div>
                config.toml：
                {codexStatusState.result.configExists ? "已找到" : "未找到"}
                {codexStatusState.result.configPath
                  ? `（${codexStatusState.result.configPath}）`
                  : ""}
              </div>
              <div>
                AGENTS.md：
                {codexStatusState.result.globalAgentsExists ? "已找到" : "未找到"}
                {codexStatusState.result.globalAgentsPath
                  ? `（${codexStatusState.result.globalAgentsPath}）`
                  : ""}
              </div>
              <div>
                Skills：Codex {codexStatusState.result.codexSkillsCount} 个，
                Agents {codexStatusState.result.agentsSkillsCount} 个
              </div>
              <div>
                默认模型：
                {codexStatusState.result.model ??
                  (codexStatusState.result.modelError ? "读取失败" : "未设置")}
              </div>
              {codexStatusState.result.modelError && (
                <div>{codexStatusState.result.modelError}</div>
              )}
            </div>
          </div>
        )}
        {!codexStatusState.result && codexStatusState.status === "loading" && (
          <div className="settings-help">正在读取本机 Codex 配置...</div>
        )}
      </div>

      <div className="settings-divider" />

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="codex-path">
          默认 Codex 路径
        </label>
        <div className="settings-field-row">
          <input
            id="codex-path"
            className="settings-input"
            value={codexPathDraft}
            placeholder="codex"
            onChange={(event) => onSetCodexPathDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void onBrowseCodex();
            }}
          >
            浏览
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onSetCodexPathDraft("")}
          >
            使用 PATH
          </button>
        </div>
        <div className="settings-help">留空则使用系统 PATH 查找。</div>
        <label className="settings-field-label" htmlFor="codex-args">
          默认 Codex 参数
        </label>
        <div className="settings-field-row">
          <input
            id="codex-args"
            className="settings-input"
            value={codexArgsDraft}
            placeholder="--profile personal"
            onChange={(event) => onSetCodexArgsDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => onSetCodexArgsDraft("")}
          >
            清空
          </button>
        </div>
        <div className="settings-help">
          在 <code>app-server</code> 前附加的参数。带空格的值请使用引号。
        </div>
        <div className="settings-help">
          这些设置会应用到所有已连接项目共享的 Codex app-server。
        </div>
        <div className="settings-help">
          单会话覆盖会忽略不支持的参数：<code>-m</code>/
          <code>--model</code>, <code>-a</code>/<code>--ask-for-approval</code>,{" "}
          <code>-s</code>/<code>--sandbox</code>, <code>--full-auto</code>,{" "}
          <code>--dangerously-bypass-approvals-and-sandbox</code>, <code>--oss</code>,{" "}
          <code>--local-provider</code> 和 <code>--no-alt-screen</code>。
        </div>
        <div className="settings-field-actions">
          {codexDirty && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                void onSaveCodexSettings();
              }}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? "保存中..." : "保存"}
            </button>
          )}
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onRunDoctor();
            }}
            disabled={doctorState.status === "running"}
          >
            <Stethoscope aria-hidden />
            {doctorState.status === "running" ? "检查中..." : "运行诊断"}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onRunCodexUpdate();
            }}
            disabled={codexUpdateState.status === "running"}
            title="更新 Codex"
          >
            <Stethoscope aria-hidden />
            {codexUpdateState.status === "running" ? "更新中..." : "更新"}
          </button>
        </div>

        {doctorState.result && (
          <div className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}>
            <div className="settings-doctor-title">
              {doctorState.result.ok ? "Codex 状态正常" : "检测到 Codex 问题"}
            </div>
            <div className="settings-doctor-body">
              <div>版本：{doctorState.result.version ?? "未知"}</div>
              <div>App-server：{doctorState.result.appServerOk ? "正常" : "失败"}</div>
              <div>
                Node:{" "}
                {doctorState.result.nodeOk
                  ? `正常（${doctorState.result.nodeVersion ?? "未知"}）`
                  : "缺失"}
              </div>
              {doctorState.result.details && <div>{doctorState.result.details}</div>}
              {doctorState.result.nodeDetails && <div>{doctorState.result.nodeDetails}</div>}
              {doctorState.result.path && (
                <div className="settings-doctor-path">PATH: {doctorState.result.path}</div>
              )}
            </div>
          </div>
        )}

        {codexUpdateState.result && (
          <div
            className={`settings-doctor ${codexUpdateState.result.ok ? "ok" : "error"}`}
          >
            <div className="settings-doctor-title">
              {codexUpdateState.result.ok
                ? codexUpdateState.result.upgraded
                  ? "Codex 已更新"
                  : "Codex 已是最新"
                : "Codex 更新失败"}
            </div>
            <div className="settings-doctor-body">
              <div>方式：{codexUpdateState.result.method}</div>
              {codexUpdateState.result.package && (
                <div>包：{codexUpdateState.result.package}</div>
              )}
              <div>
                版本：{" "}
                {codexUpdateState.result.afterVersion ??
                  codexUpdateState.result.beforeVersion ??
                  "未知"}
              </div>
              {codexUpdateState.result.details && <div>{codexUpdateState.result.details}</div>}
              {codexUpdateState.result.output && (
                <details>
                  <summary>输出</summary>
                  <pre>{codexUpdateState.result.output}</pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="settings-divider" />
      <div className="settings-field-label settings-field-label--section">
        默认参数
      </div>

      <SettingsToggleRow
        title={
          <label htmlFor="default-model">
            模型
          </label>
        }
        subtitle={
          defaultModelsConnectedWorkspaceCount === 0
            ? "添加项目后才能加载可用模型。"
            : defaultModelsLoading
              ? "正在从第一个项目加载模型…"
              : defaultModelsError
                ? `无法加载模型：${defaultModelsError}`
                : "来自第一个项目；没有会话级覆盖时使用。"
        }
      >
        <div className="settings-field-row">
          <select
            id="default-model"
            className="settings-select"
            value={selectedModelSlug}
            disabled={!defaultModels.length || defaultModelsLoading}
            onChange={(event) =>
              void onUpdateAppSettings({
                ...appSettings,
                lastComposerModelId: event.target.value,
              })
            }
            aria-label="模型"
          >
            {defaultModels.map((model) => (
              <option key={model.model} value={model.model}>
                {model.displayName?.trim() || model.model}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ghost"
            onClick={onRefreshDefaultModels}
            disabled={defaultModelsLoading || defaultModelsConnectedWorkspaceCount === 0}
          >
            刷新
          </button>
        </div>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={
          <label htmlFor="default-effort">
            推理强度
          </label>
        }
        subtitle={
          reasoningSupported
            ? "可用选项取决于当前选择的模型。"
            : "当前模型没有提供推理强度选项。"
        }
      >
        <select
          id="default-effort"
          className="settings-select"
          value={selectedEffort}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              lastComposerReasoningEffort: event.target.value,
            })
          }
          aria-label="推理强度"
          disabled={!reasoningSupported}
        >
          {!reasoningSupported && <option value="">不支持</option>}
          {reasoningOptions.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      </SettingsToggleRow>

      <SettingsToggleRow
        title={
          <label htmlFor="default-access">
            访问模式
          </label>
        }
        subtitle="没有会话级覆盖时使用。"
      >
        <select
          id="default-access"
          className="settings-select"
          value={appSettings.defaultAccessMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              defaultAccessMode: event.target.value as AppSettings["defaultAccessMode"],
            })
          }
        >
          <option value="read-only">只读</option>
          <option value="current">按需确认</option>
          <option value="full-access">完全访问</option>
        </select>
      </SettingsToggleRow>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="review-delivery">
          Review 模式
        </label>
        <select
          id="review-delivery"
          className="settings-select"
          value={appSettings.reviewDeliveryMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              reviewDeliveryMode: event.target.value as AppSettings["reviewDeliveryMode"],
            })
          }
        >
          <option value="inline">当前会话内</option>
          <option value="detached">独立 review 会话</option>
        </select>
        <div className="settings-help">
          选择 <code>/review</code> 在当前会话内运行，还是新建独立 review 会话。
        </div>
      </div>

      <FileEditorCard
        title="Global AGENTS.md"
        meta={globalAgentsMeta}
        error={globalAgentsError}
        value={globalAgentsContent}
        placeholder="添加 Codex agents 的全局指令…"
        disabled={globalAgentsLoading}
        refreshDisabled={globalAgentsRefreshDisabled}
        saveDisabled={globalAgentsSaveDisabled}
        saveLabel={globalAgentsSaveLabel}
        onChange={onSetGlobalAgentsContent}
        onRefresh={onRefreshGlobalAgents}
        onSave={onSaveGlobalAgents}
        helpText={
          <>
            保存在 <code>~/.codex/AGENTS.md</code>。
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />

      <div className="settings-field">
        <div className="settings-field-label settings-field-label--section">
          MCP
        </div>
        <div className="settings-help">
          CodexMonitor 使用 Codex 原生 MCP 配置，不维护第二份配置。
          在下方 <code>Global config.toml</code> 添加{" "}
          <code>[mcp_servers.&lt;name&gt;]</code>；项目级配置使用项目内{" "}
          <code>.codex/config.toml</code>。
        </div>
        <div className="settings-help">
          会话内输入 <code>/mcp</code> 查看当前 Codex MCP 状态；OAuth 登录使用{" "}
          <code>codex mcp login &lt;server&gt;</code>。
        </div>
        <div className="settings-field-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={onRefreshMcpStatus}
            disabled={mcpStatusState.status === "loading"}
          >
            {mcpStatusState.status === "loading" ? "刷新中..." : "刷新 MCP 状态"}
          </button>
        </div>
        {mcpStatusState.error && (
          <div className="settings-help settings-help-error">
            MCP 状态读取失败：{mcpStatusState.error}
          </div>
        )}
        {mcpStatusState.result !== null && (
          <div className="settings-doctor ok">
            <div className="settings-doctor-title">
              MCP 状态
              {mcpStatusState.workspaceName ? `（${mcpStatusState.workspaceName}）` : ""}
            </div>
            <div className="settings-doctor-body">
              <pre>{JSON.stringify(mcpStatusState.result, null, 2)}</pre>
            </div>
          </div>
        )}
        <details className="settings-code-details">
          <summary>配置片段</summary>
          <pre>{`[mcp_servers.docs]
url = "https://example.com/mcp"

[mcp_servers.local]
command = "node"
args = ["server.mjs"]
# env = { API_KEY = "$MY_API_KEY" }`}</pre>
        </details>
      </div>

      <FileEditorCard
        title="Global config.toml"
        meta={globalConfigMeta}
        error={globalConfigError}
        value={globalConfigContent}
        placeholder="编辑全局 Codex config.toml…"
        disabled={globalConfigLoading}
        refreshDisabled={globalConfigRefreshDisabled}
        saveDisabled={globalConfigSaveDisabled}
        saveLabel={globalConfigSaveLabel}
        onChange={onSetGlobalConfigContent}
        onRefresh={onRefreshGlobalConfig}
        onSave={onSaveGlobalConfig}
        helpText={
          <>
            保存在 <code>~/.codex/config.toml</code>。
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />
    </SettingsSection>
  );
}

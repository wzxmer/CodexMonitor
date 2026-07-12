import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert";
import CircleOff from "lucide-react/dist/esm/icons/circle-off";
import Eye from "lucide-react/dist/esm/icons/eye";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Zap from "lucide-react/dist/esm/icons/zap";
import type {
  AppSettings,
  CodexProviderKind,
  SkillOption,
  WorkflowAgentOption,
  WorkflowRuntimeDiagnostics,
  WorkflowRuntimeMode,
} from "@/types";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";

export type SettingsWorkflowSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  workspaceName: string | null;
  providerKind: CodexProviderKind;
  model: string | null;
  skills: SkillOption[];
  agents: WorkflowAgentOption[];
  registryFingerprint: string | null;
  registryErrors: string[];
  registryCacheHit: boolean;
  registryRefreshing: boolean;
  registryRefreshError: string | null;
  registryLastRefreshAtMs: number | null;
  diagnostics: WorkflowRuntimeDiagnostics;
  onRefreshRegistry: () => Promise<void>;
};

const MODES: Array<{
  id: WorkflowRuntimeMode;
  icon: typeof CircleOff;
  labelKey: "settings.workflow.modeOff" | "settings.workflow.modeShadow" | "settings.workflow.modeActive";
}> = [
  { id: "off", icon: CircleOff, labelKey: "settings.workflow.modeOff" },
  { id: "shadow", icon: Eye, labelKey: "settings.workflow.modeShadow" },
  { id: "active", icon: Zap, labelKey: "settings.workflow.modeActive" },
];

export function SettingsWorkflowSection({
  appSettings,
  onUpdateAppSettings,
  workspaceName,
  providerKind,
  model,
  skills,
  agents,
  registryFingerprint,
  registryErrors,
  registryCacheHit,
  registryRefreshing,
  registryRefreshError,
  registryLastRefreshAtMs,
  diagnostics,
  onRefreshRegistry,
}: SettingsWorkflowSectionProps) {
  const { t } = useI18n();
  const mode = appSettings.workflowRuntimeMode ?? "shadow";
  const modeDescription = t(
    mode === "off"
      ? "settings.workflow.modeOffHelp"
      : mode === "shadow"
        ? "settings.workflow.modeShadowHelp"
        : "settings.workflow.modeActiveHelp",
  );
  const refreshTime = registryLastRefreshAtMs
    ? new Date(registryLastRefreshAtMs).toLocaleTimeString()
    : t("settings.workflow.neverRefreshed");
  const registryDegraded = Boolean(!workspaceName || registryRefreshError || registryErrors.length);

  return (
    <SettingsSection
      title={t("settings.workflow.title")}
      subtitle={t("settings.workflow.subtitle")}
      className="settings-workflow"
    >
      <SettingsToggleRow
        title={t("settings.workflow.runtimeMode")}
        subtitle={modeDescription}
      >
        <div
          className="workflow-mode-control"
          role="radiogroup"
          aria-label={t("settings.workflow.runtimeMode")}
        >
          {MODES.map(({ id, icon: Icon, labelKey }) => (
            <label
              key={id}
              className={id === mode ? "is-active" : undefined}
            >
              <input
                type="radio"
                name="workflow-runtime-mode"
                value={id}
                checked={id === mode}
                onChange={() => void onUpdateAppSettings({
                  ...appSettings,
                  workflowRuntimeMode: id,
                })}
              />
              <span><Icon aria-hidden />{t(labelKey)}</span>
            </label>
          ))}
        </div>
      </SettingsToggleRow>

      <SettingsSubsection
        title={t("settings.workflow.registry")}
        subtitle={workspaceName
          ? t("settings.workflow.registryWorkspace").replace("{workspace}", workspaceName)
          : t("settings.workflow.registryDisconnected")}
      />
      <SettingsToggleRow
        title={t("settings.workflow.registryRefresh")}
        subtitle={t("settings.workflow.registryRefreshHelp")}
      >
        <button
          type="button"
          className="ghost icon-button workflow-registry-refresh"
          onClick={() => void onRefreshRegistry()}
          disabled={!workspaceName || registryRefreshing}
          aria-label={t("settings.workflow.registryRefresh")}
          title={t("settings.workflow.registryRefresh")}
        >
          <RefreshCw
            aria-hidden
            className={registryRefreshing ? "spinning" : undefined}
          />
        </button>
      </SettingsToggleRow>

      <dl className="workflow-status-grid">
        <div>
          <dt>{t("settings.workflow.status")}</dt>
          <dd data-tone={registryDegraded ? "warning" : "success"}>
            {registryDegraded
              ? <TriangleAlert aria-hidden />
              : <CheckCircle2 aria-hidden />}
            {!workspaceName
              ? t("settings.workflow.statusDisconnected")
              : registryDegraded
                ? t("settings.workflow.statusDegraded")
                : t("settings.workflow.statusReady")}
          </dd>
        </div>
        <div>
          <dt>{t("settings.workflow.providerModel")}</dt>
          <dd>{providerKind} / {model ?? t("settings.workflow.defaultModel")}</dd>
        </div>
        <div>
          <dt>{t("settings.workflow.registryCounts")}</dt>
          <dd>{t("settings.workflow.registryCountValue")
            .replace("{skills}", String(skills.length))
            .replace("{agents}", String(agents.length))}</dd>
        </div>
        <div>
          <dt>{t("settings.workflow.lastRefresh")}</dt>
          <dd>{refreshTime}{registryLastRefreshAtMs
            ? ` · ${registryCacheHit
              ? t("settings.workflow.cacheHit")
              : t("settings.workflow.cacheMiss")}`
            : ""}</dd>
        </div>
      </dl>

      {(registryRefreshError || registryErrors.length > 0) && (
        <div className="workflow-registry-errors" role="status">
          {registryRefreshError && <div>{registryRefreshError}</div>}
          {registryErrors.map((error, index) => <div key={`${index}-${error}`}>{error}</div>)}
        </div>
      )}

      <SettingsSubsection
        title={t("settings.workflow.diagnostics")}
        subtitle={t("settings.workflow.diagnosticsHelp")}
      />
      <details className="workflow-diagnostics">
        <summary>{t("settings.workflow.diagnosticsOpen")}</summary>
        <dl>
          <div><dt>{t("settings.workflow.fingerprint")}</dt><dd>{registryFingerprint?.slice(0, 16) ?? "-"}</dd></div>
          <div><dt>{t("settings.workflow.lastMode")}</dt><dd>{diagnostics.lastMode ?? mode}</dd></div>
          <div><dt>{t("settings.workflow.triggered")}</dt><dd>{diagnostics.triggerSummary || t("settings.workflow.none")}</dd></div>
          <div><dt>{t("settings.workflow.fallbacks")}</dt><dd>{diagnostics.fallbackSummary || t("settings.workflow.none")}</dd></div>
          <div><dt>{t("settings.workflow.context")}</dt><dd>{diagnostics.contextSummary || t("settings.workflow.none")}</dd></div>
          <div><dt>{t("settings.workflow.contextApplied")}</dt><dd>{diagnostics.contextApplied === null
            ? t("settings.workflow.none")
            : diagnostics.contextApplied
              ? t("settings.workflow.yes")
              : t("settings.workflow.no")}</dd></div>
          <div><dt>{t("settings.workflow.contextSources")}</dt><dd>{String(diagnostics.contextSourceCount)}</dd></div>
          <div><dt>{t("settings.workflow.completionPhase")}</dt><dd>{diagnostics.completionPhase || t("settings.workflow.none")}</dd></div>
          <div><dt>{t("settings.workflow.pendingValidations")}</dt><dd>{String(diagnostics.pendingValidationCount)}</dd></div>
          <div><dt>{t("settings.workflow.reviewStatus")}</dt><dd>{diagnostics.changedDiffReviewStatus || t("settings.workflow.none")}</dd></div>
          <div><dt>{t("settings.workflow.knowledgeStatus")}</dt><dd>{diagnostics.knowledgeCaptureStatus || t("settings.workflow.none")}</dd></div>
        </dl>
        {(diagnostics.lastError || diagnostics.sourceErrors.length > 0) && (
          <div className="workflow-diagnostics-error">
            {diagnostics.lastError && <div>{diagnostics.lastError}</div>}
            {diagnostics.sourceErrors.map((error, index) => (
              <div key={`${index}-${error}`}>{error}</div>
            ))}
          </div>
        )}
      </details>
    </SettingsSection>
  );
}

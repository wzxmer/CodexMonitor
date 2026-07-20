import { useCallback, useEffect, useState } from "react";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert";
import CircleOff from "lucide-react/dist/esm/icons/circle-off";
import Eye from "lucide-react/dist/esm/icons/eye";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Zap from "lucide-react/dist/esm/icons/zap";
import Database from "lucide-react/dist/esm/icons/database";
import Search from "lucide-react/dist/esm/icons/search";
import type {
  AppSettings,
  CodexProviderKind,
  SkillOption,
  WorkflowAgentOption,
  WorkflowRuntimeDiagnostics,
  WorkflowRuntimeMode,
  KnowledgeAdapterStatus,
  KnowledgeIntakeCaptureResponse,
  KnowledgeQueryResponse,
  KnowledgeTaskInitResponse,
} from "@/types";
import {
  SettingsSection,
  SettingsSubsection,
  SettingsToggleRow,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";
import {
  knowledgeIntakeCapture,
  knowledgeQuery,
  knowledgeStatus,
  knowledgeTaskInit,
} from "@services/tauri";

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

function newKnowledgeRequestId(prefix: "intake" | "task") {
  return `codex-monitor-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  const [kbStatus, setKbStatus] = useState<KnowledgeAdapterStatus | null>(null);
  const [kbStatusLoading, setKbStatusLoading] = useState(false);
  const [kbStatusError, setKbStatusError] = useState<string | null>(null);
  const [kbQuestion, setKbQuestion] = useState("");
  const [kbQueryResult, setKbQueryResult] = useState<KnowledgeQueryResponse | null>(null);
  const [kbQueryLoading, setKbQueryLoading] = useState(false);
  const defaultProjectId = workspaceName?.toLowerCase() === "codexmonitor" ? "codex-monitor" : "";
  const [kbIntakeProjectId, setKbIntakeProjectId] = useState(defaultProjectId);
  const [kbIntakeText, setKbIntakeText] = useState("");
  const [kbIntakeRisk, setKbIntakeRisk] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [kbIntakeSensitivity, setKbIntakeSensitivity] = useState<"public" | "internal" | "private">("private");
  const [kbIntakeRequestId, setKbIntakeRequestId] = useState(() => newKnowledgeRequestId("intake"));
  const [kbIntakeResult, setKbIntakeResult] = useState<KnowledgeIntakeCaptureResponse | null>(null);
  const [kbTaskProjectId, setKbTaskProjectId] = useState(defaultProjectId);
  const [kbTaskScale, setKbTaskScale] = useState<"S" | "M" | "L">("S");
  const [kbTaskRisk, setKbTaskRisk] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [kbTaskAuthorization, setKbTaskAuthorization] = useState("implementation");
  const [kbTaskIntakeId, setKbTaskIntakeId] = useState("");
  const [kbTaskWorkItem, setKbTaskWorkItem] = useState("");
  const [kbTaskRequestId, setKbTaskRequestId] = useState(() => newKnowledgeRequestId("task"));
  const [kbTaskResult, setKbTaskResult] = useState<KnowledgeTaskInitResponse | null>(null);
  const [kbWriteLoading, setKbWriteLoading] = useState<"intake" | "task" | null>(null);
  const [kbWriteError, setKbWriteError] = useState<string | null>(null);

  const refreshKnowledgeStatus = useCallback(async () => {
    setKbStatusLoading(true);
    setKbStatusError(null);
    try {
      setKbStatus(await knowledgeStatus());
    } catch (error) {
      setKbStatus(null);
      setKbStatusError(error instanceof Error ? error.message : String(error));
    } finally {
      setKbStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setKbStatusLoading(true);
    void knowledgeStatus()
      .then((status) => {
        if (active) {
          setKbStatus(status);
          setKbStatusError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setKbStatus(null);
          setKbStatusError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (active) setKbStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submitKnowledgeQuery = useCallback(async () => {
    const query = kbQuestion.trim();
    if (!query) return;
    setKbQueryLoading(true);
    try {
      setKbQueryResult(await knowledgeQuery(query, null));
    } catch (error) {
      setKbQueryResult(null);
      setKbStatusError(error instanceof Error ? error.message : String(error));
    } finally {
      setKbQueryLoading(false);
    }
  }, [kbQuestion]);

  const resetIntakeRequest = useCallback(() => {
    setKbIntakeRequestId(newKnowledgeRequestId("intake"));
    setKbIntakeResult(null);
  }, []);

  const resetTaskRequest = useCallback(() => {
    setKbTaskRequestId(newKnowledgeRequestId("task"));
    setKbTaskResult(null);
  }, []);

  const submitKnowledgeIntake = useCallback(async () => {
    if (!kbIntakeProjectId.trim() || !kbIntakeText.trim()) return;
    setKbWriteLoading("intake");
    setKbWriteError(null);
    try {
      const now = Date.now().toString();
      const result = await knowledgeIntakeCapture({
        projectId: kbIntakeProjectId.trim(),
        rawSnapshot: kbIntakeText.trim(),
        sourceSession: "codex-monitor-settings",
        sourceTurn: now,
        risk: kbIntakeRisk,
        sensitivity: kbIntakeSensitivity,
        idempotencyKey: kbIntakeRequestId,
      });
      setKbIntakeResult(result);
      setKbTaskIntakeId(result.intake_id);
      setKbTaskProjectId(kbIntakeProjectId.trim());
      setKbIntakeText("");
      setKbIntakeRequestId(newKnowledgeRequestId("intake"));
      setKbTaskRequestId(newKnowledgeRequestId("task"));
    } catch (error) {
      setKbWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setKbWriteLoading(null);
    }
  }, [
    kbIntakeProjectId,
    kbIntakeRequestId,
    kbIntakeRisk,
    kbIntakeSensitivity,
    kbIntakeText,
  ]);

  const submitKnowledgeTask = useCallback(async () => {
    if (!kbTaskProjectId.trim() || !kbTaskAuthorization.trim()) return;
    setKbWriteLoading("task");
    setKbWriteError(null);
    try {
      const result = await knowledgeTaskInit({
        projectId: kbTaskProjectId.trim(),
        scale: kbTaskScale,
        risk: kbTaskRisk,
        authorizationScope: kbTaskAuthorization.trim(),
        idempotencyKey: kbTaskRequestId,
        intakeId: kbTaskIntakeId.trim() || null,
        workItemPath: kbTaskWorkItem.trim() || null,
        capabilityId: null,
        moduleId: null,
      });
      setKbTaskResult(result);
      setKbTaskRequestId(newKnowledgeRequestId("task"));
    } catch (error) {
      setKbWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setKbWriteLoading(null);
    }
  }, [
    kbTaskAuthorization,
    kbTaskIntakeId,
    kbTaskProjectId,
    kbTaskRequestId,
    kbTaskRisk,
    kbTaskScale,
    kbTaskWorkItem,
  ]);

  const availabilityLabel = kbStatus?.availability === "ready"
    ? t("settings.workflow.knowledgeReady")
    : kbStatus?.availability === "degraded"
      ? t("settings.workflow.knowledgeDegraded")
      : t("settings.workflow.knowledgeUnavailable");
  const viewStateLabel = kbStatus?.viewState === "current"
    ? t("settings.workflow.knowledgeCurrent")
    : kbStatus?.viewState === "stale"
      ? t("settings.workflow.knowledgeStale")
      : kbStatus?.viewState === "possibly_stale"
        ? t("settings.workflow.knowledgePossiblyStale")
        : t("settings.workflow.none");

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
        title={t("settings.workflow.knowledge")}
        subtitle={t("settings.workflow.knowledgeHelp")}
      />
      <div className="knowledge-adapter-panel">
        <div className="knowledge-adapter-toolbar">
          <div>
            <Database aria-hidden />
            <span>{t("settings.workflow.knowledgeConnection")}</span>
          </div>
          <button
            type="button"
            className="ghost icon-button"
            onClick={() => void refreshKnowledgeStatus()}
            disabled={kbStatusLoading}
            aria-label={t("settings.workflow.knowledgeRefresh")}
            title={t("settings.workflow.knowledgeRefresh")}
          >
            <RefreshCw aria-hidden className={kbStatusLoading ? "spinning" : undefined} />
          </button>
        </div>
        <dl className="knowledge-status-grid">
          <div><dt>{t("settings.workflow.status")}</dt><dd data-tone={kbStatus?.availability === "ready" ? "success" : "warning"}>{availabilityLabel}</dd></div>
          <div><dt>{t("settings.workflow.knowledgeView")}</dt><dd>{viewStateLabel}</dd></div>
          <div><dt>{t("settings.workflow.knowledgeLedger")}</dt><dd>{kbStatus?.ledgerIntegrity ?? "-"}</dd></div>
          <div><dt>{t("settings.workflow.knowledgeRuntime")}</dt><dd>{kbStatus?.runtimeIntegrity ?? "-"}</dd></div>
        </dl>
        <div className="knowledge-root" title={kbStatus?.root ?? undefined}>
          {kbStatus?.root ?? t("settings.workflow.knowledgeRootUnknown")}
        </div>
        {(kbStatusError || kbStatus?.diagnostic) && (
          <div className="knowledge-adapter-error" role="status">
            {kbStatusError ?? kbStatus?.diagnostic}
          </div>
        )}
        <div className="knowledge-query-row">
          <input
            type="search"
            value={kbQuestion}
            onChange={(event) => setKbQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitKnowledgeQuery();
              }
            }}
            placeholder={t("settings.workflow.knowledgeQueryPlaceholder")}
            aria-label={t("settings.workflow.knowledgeQuery")}
          />
          <button
            type="button"
            className="primary"
            onClick={() => void submitKnowledgeQuery()}
            disabled={kbQueryLoading || !kbQuestion.trim()}
          >
            <Search aria-hidden />
            {t("settings.workflow.knowledgeQuery")}
          </button>
        </div>
        {kbQueryResult && (
          <div className="knowledge-query-results" aria-live="polite">
            {kbQueryResult.context.results.length === 0 ? (
              <div className="knowledge-query-empty">{t("settings.workflow.knowledgeNoResults")}</div>
            ) : kbQueryResult.context.results.map((result) => (
              <div key={`${result.path}-${result.citation.revision}`} className="knowledge-query-result">
                <strong>{result.title || result.knowledge_id}</strong>
                <span>{result.status} · {result.path}</span>
                <p>{result.excerpt || t("settings.workflow.knowledgeNoExcerpt")}</p>
              </div>
            ))}
            {kbQueryResult.omitted.length > 0 && (
              <div className="knowledge-query-omitted">
                {t("settings.workflow.knowledgeOmitted").replace("{count}", String(kbQueryResult.omitted.length))}
              </div>
            )}
          </div>
        )}
        <details className="knowledge-write-panel">
          <summary>{t("settings.workflow.knowledgeWrite")}</summary>
          <div className="knowledge-write-grid">
            <form onSubmit={(event) => { event.preventDefault(); void submitKnowledgeIntake(); }}>
              <strong>{t("settings.workflow.knowledgeCapture")}</strong>
              <label>
                <span>{t("settings.workflow.knowledgeProjectId")}</span>
                <input
                  value={kbIntakeProjectId}
                  onChange={(event) => { setKbIntakeProjectId(event.target.value); resetIntakeRequest(); }}
                />
              </label>
              <label>
                <span>{t("settings.workflow.knowledgeRawIntake")}</span>
                <textarea
                  className="settings-agents-textarea settings-agents-textarea--compact"
                  value={kbIntakeText}
                  maxLength={12000}
                  onChange={(event) => { setKbIntakeText(event.target.value); resetIntakeRequest(); }}
                />
              </label>
              <div className="knowledge-write-options">
                <label>
                  <span>{t("settings.workflow.knowledgeRisk")}</span>
                  <select value={kbIntakeRisk} onChange={(event) => { setKbIntakeRisk(event.target.value as typeof kbIntakeRisk); resetIntakeRequest(); }}>
                    {(["low", "medium", "high", "critical"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t("settings.workflow.knowledgeSensitivity")}</span>
                  <select value={kbIntakeSensitivity} onChange={(event) => { setKbIntakeSensitivity(event.target.value as typeof kbIntakeSensitivity); resetIntakeRequest(); }}>
                    {(["public", "internal", "private"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <button type="submit" className="primary" disabled={kbStatus?.availability !== "ready" || kbWriteLoading !== null || !kbIntakeProjectId.trim() || !kbIntakeText.trim()}>
                {t("settings.workflow.knowledgeCapture")}
              </button>
              {kbIntakeResult && <output>{t("settings.workflow.knowledgeCaptured").replace("{id}", kbIntakeResult.intake_id)}</output>}
            </form>

            <form onSubmit={(event) => { event.preventDefault(); void submitKnowledgeTask(); }}>
              <strong>{t("settings.workflow.knowledgeCreateTask")}</strong>
              <label>
                <span>{t("settings.workflow.knowledgeProjectId")}</span>
                <input value={kbTaskProjectId} onChange={(event) => { setKbTaskProjectId(event.target.value); resetTaskRequest(); }} />
              </label>
              <div className="knowledge-write-options">
                <label>
                  <span>{t("settings.workflow.knowledgeScale")}</span>
                  <select value={kbTaskScale} onChange={(event) => { setKbTaskScale(event.target.value as typeof kbTaskScale); resetTaskRequest(); }}>
                    {(["S", "M", "L"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t("settings.workflow.knowledgeRisk")}</span>
                  <select value={kbTaskRisk} onChange={(event) => { setKbTaskRisk(event.target.value as typeof kbTaskRisk); resetTaskRequest(); }}>
                    {(["low", "medium", "high", "critical"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
              <label>
                <span>{t("settings.workflow.knowledgeAuthorization")}</span>
                <input value={kbTaskAuthorization} onChange={(event) => { setKbTaskAuthorization(event.target.value); resetTaskRequest(); }} />
              </label>
              <label>
                <span>{t("settings.workflow.knowledgeIntakeId")}</span>
                <input value={kbTaskIntakeId} onChange={(event) => { setKbTaskIntakeId(event.target.value); resetTaskRequest(); }} />
              </label>
              <label>
                <span>{t("settings.workflow.knowledgeWorkItem")}</span>
                <input value={kbTaskWorkItem} onChange={(event) => { setKbTaskWorkItem(event.target.value); resetTaskRequest(); }} />
              </label>
              <button type="submit" className="primary" disabled={kbStatus?.availability !== "ready" || kbWriteLoading !== null || !kbTaskProjectId.trim() || !kbTaskAuthorization.trim()}>
                {t("settings.workflow.knowledgeCreateTask")}
              </button>
              {kbTaskResult && <output>{t("settings.workflow.knowledgeTaskCreated").replace("{id}", kbTaskResult.task_id)}</output>}
            </form>
          </div>
          {kbWriteError && <div className="knowledge-adapter-error" role="status">{kbWriteError}</div>}
        </details>
      </div>

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

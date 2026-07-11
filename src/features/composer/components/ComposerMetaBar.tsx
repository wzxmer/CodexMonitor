import type { CSSProperties } from "react";
import { BrainCog, RefreshCw, Repeat2, SlidersHorizontal, Zap } from "lucide-react";
import { RoundedSelect } from "@/features/design-system/components/select/RoundedSelect";
import { useI18n } from "@/features/i18n/I18nProvider";
import { formatReasoningEffortLabel } from "@/features/models/utils/reasoningEffortLabels";
import type {
  AccessMode,
  ComposerTriggerMode,
  ComposerSendShortcut,
  ServiceTier,
} from "../../../types";
import type { CodexArgsOption } from "../../threads/utils/codexArgsProfiles";

type ComposerMetaBarProps = {
  disabled: boolean;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  models: { id: string; displayName: string; model: string }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  onRefreshModels?: () => void;
  isRefreshingModels?: boolean;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  selectedServiceTier: ServiceTier | null;
  reasoningSupported: boolean;
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
  composerSendShortcut: ComposerSendShortcut;
  onSelectComposerSendShortcut?: (shortcut: ComposerSendShortcut) => void;
  composerTriggerMode?: ComposerTriggerMode;
  onSelectComposerTriggerMode?: (mode: ComposerTriggerMode) => void;
  autoReconnectEnabled?: boolean;
  autoReconnectPhase?: "idle" | "waiting" | "sending" | "running";
  autoReconnectAttempt?: number;
  onAutoReconnectChange?: (enabled: boolean) => void;
  codexArgsOptions?: CodexArgsOption[];
  selectedCodexArgsOverride?: string | null;
  onSelectCodexArgsOverride?: (value: string | null) => void;
};

const formatComposerModelLabel = (label: string) =>
  label.replace(/\s+\(config\)$/i, "");

const estimateLabelWidth = (label: string) =>
  [...label].reduce((width, character) => width + (/^[\x00-\x7F]$/.test(character) ? 7 : 12), 0);

const getControlWidthStyle = (
  label: string,
  chromeWidth: number,
  minWidth: number,
  maxWidth: number,
) => {
  const contentWidth = estimateLabelWidth(label);
  const contentEndGap = 4;
  const width = Math.min(
    maxWidth,
    Math.max(minWidth, contentWidth + chromeWidth + contentEndGap),
  );
  return { "--composer-control-width": `${width}px` } as CSSProperties;
};

const getSelectedLabel = <T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T | null,
) => options.find((option) => option.value === value)?.label ?? "";

export function ComposerMetaBar({
  disabled,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  models,
  selectedModelId,
  onSelectModel,
  onRefreshModels,
  isRefreshingModels = false,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  selectedServiceTier,
  reasoningSupported,
  accessMode,
  onSelectAccessMode,
  composerSendShortcut,
  onSelectComposerSendShortcut,
  composerTriggerMode = "default",
  onSelectComposerTriggerMode,
  autoReconnectEnabled = false,
  autoReconnectPhase = "idle",
  autoReconnectAttempt = 0,
  onAutoReconnectChange,
  codexArgsOptions = [],
  selectedCodexArgsOverride = null,
  onSelectCodexArgsOverride,
}: ComposerMetaBarProps) {
  const { t } = useI18n();
  const planMode =
    collaborationModes.find((mode) => mode.id === "plan") ?? null;
  const defaultMode =
    collaborationModes.find((mode) => mode.id === "default") ?? null;
  const canUsePlanToggle =
    Boolean(planMode) &&
    collaborationModes.every(
      (mode) => mode.id === "default" || mode.id === "plan",
    );
  const planSelected = selectedCollaborationModeId === (planMode?.id ?? "");
  const collaborationOptions = collaborationModes.map((mode) => ({
    value: mode.id,
    label: mode.label || mode.id,
  }));
  const modelOptions =
    models.length > 0
      ? models.map((model) => ({
          value: model.id,
          label: formatComposerModelLabel(model.displayName || model.model),
          title: formatComposerModelLabel(model.displayName || model.model),
        }))
      : [{ value: "", label: t("composer.noModel"), disabled: true }];
  const reasoningSelectOptions =
    reasoningOptions.length > 0
      ? reasoningOptions.map((effort) => ({
          value: effort,
          label: formatReasoningEffortLabel(effort, t),
        }))
      : [{ value: "", label: t("composer.default"), disabled: true }];
  const codexArgsSelectOptions = codexArgsOptions.map((option) => ({
    value: option.value,
    label: option.label,
  }));
  const accessModeOptions: Array<{ value: AccessMode; label: string }> = [
    { value: "read-only", label: t("composer.access.readOnly") },
    { value: "current", label: t("composer.access.current") },
    { value: "full-access", label: t("composer.access.fullAccess") },
  ];
  const sendShortcutOptions: Array<{
    value: ComposerSendShortcut;
    label: string;
    title: string;
  }> = [
    {
      value: "enter",
      label: t("composer.shortcut.chat"),
      title: t("composer.shortcut.chatTooltip"),
    },
    {
      value: "ctrl-enter",
      label: t("composer.shortcut.editor"),
      title: t("composer.shortcut.editorTooltip"),
    },
    {
      value: "steer-priority",
      label: t("composer.shortcut.steerPriority"),
      title: t("composer.shortcut.steerPriorityTooltip"),
    },
  ];
  const triggerModeOptions: Array<{ value: ComposerTriggerMode; label: string }> = [
    { value: "default", label: t("composer.trigger.default") },
    { value: "swap-slash-at", label: t("composer.trigger.swap") },
  ];

  return (
    <div className="composer-bar">
      <div className="composer-meta">
        <div className="composer-meta-primary">
        {collaborationModes.length > 0 && (
          canUsePlanToggle ? (
            <div className="composer-select-wrap composer-plan-toggle-wrap">
              <label className="composer-plan-toggle" aria-label={t("composer.planMode")}>
                <input
                  className="composer-plan-toggle-input"
                  type="checkbox"
                  checked={planSelected}
                  disabled={disabled}
                  onChange={(event) =>
                    onSelectCollaborationMode(
                      event.target.checked
                        ? planMode?.id ?? "plan"
                        : (defaultMode?.id ?? null),
                    )
                  }
                />
                <span className="composer-plan-toggle-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="composer-plan-toggle-label">
                  {planMode?.label || t("composer.plan")}
                </span>
              </label>
            </div>
          ) : (
            <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
              <RoundedSelect
                className="composer-select composer-select--model composer-select--collab"
                ariaLabel={t("composer.collaborationMode")}
                value={selectedCollaborationModeId ?? ""}
                options={collaborationOptions}
                onChange={(nextValue) => onSelectCollaborationMode(nextValue || null)}
                disabled={disabled}
              />
            </div>
          )
        )}
        <div
          className="composer-select-wrap composer-select-wrap--model"
          style={getControlWidthStyle(
            getSelectedLabel(modelOptions, selectedModelId ?? ""),
            72,
            116,
            260,
          )}
        >
          <span className="composer-icon composer-icon--model" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M8 7.5h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 15v-5A2.5 2.5 0 0 1 8 7.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="12.5" r="1" fill="currentColor" />
              <circle cx="14.5" cy="12.5" r="1" fill="currentColor" />
              <path
                d="M9.5 15.5h5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M5.5 11H4M20 11h-1.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <RoundedSelect
            className="composer-select composer-select--model"
            popoverClassName="composer-model-select-popover"
            ariaLabel={t("composer.model")}
            value={selectedModelId ?? ""}
            options={modelOptions}
            onChange={onSelectModel}
            disabled={disabled}
          />
          {onRefreshModels && (
            <button
              className="composer-model-refresh"
              type="button"
              onClick={onRefreshModels}
              disabled={isRefreshingModels}
              aria-label={t("composer.refreshModels")}
              title={t("composer.refreshModels")}
            >
              <RefreshCw
                size={12}
                strokeWidth={1.8}
                className={isRefreshingModels ? "is-spinning" : undefined}
              />
            </button>
          )}
          {selectedServiceTier === "fast" && (
            <span
              className="composer-fast-indicator"
              role="status"
              aria-label={t("composer.fastMode")}
              title={t("composer.fastMode")}
            >
              <Zap size={12} strokeWidth={1.8} />
            </span>
          )}
        </div>
        <div
          className="composer-select-wrap composer-select-wrap--effort"
          style={getControlWidthStyle(
            getSelectedLabel(reasoningSelectOptions, selectedEffort ?? ""),
            64,
            76,
            160,
          )}
        >
          <span className="composer-icon composer-icon--effort" aria-hidden>
            <BrainCog size={14} strokeWidth={1.8} />
          </span>
          <RoundedSelect
            className="composer-select composer-select--effort"
            ariaLabel={t("composer.reasoning")}
            value={selectedEffort ?? ""}
            options={reasoningSelectOptions}
            onChange={onSelectEffort}
            disabled={disabled || !reasoningSupported}
          />
        </div>
        {codexArgsOptions.length > 1 && onSelectCodexArgsOverride && (
          <div
            className="composer-select-wrap composer-select-wrap--args"
            style={getControlWidthStyle(
              getSelectedLabel(codexArgsSelectOptions, selectedCodexArgsOverride ?? ""),
              64,
              80,
              180,
            )}
          >
            <span className="composer-icon" aria-hidden>
              <SlidersHorizontal size={14} strokeWidth={1.8} />
            </span>
            <RoundedSelect
              className="composer-select composer-select--approval"
              ariaLabel={t("composer.codexArgs")}
              disabled={disabled}
              value={selectedCodexArgsOverride ?? ""}
              options={codexArgsSelectOptions}
              onChange={(nextValue) => onSelectCodexArgsOverride(nextValue || null)}
            />
          </div>
        )}
        <div
          className="composer-select-wrap composer-select-wrap--access"
          style={getControlWidthStyle(
            getSelectedLabel(accessModeOptions, accessMode),
            64,
            80,
            180,
          )}
        >
          <span className="composer-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4l7 3v5c0 4.5-3 7.5-7 8-4-0.5-7-3.5-7-8V7l7-3z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 12.5l1.8 1.8 3.7-4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <RoundedSelect
            className="composer-select composer-select--approval"
            ariaLabel={t("composer.agentAccess")}
            disabled={disabled}
            value={accessMode}
            options={accessModeOptions}
            onChange={(nextValue) => onSelectAccessMode(nextValue as AccessMode)}
          />
        </div>
        </div>
        <div className="composer-meta-secondary">
        {onSelectComposerSendShortcut && (
          <div
            className="composer-select-wrap composer-select-wrap--shortcut"
            style={getControlWidthStyle(
              getSelectedLabel(
                sendShortcutOptions,
                composerSendShortcut === "enter-and-ctrl-enter"
                  ? "enter"
                  : composerSendShortcut,
              ),
              64,
              112,
              220,
            )}
          >
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 7h10M7 12h7M7 17h4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <path
                  d="M16 14l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <RoundedSelect
              className="composer-select composer-select--shortcut"
              ariaLabel={t("composer.sendShortcut")}
              disabled={disabled}
              value={
                composerSendShortcut === "enter-and-ctrl-enter"
                  ? "enter"
                  : composerSendShortcut
              }
              options={sendShortcutOptions}
              onChange={(nextValue) =>
                onSelectComposerSendShortcut(nextValue as ComposerSendShortcut)
              }
            />
          </div>
        )}
        {onSelectComposerTriggerMode && (
          <div
            className="composer-select-wrap composer-select-wrap--trigger"
            style={getControlWidthStyle(
              getSelectedLabel(triggerModeOptions, composerTriggerMode),
              64,
              84,
              180,
            )}
          >
            <span className="composer-icon" aria-hidden>
              <Repeat2 size={14} strokeWidth={1.8} />
            </span>
            <RoundedSelect
              className="composer-select composer-select--shortcut"
              ariaLabel={t("composer.triggerMode")}
              disabled={disabled}
              value={composerTriggerMode}
              options={triggerModeOptions}
              onChange={(nextValue) =>
                onSelectComposerTriggerMode(nextValue as ComposerTriggerMode)
              }
            />
          </div>
        )}
        {onAutoReconnectChange ? (
          <label
            className={`composer-auto-reconnect${autoReconnectEnabled ? " is-on" : ""}`}
            title={t("composer.autoReconnectHelp")}
          >
            <input
              type="checkbox"
              role="switch"
              checked={autoReconnectEnabled}
              aria-label={t("composer.autoReconnect")}
              onChange={(event) => onAutoReconnectChange(event.target.checked)}
            />
            <span className="composer-auto-reconnect-track" aria-hidden="true">
              <span className="composer-auto-reconnect-knob" />
            </span>
            <span className="composer-auto-reconnect-label">
              {t("composer.autoReconnect")}
            </span>
            {autoReconnectEnabled && autoReconnectPhase !== "idle" ? (
              <span className="composer-auto-reconnect-status" role="status">
                {autoReconnectPhase === "waiting"
                  ? `${t("composer.autoReconnectWaiting")} · ${autoReconnectAttempt}`
                  : t("composer.autoReconnectRunning")}
              </span>
            ) : null}
          </label>
        ) : null}
        </div>
      </div>
    </div>
  );
}

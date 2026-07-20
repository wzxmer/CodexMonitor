import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Link2,
  LoaderCircle,
  X,
} from "lucide-react";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { useI18n } from "@/features/i18n/I18nProvider";
import type { WorkflowGateAdapterStatus } from "@/types";

type WorkflowGateBindingPromptProps = {
  selectedWorkflowGateId: string | null;
  onSelectWorkflowGateId: (workflowId: string | null) => void;
  onVerifyWorkflowGate: (workflowId: string) => Promise<WorkflowGateAdapterStatus>;
  onClose: () => void;
};

type VerificationState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "result"; value: WorkflowGateAdapterStatus }
  | { kind: "error"; message: string };

const TERMINAL_WORKFLOW_STATUSES = new Set(["completed", "failed"]);

export function WorkflowGateBindingPrompt({
  selectedWorkflowGateId,
  onSelectWorkflowGateId,
  onVerifyWorkflowGate,
  onClose,
}: WorkflowGateBindingPromptProps) {
  const { t } = useI18n();
  const [workflowId, setWorkflowId] = useState(selectedWorkflowGateId ?? "");
  const [verification, setVerification] = useState<VerificationState>({ kind: "idle" });
  const requestIdRef = useRef(0);
  const normalizedWorkflowId = workflowId.trim();

  const resultState = useMemo(() => {
    if (verification.kind !== "result") {
      return null;
    }
    const result = verification.value;
    if (result.enforcementLevel === "unsupported") {
      return "unsupported" as const;
    }
    if (result.enforcementLevel === "manual" && !result.projection) {
      return "manual" as const;
    }
    if (
      result.workflowId !== normalizedWorkflowId ||
      !result.projection ||
      result.projection.workflowId !== normalizedWorkflowId
    ) {
      return "error" as const;
    }
    if (TERMINAL_WORKFLOW_STATUSES.has(result.projection.status.toLowerCase())) {
      return "closed" as const;
    }
    if (result.projection.status.toLowerCase() !== "active") {
      return "inactive" as const;
    }
    if (result.enforcementLevel === "manual") {
      return "manual" as const;
    }
    return "gated" as const;
  }, [normalizedWorkflowId, verification]);

  const canBind = resultState === "gated";
  const checking = verification.kind === "checking";

  const handleVerify = async () => {
    if (!normalizedWorkflowId || checking) {
      return;
    }
    const requestId = ++requestIdRef.current;
    setVerification({ kind: "checking" });
    try {
      const result = await onVerifyWorkflowGate(normalizedWorkflowId);
      if (requestId === requestIdRef.current) {
        setVerification({ kind: "result", value: result });
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setVerification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const handleInputChange = (value: string) => {
    requestIdRef.current += 1;
    setWorkflowId(value);
    setVerification({ kind: "idle" });
  };

  const renderStatus = () => {
    if (!normalizedWorkflowId) {
      return (
        <div className="workflow-gate-binding-status is-neutral" role="status">
          <Link2 size={16} strokeWidth={1.8} />
          <span>{t("composer.workflowGate.empty")}</span>
        </div>
      );
    }
    if (checking) {
      return (
        <div className="workflow-gate-binding-status is-checking" role="status">
          <LoaderCircle className="is-spinning" size={16} strokeWidth={1.8} />
          <span>{t("composer.workflowGate.checking")}</span>
        </div>
      );
    }
    if (verification.kind === "error") {
      return (
        <div className="workflow-gate-binding-status is-error" role="alert">
          <CircleX size={16} strokeWidth={1.8} />
          <span>{verification.message || t("composer.workflowGate.error")}</span>
        </div>
      );
    }
    if (verification.kind !== "result" || !resultState) {
      return null;
    }

    const result = verification.value;
    const projection = result.projection;
    const copyKey = `composer.workflowGate.${resultState}` as const;
    const Icon = resultState === "gated" ? CircleCheck : resultState === "error" ? CircleX : CircleAlert;
    return (
      <div
        className={`workflow-gate-binding-status is-${resultState}`}
        role={resultState === "gated" ? "status" : "alert"}
      >
        <Icon size={16} strokeWidth={1.8} />
        <div className="workflow-gate-binding-status-copy">
          <strong>{t(copyKey)}</strong>
          {projection && (
            <span>
              {projection.stage} · {projection.status} · r{projection.revision}
            </span>
          )}
          {result.diagnostic && <span>{result.diagnostic}</span>}
        </div>
      </div>
    );
  };

  return createPortal(
    <ModalShell
      className="workflow-gate-binding-modal"
      onBackdropClick={checking ? undefined : onClose}
      ariaLabel={t("composer.workflowGate.title")}
    >
      <div className="workflow-gate-binding-header">
        <div className="ds-modal-title">{t("composer.workflowGate.title")}</div>
        <button
          type="button"
          className="workflow-gate-binding-close"
          onClick={onClose}
          disabled={checking}
          aria-label={t("composer.close")}
          title={t("composer.close")}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>
      <label className="ds-modal-label" htmlFor="workflow-gate-binding-id">
        {t("composer.workflowGate.id")}
      </label>
      <input
        id="workflow-gate-binding-id"
        className="ds-modal-input workflow-gate-binding-input"
        value={workflowId}
        maxLength={160}
        disabled={checking}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="wf-..."
        onChange={(event) => handleInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !checking) {
            event.preventDefault();
            onClose();
          } else if (event.key === "Enter" && normalizedWorkflowId && !checking) {
            event.preventDefault();
            void handleVerify();
          }
        }}
      />
      {renderStatus()}
      <div className="ds-modal-actions workflow-gate-binding-actions">
        {selectedWorkflowGateId && (
          <button
            type="button"
            className="ghost ds-modal-button workflow-gate-binding-unbind"
            onClick={() => {
              onSelectWorkflowGateId(null);
              onClose();
            }}
            disabled={checking}
          >
            {t("composer.workflowGate.unbind")}
          </button>
        )}
        <button
          type="button"
          className="ghost ds-modal-button"
          onClick={() => void handleVerify()}
          disabled={!normalizedWorkflowId || checking}
        >
          {checking ? t("composer.workflowGate.checking") : t("composer.workflowGate.verify")}
        </button>
        <button
          type="button"
          className="primary ds-modal-button"
          onClick={() => {
            if (canBind) {
              onSelectWorkflowGateId(normalizedWorkflowId);
              onClose();
            }
          }}
          disabled={!canBind || checking}
        >
          {t("composer.workflowGate.bind")}
        </button>
      </div>
    </ModalShell>,
    document.body,
  );
}

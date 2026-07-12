import type { DebugEntry, WorkflowRuntimeDiagnostics } from "@/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function latest(entries: DebugEntry[], label: string) {
  return [...entries].reverse().find((entry) => entry.label === label) ?? null;
}

export function buildWorkflowRuntimeDiagnostics(
  entries: DebugEntry[],
): WorkflowRuntimeDiagnostics {
  const preflight = latest(entries, "workflow/preflight");
  const host = latest(entries, "workflow/host preflight");
  const context = latest(entries, "workflow/context compiled");
  const workflowError = [...entries].reverse().find(
    (entry) => entry.source === "error" && entry.label.startsWith("workflow/"),
  ) ?? null;
  const preflightPayload = asRecord(preflight?.payload);
  const hostPayload = asRecord(host?.payload);
  const contextPayload = asRecord(context?.payload);
  const completionPlan = asRecord(hostPayload?.completionPlan);
  const review = asRecord(completionPlan?.changedDiffReview);
  const knowledge = asRecord(completionPlan?.knowledgeCapture);
  const validations = Array.isArray(completionPlan?.validations)
    ? completionPlan.validations
    : [];
  const lastUpdatedAtMs = Math.max(
    preflight?.timestamp ?? 0,
    host?.timestamp ?? 0,
    context?.timestamp ?? 0,
    workflowError?.timestamp ?? 0,
  ) || null;
  const mode = asString(contextPayload?.mode) ?? asString(preflightPayload?.mode);

  return {
    lastUpdatedAtMs,
    lastMode: mode === "shadow" || mode === "active" ? mode : null,
    triggerSummary: asString(preflightPayload?.triggerSummary),
    fallbackSummary: asString(preflightPayload?.fallbackSummary),
    contextSummary: asString(contextPayload?.summary),
    contextApplied:
      typeof contextPayload?.applied === "boolean" ? contextPayload.applied : null,
    contextSourceCount: Array.isArray(contextPayload?.sourceIds)
      ? contextPayload.sourceIds.length
      : 0,
    completionPhase: asString(completionPlan?.phase),
    pendingValidationCount: validations.filter((validation) => {
      return asRecord(validation)?.status === "pending";
    }).length,
    changedDiffReviewStatus: asString(review?.status),
    knowledgeCaptureStatus: asString(knowledge?.status),
    sourceErrors: asStringArray(hostPayload?.sourceErrors),
    lastError: typeof workflowError?.payload === "string" ? workflowError.payload : null,
  };
}

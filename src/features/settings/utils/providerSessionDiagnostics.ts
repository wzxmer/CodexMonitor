import type { CodexKeyProfile } from "@/types";
import type {
  ThreadListContinuityState,
  ThreadListRuntimeContext,
} from "@threads/types";

export type ProviderSessionStaleReason =
  | "none"
  | "continuity-disabled"
  | "runtime-refresh-pending"
  | "pagination-incomplete"
  | "snapshot-unavailable"
  | "snapshot-incomplete"
  | "verification-inconclusive";

export type ProviderSessionFallback =
  | "none"
  | "runtime-authoritative"
  | "retained-previous-list"
  | "awaiting-runtime-list";

export type ProviderSessionDiagnostics = {
  workspaceName: string | null;
  providerName: string | null;
  providerKind: CodexKeyProfile["providerKind"];
  sessionSourceId: string | null;
  runtimeGeneration: number;
  listGeneration: number | null;
  staleThreadCount: number;
  staleReason: ProviderSessionStaleReason;
  fallback: ProviderSessionFallback;
};

type BuildProviderSessionDiagnosticsArgs = {
  workspaceName: string | null;
  provider: Pick<CodexKeyProfile, "name" | "providerKind"> | null;
  runtimeContext: ThreadListRuntimeContext;
  continuity: ThreadListContinuityState | undefined;
  continuityEnabled: boolean;
};

function resolveStaleReason({
  continuity,
  runtimeContext,
  continuityEnabled,
}: Pick<
  BuildProviderSessionDiagnosticsArgs,
  "continuity" | "runtimeContext" | "continuityEnabled"
>): ProviderSessionStaleReason {
  if (!continuityEnabled) {
    return "continuity-disabled";
  }
  if (
    continuity &&
    continuity.runtimeGeneration < runtimeContext.runtimeGeneration
  ) {
    return "runtime-refresh-pending";
  }
  if (!continuity || continuity.staleThreadIds.length === 0) {
    return "none";
  }
  if (!continuity.paginationComplete) {
    return "pagination-incomplete";
  }
  if (!continuity.verifiedSnapshot) {
    return "snapshot-unavailable";
  }
  if (!continuity.verifiedSnapshot.complete) {
    return "snapshot-incomplete";
  }
  return "verification-inconclusive";
}

function resolveFallback({
  continuity,
  runtimeContext,
  continuityEnabled,
}: Pick<
  BuildProviderSessionDiagnosticsArgs,
  "continuity" | "runtimeContext" | "continuityEnabled"
>): ProviderSessionFallback {
  if (!continuityEnabled) {
    return "runtime-authoritative";
  }
  if (!continuity && runtimeContext.runtimeGeneration > 0) {
    return "awaiting-runtime-list";
  }
  if (
    continuity &&
    (continuity.runtimeGeneration < runtimeContext.runtimeGeneration ||
      continuity.staleThreadIds.length > 0)
  ) {
    return "retained-previous-list";
  }
  return "none";
}

export function buildProviderSessionDiagnostics({
  workspaceName,
  provider,
  runtimeContext,
  continuity,
  continuityEnabled,
}: BuildProviderSessionDiagnosticsArgs): ProviderSessionDiagnostics {
  return {
    workspaceName,
    providerName: provider?.name ?? null,
    providerKind: provider?.providerKind ?? "openai",
    sessionSourceId: runtimeContext.sourceId ?? continuity?.sourceId ?? null,
    runtimeGeneration: runtimeContext.runtimeGeneration,
    listGeneration: continuity?.listGeneration ?? null,
    staleThreadCount: continuity?.staleThreadIds.length ?? 0,
    staleReason: resolveStaleReason({
      continuity,
      runtimeContext,
      continuityEnabled,
    }),
    fallback: resolveFallback({
      continuity,
      runtimeContext,
      continuityEnabled,
    }),
  };
}

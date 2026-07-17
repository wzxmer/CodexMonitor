import { describe, expect, it } from "vitest";
import type { ThreadListContinuityState } from "@threads/types";
import { buildProviderSessionDiagnostics } from "./providerSessionDiagnostics";

const continuity: ThreadListContinuityState = {
  sourceId: "source-a",
  runtimeGeneration: 3,
  listGeneration: 7,
  requestId: "request-7",
  requestSequence: 7,
  paginationComplete: true,
  verifiedSnapshot: {
    sourceId: "source-a",
    generation: 11,
    fingerprint: "fingerprint-a",
    complete: true,
    scannedAt: 1_800_000_000,
  },
  staleThreadIds: [],
};

describe("buildProviderSessionDiagnostics", () => {
  it("builds a redacted current-runtime view without Provider credentials", () => {
    const diagnostics = buildProviderSessionDiagnostics({
      workspaceName: "Workspace A",
      provider: { name: "Work", providerKind: "custom" },
      runtimeContext: { sourceId: "source-a", runtimeGeneration: 3 },
      continuity,
      continuityEnabled: true,
    });

    expect(diagnostics).toEqual({
      workspaceName: "Workspace A",
      providerName: "Work",
      providerKind: "custom",
      sessionSourceId: "source-a",
      runtimeGeneration: 3,
      listGeneration: 7,
      staleThreadCount: 0,
      staleReason: "none",
      fallback: "none",
    });
    expect(JSON.stringify(diagnostics)).not.toContain("key");
  });

  it("reports retained-list fallback while the new runtime list is pending", () => {
    const diagnostics = buildProviderSessionDiagnostics({
      workspaceName: "Workspace A",
      provider: null,
      runtimeContext: { sourceId: "source-a", runtimeGeneration: 4 },
      continuity,
      continuityEnabled: true,
    });

    expect(diagnostics.staleReason).toBe("runtime-refresh-pending");
    expect(diagnostics.fallback).toBe("retained-previous-list");
  });

  it("distinguishes incomplete snapshots and disabled continuity", () => {
    const incomplete = buildProviderSessionDiagnostics({
      workspaceName: null,
      provider: null,
      runtimeContext: { sourceId: "source-a", runtimeGeneration: 3 },
      continuity: {
        ...continuity,
        verifiedSnapshot: { ...continuity.verifiedSnapshot!, complete: false },
        staleThreadIds: ["thread-a"],
      },
      continuityEnabled: true,
    });
    const disabled = buildProviderSessionDiagnostics({
      workspaceName: null,
      provider: null,
      runtimeContext: { sourceId: null, runtimeGeneration: 0 },
      continuity: undefined,
      continuityEnabled: false,
    });

    expect(incomplete.staleReason).toBe("snapshot-incomplete");
    expect(incomplete.fallback).toBe("retained-previous-list");
    expect(disabled.staleReason).toBe("continuity-disabled");
    expect(disabled.fallback).toBe("runtime-authoritative");
  });
});

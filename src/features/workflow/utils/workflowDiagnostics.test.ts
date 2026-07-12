import { describe, expect, it } from "vitest";
import { buildWorkflowRuntimeDiagnostics } from "./workflowDiagnostics";

describe("workflow runtime diagnostics", () => {
  it("summarizes workflow metadata without retaining task text", () => {
    const result = buildWorkflowRuntimeDiagnostics([
      {
        id: "1",
        timestamp: 10,
        source: "client",
        label: "workflow/preflight",
        payload: {
          mode: "active",
          triggerSummary: "diagnose, code-review",
          fallbackSummary: "visual-qa-loop:fallback",
          task: "secret task text",
        },
      },
      {
        id: "2",
        timestamp: 11,
        source: "client",
        label: "workflow/host preflight",
        payload: {
          sourceErrors: ["knowledge unavailable"],
          completionPlan: {
            phase: "focused_validation",
            validations: [{ status: "pending" }, { status: "passed" }],
            changedDiffReview: { status: "pending" },
            knowledgeCapture: { status: "evaluate" },
          },
        },
      },
      {
        id: "3",
        timestamp: 12,
        source: "client",
        label: "workflow/context compiled",
        payload: {
          mode: "active",
          applied: true,
          summary: "host:2; skills:diagnose; agents:none",
          sourceIds: ["cm.rule.0", "cm.skill.0"],
        },
      },
    ]);

    expect(result).toMatchObject({
      lastUpdatedAtMs: 12,
      lastMode: "active",
      triggerSummary: "diagnose, code-review",
      contextApplied: true,
      contextSourceCount: 2,
      completionPhase: "focused_validation",
      pendingValidationCount: 1,
      changedDiffReviewStatus: "pending",
      knowledgeCaptureStatus: "evaluate",
      sourceErrors: ["knowledge unavailable"],
    });
    expect(JSON.stringify(result)).not.toContain("secret task text");
  });
});

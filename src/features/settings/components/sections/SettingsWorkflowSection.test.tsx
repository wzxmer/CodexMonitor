// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import { SettingsWorkflowSection } from "./SettingsWorkflowSection";

const serviceMocks = vi.hoisted(() => ({
  knowledgeStatus: vi.fn(() => new Promise(() => undefined)),
  knowledgeIntakeCapture: vi.fn(async () => ({
    intake_id: "intake-1",
    state: "captured" as const,
    revision: 1,
    content_hash: "hash",
  })),
  knowledgeTaskInit: vi.fn(async () => ({
    task_id: "task-1",
    state: "queued" as const,
    revision: 1,
  })),
}));

vi.mock("@services/tauri", () => ({
  knowledgeStatus: serviceMocks.knowledgeStatus,
  knowledgeQuery: vi.fn(async () => ({
    state: "ready",
    mode: "context_only",
    question: "test",
    answer: null,
    provider_execution: "not_performed",
    context: { results: [], omitted: [], warnings: [] },
    citations: [],
    omitted: [],
    usage_visibility: "unknown",
  })),
  knowledgeIntakeCapture: serviceMocks.knowledgeIntakeCapture,
  knowledgeTaskInit: serviceMocks.knowledgeTaskInit,
}));

function renderSection({
  mode = "active",
  workspaceName = "ThreadFleet",
  refreshing = false,
  registryLastRefreshAtMs = 1_700_000_000_000,
}: {
  mode?: "off" | "shadow" | "active";
  workspaceName?: string | null;
  refreshing?: boolean;
  registryLastRefreshAtMs?: number | null;
} = {}) {
  const onUpdateAppSettings = vi.fn(async () => undefined);
  const onRefreshRegistry = vi.fn(async () => undefined);
  const appSettings = ({ workflowRuntimeMode: mode } as unknown) as AppSettings;
  render(
    <SettingsWorkflowSection
      appSettings={appSettings}
      onUpdateAppSettings={onUpdateAppSettings}
      workspaceName={workspaceName}
      providerKind="opencode"
      model="minimax-m3"
      skills={[{ name: "diagnose", path: "/skills/diagnose" }]}
      agents={[{ name: "reviewer", path: "/agents/reviewer.toml" }]}
      registryFingerprint="abcdef1234567890ffff"
      registryErrors={[]}
      registryCacheHit
      registryRefreshing={refreshing}
      registryRefreshError={null}
      registryLastRefreshAtMs={registryLastRefreshAtMs}
      diagnostics={{
        lastUpdatedAtMs: 1_700_000_000_100,
        lastMode: "active",
        triggerSummary: "diagnose",
        fallbackSummary: null,
        contextSummary: "host:1; skills:diagnose",
        contextApplied: true,
        contextSourceCount: 2,
        completionPhase: "focused_validation",
        pendingValidationCount: 2,
        changedDiffReviewStatus: "pending",
        knowledgeCaptureStatus: "evaluate",
        sourceErrors: [],
        lastError: null,
      }}
      onRefreshRegistry={onRefreshRegistry}
    />,
  );
  return { appSettings, onUpdateAppSettings, onRefreshRegistry };
}

describe("SettingsWorkflowSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("switches persisted workflow runtime mode", () => {
    const { appSettings, onUpdateAppSettings } = renderSection();

    fireEvent.click(screen.getByRole("radio", { name: "影子" }));

    expect(onUpdateAppSettings).toHaveBeenCalledWith({
      ...appSettings,
      workflowRuntimeMode: "shadow",
    });
  });

  it("refreshes Registry and stops duplicate clicks while loading", () => {
    const { onRefreshRegistry } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "刷新 Registry" }));
    expect(onRefreshRegistry).toHaveBeenCalledTimes(1);

    cleanup();
    renderSection({ refreshing: true });
    expect(
      (screen.getByRole("button", { name: "刷新 Registry" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows redacted Registry and workflow diagnostics", () => {
    renderSection();
    expect(screen.getByText("1 skills · 1 agents")).toBeTruthy();
    expect(screen.getByText("opencode / minimax-m3")).toBeTruthy();

    fireEvent.click(screen.getByText("查看诊断详情"));
    expect(screen.getByText("diagnose")).toBeTruthy();
    expect(screen.getByText("focused_validation")).toBeTruthy();
    expect(screen.queryByText("secret task text")).toBeNull();
  });

  it("disables Registry refresh without a connected project", () => {
    renderSection({ workspaceName: null });
    expect(
      (screen.getByRole("button", { name: "刷新 Registry" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("does not claim a rescan before the first refresh", () => {
    renderSection({ workspaceName: null, registryLastRefreshAtMs: null });
    expect(screen.getByText("尚未刷新")).toBeTruthy();
    expect(screen.queryByText(/尚未刷新.*已重新扫描/)).toBeNull();
  });

  it("captures intake and initializes a task through the knowledge adapter", async () => {
    serviceMocks.knowledgeStatus.mockResolvedValueOnce({
      availability: "ready",
      root: "D:/DevKnowledgeBase",
      viewState: "current",
      viewRevision: "revision",
      ledgerIntegrity: "ok",
      runtimeIntegrity: "ok",
      diagnostic: null,
      usageVisibility: "unknown",
    });
    renderSection();
    fireEvent.click(screen.getByText("知识写入"));

    const [intakeProject] = screen.getAllByLabelText("项目 ID");
    fireEvent.change(intakeProject, { target: { value: "rime-txjx" } });
    const rawIntake = screen.getByLabelText("原始要求");
    fireEvent.change(rawIntake, { target: { value: "保留这条原始需求" } });
    const captureButton = screen.getByRole("button", { name: "捕获 Intake" }) as HTMLButtonElement;
    await waitFor(() => expect(captureButton.disabled).toBe(false));
    fireEvent.click(captureButton);

    expect(await screen.findByText("已捕获：intake-1")).toBeTruthy();
    expect(serviceMocks.knowledgeIntakeCapture).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "rime-txjx",
      rawSnapshot: "保留这条原始需求",
      risk: "medium",
      sensitivity: "private",
    }));

    fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
    expect(await screen.findByText("已创建：task-1")).toBeTruthy();
    expect(serviceMocks.knowledgeTaskInit).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "rime-txjx",
      intakeId: "intake-1",
      scale: "S",
    }));
  });
});

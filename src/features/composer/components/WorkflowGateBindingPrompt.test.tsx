/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowGateAdapterStatus } from "@/types";
import { ComposerMetaBar } from "./ComposerMetaBar";

afterEach(cleanup);

const baseProps = {
  disabled: false,
  collaborationModes: [],
  selectedCollaborationModeId: null,
  onSelectCollaborationMode: () => {},
  models: [],
  selectedModelId: null,
  onSelectModel: () => {},
  reasoningOptions: [],
  selectedEffort: null,
  onSelectEffort: () => {},
  selectedServiceTier: null,
  reasoningSupported: false,
  accessMode: "current" as const,
  onSelectAccessMode: () => {},
  composerSendShortcut: "enter" as const,
};

const createStatus = (
  overrides: Partial<WorkflowGateAdapterStatus> = {},
): WorkflowGateAdapterStatus => ({
  enforcementLevel: "gated",
  stateSource: "dev-knowledge-base",
  workflowId: "wf-thread-1",
  projection: {
    schemaVersion: 2,
    workflowId: "wf-thread-1",
    projectId: "codex-monitor",
    workspace: "D:/Project/ThreadFleet",
    taskId: null,
    workItemPath: null,
    status: "active",
    stage: "implementation",
    revision: 3,
    planId: null,
    planRevision: null,
    planReviewStatus: null,
    implementationReviewStatus: null,
    tokenVisibility: "actual",
    creditVisibility: "unknown",
    auditValid: true,
  },
  diagnostic: null,
  ...overrides,
});

describe("WorkflowGateBindingPrompt", () => {
  it("binds only after a gated active workflow is verified", async () => {
    const onSelectWorkflowGateId = vi.fn();
    const onVerifyWorkflowGate = vi.fn(async () => createStatus());
    render(
      <ComposerMetaBar
        {...baseProps}
        onSelectWorkflowGateId={onSelectWorkflowGateId}
        onVerifyWorkflowGate={onVerifyWorkflowGate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "绑定 WorkflowGate" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Workflow ID" }), {
      target: { value: "  wf-thread-1  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证" }));

    expect(await screen.findByText("WorkflowGate 已验证")).toBeTruthy();
    expect(onVerifyWorkflowGate).toHaveBeenCalledWith("wf-thread-1");
    fireEvent.click(screen.getByRole("button", { name: "绑定" }));
    expect(onSelectWorkflowGateId).toHaveBeenCalledWith("wf-thread-1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows manual enforcement without enabling binding", async () => {
    const onSelectWorkflowGateId = vi.fn();
    render(
      <ComposerMetaBar
        {...baseProps}
        onSelectWorkflowGateId={onSelectWorkflowGateId}
        onVerifyWorkflowGate={async () =>
          createStatus({ enforcementLevel: "manual", projection: null })
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "绑定 WorkflowGate" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Workflow ID" }), {
      target: { value: "wf-thread-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证" }));

    expect(await screen.findByText("仅支持手动检查，不能绑定")).toBeTruthy();
    expect(screen.getByRole("button", { name: "绑定" }).hasAttribute("disabled")).toBe(true);
    expect(onSelectWorkflowGateId).not.toHaveBeenCalled();
  });

  it("rejects a mismatched workflow projection", async () => {
    const onSelectWorkflowGateId = vi.fn();
    render(
      <ComposerMetaBar
        {...baseProps}
        onSelectWorkflowGateId={onSelectWorkflowGateId}
        onVerifyWorkflowGate={async () =>
          createStatus({ workflowId: "wf-different" })
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "绑定 WorkflowGate" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Workflow ID" }), {
      target: { value: "wf-thread-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证" }));

    expect(await screen.findByText("WorkflowGate 验证失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "绑定" }).hasAttribute("disabled")).toBe(true);
    expect(onSelectWorkflowGateId).not.toHaveBeenCalled();
  });

  it("rejects completed workflows and can remove an existing binding", async () => {
    const onSelectWorkflowGateId = vi.fn();
    render(
      <ComposerMetaBar
        {...baseProps}
        selectedWorkflowGateId="wf-thread-1"
        onSelectWorkflowGateId={onSelectWorkflowGateId}
        onVerifyWorkflowGate={async () =>
          createStatus({
            projection: {
              ...createStatus().projection!,
              status: "completed",
            },
          })
        }
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "已绑定 WorkflowGate：wf-thread-1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "验证" }));
    expect(await screen.findByText("工作流已结束，不能绑定")).toBeTruthy();
    expect(screen.getByRole("button", { name: "绑定" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "解除绑定" }));
    await waitFor(() => expect(onSelectWorkflowGateId).toHaveBeenCalledWith(null));
  });

  it("rejects a gated workflow that is not active", async () => {
    const onSelectWorkflowGateId = vi.fn();
    render(
      <ComposerMetaBar
        {...baseProps}
        onSelectWorkflowGateId={onSelectWorkflowGateId}
        onVerifyWorkflowGate={async () =>
          createStatus({
            enforcementLevel: "manual",
            projection: {
              ...createStatus().projection!,
              status: "blocked",
            },
          })
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "绑定 WorkflowGate" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Workflow ID" }), {
      target: { value: "wf-thread-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证" }));

    expect(await screen.findByText("工作流不是 active，不能绑定")).toBeTruthy();
    expect(screen.getByRole("button", { name: "绑定" }).hasAttribute("disabled")).toBe(true);
    expect(onSelectWorkflowGateId).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getConfigModel, getModelList } from "../../../services/tauri";
import { useModels } from "./useModels";

vi.mock("../../../services/tauri", () => ({
  getModelList: vi.fn(),
  getConfigModel: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useModels", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds the config model when it is missing from model/list", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [],
            defaultReasoningEffort: null,
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(0));

    expect(getConfigModel).toHaveBeenCalledWith("workspace-1");
    expect(result.current.models[0]).toMatchObject({
      id: "custom-model",
      model: "custom-model",
    });
    expect(result.current.selectedModel?.model).toBe("custom-model");
    expect(result.current.reasoningSupported).toBe(false);
  });

  it("uses a friendly display name for codex-auto-review from config", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: { data: [] },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("codex-auto-review");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBe(1));

    expect(result.current.models[0]).toMatchObject({
      id: "codex-auto-review",
      model: "codex-auto-review",
      displayName: "Codex Auto Review (config)",
    });
    expect(result.current.selectedModel?.model).toBe("codex-auto-review");
  });

  it("prefers the provider entry when the config model matches by slug", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "provider-id",
            model: "custom-model",
            displayName: "Provider Custom",
            supportedReasoningEfforts: [
              { reasoningEffort: "medium", description: "Medium" },
              { reasoningEffort: "high", description: "High" },
            ],
            defaultReasoningEffort: "medium",
            isDefault: false,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.selectedModelId).toBe("provider-id"));

    expect(result.current.models).toHaveLength(1);
    expect(result.current.selectedModel?.id).toBe("provider-id");
    expect(result.current.reasoningSupported).toBe(true);
  });

  it("keeps the selected reasoning effort when switching models", async () => {
    vi.mocked(getModelList).mockResolvedValueOnce({
      result: {
        data: [
          {
            id: "remote-1",
            model: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "Low" },
              { reasoningEffort: "medium", description: "Medium" },
            ],
            defaultReasoningEffort: "medium",
            isDefault: true,
          },
        ],
      },
    });
    vi.mocked(getConfigModel).mockResolvedValueOnce("custom-model");

    const { result } = renderHook(() =>
      useModels({ activeWorkspace: workspace }),
    );

    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(1));

    act(() => {
      result.current.setSelectedEffort("high");
      result.current.setSelectedModelId("custom-model");
    });

    await waitFor(() => {
      expect(result.current.selectedModelId).toBe("custom-model");
      expect(result.current.selectedEffort).toBe("high");
    });
  });

  it("refreshes again after the workspace reconnects", async () => {
    vi.mocked(getModelList).mockResolvedValue({ result: { data: [] } });
    vi.mocked(getConfigModel).mockResolvedValue("custom-model");
    const { rerender } = renderHook(
      ({ connected }) =>
        useModels({ activeWorkspace: { ...workspace, connected } }),
      { initialProps: { connected: true } },
    );

    await waitFor(() => expect(getModelList).toHaveBeenCalledTimes(1));
    rerender({ connected: false });
    rerender({ connected: true });

    await waitFor(() => expect(getModelList).toHaveBeenCalledTimes(2));
  });

  it("exposes manual refresh loading without clearing existing models", async () => {
    let resolveRefresh: ((value: unknown) => void) | null = null;
    vi.mocked(getModelList)
      .mockResolvedValueOnce({ result: { data: [] } })
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      );
    vi.mocked(getConfigModel).mockResolvedValue("custom-model");
    const { result } = renderHook(() => useModels({ activeWorkspace: workspace }));

    await waitFor(() => expect(result.current.models).toHaveLength(1));
    act(() => {
      void result.current.refreshModels();
    });
    await waitFor(() => expect(result.current.isRefreshingModels).toBe(true));
    expect(result.current.models).toHaveLength(1);

    await act(async () => {
      resolveRefresh?.({ result: { data: [] } });
    });
    await waitFor(() => expect(result.current.isRefreshingModels).toBe(false));
  });

  it("keeps the existing model list when manual refresh fails", async () => {
    vi.mocked(getModelList)
      .mockResolvedValueOnce({ result: { data: [] } })
      .mockRejectedValueOnce(new Error("offline"));
    vi.mocked(getConfigModel).mockResolvedValue("custom-model");
    const { result } = renderHook(() => useModels({ activeWorkspace: workspace }));

    await waitFor(() => expect(result.current.models).toHaveLength(1));
    await act(async () => {
      await result.current.refreshModels();
    });

    expect(result.current.models).toHaveLength(1);
    expect(result.current.models[0].id).toBe("custom-model");
  });
});

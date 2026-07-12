// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodexKeyProfile, WorkspaceInfo } from "@/types";
import { useProviderProfileRuntimeSync } from "./useProviderProfileRuntimeSync";

const workspace = {
  id: "ws-1",
  name: "Workspace",
  path: "D:/Project/Test",
  kind: "main",
  connected: true,
} as WorkspaceInfo;

const profile = (id: string): CodexKeyProfile => ({
  id,
  name: id,
  providerKind: "opencode",
  keyEnvVar: "OPENAI_API_KEY",
  key: `key-${id}`,
  baseUrlEnvVar: "OPENAI_BASE_URL",
  baseUrl: "https://opencode.ai/zen/go/v1",
  model: "minimax-m3",
  contextWindow: null,
  maxOutputTokens: null,
  useGateway: true,
  supportsThinking: true,
  supportsReasoningEffort: true,
  lastModelRefreshAtMs: null,
  cachedModels: [],
  groupName: id,
});

describe("useProviderProfileRuntimeSync", () => {
  it("syncs the connected workspace when the active provider changes", async () => {
    const syncWorkspaceRuntime = vi.fn(async () => undefined);
    const { rerender } = renderHook(
      ({ activeProfile }) =>
        useProviderProfileRuntimeSync({
          activeProfile,
          activeWorkspace: workspace,
          activeThreadId: "thread-1",
          settingsLoading: false,
          defer: false,
          syncWorkspaceRuntime,
        }),
      { initialProps: { activeProfile: profile("profile-a") } },
    );

    await waitFor(() =>
      expect(syncWorkspaceRuntime).toHaveBeenLastCalledWith("ws-1", "thread-1"),
    );

    rerender({ activeProfile: profile("profile-b") });

    await waitFor(() => expect(syncWorkspaceRuntime).toHaveBeenCalledTimes(2));
  });

  it("does not resync only because the selected thread changes", async () => {
    const syncWorkspaceRuntime = vi.fn(async () => undefined);
    const activeProfile = profile("profile-a");
    const { rerender } = renderHook(
      ({ activeThreadId }) =>
        useProviderProfileRuntimeSync({
          activeProfile,
          activeWorkspace: workspace,
          activeThreadId,
          settingsLoading: false,
          defer: false,
          syncWorkspaceRuntime,
        }),
      { initialProps: { activeThreadId: "thread-1" } },
    );

    await waitFor(() => expect(syncWorkspaceRuntime).toHaveBeenCalledTimes(1));
    rerender({ activeThreadId: "thread-2" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(syncWorkspaceRuntime).toHaveBeenCalledTimes(1);
  });

  it("defers provider changes until all processing threads finish", async () => {
    const syncWorkspaceRuntime = vi.fn(async () => undefined);
    const { rerender } = renderHook(
      ({ defer }) =>
        useProviderProfileRuntimeSync({
          activeProfile: profile("profile-a"),
          activeWorkspace: workspace,
          activeThreadId: "thread-1",
          settingsLoading: false,
          defer,
          syncWorkspaceRuntime,
        }),
      { initialProps: { defer: true } },
    );

    expect(syncWorkspaceRuntime).not.toHaveBeenCalled();
    rerender({ defer: false });
    await waitFor(() => expect(syncWorkspaceRuntime).toHaveBeenCalledTimes(1));
  });
});

// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent, WorkspaceInfo } from "../../../types";
import { getSkillsList } from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import { useSkills } from "./useSkills";

vi.mock("../../../services/tauri", () => ({
  getSkillsList: vi.fn(),
}));

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Workspace One",
  path: "/tmp/workspace-one",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const workspaceTwo: WorkspaceInfo = {
  ...workspace,
  id: "workspace-2",
  name: "Workspace Two",
  path: "/tmp/workspace-two",
};

let listener: ((event: AppServerEvent) => void) | null = null;
const unlisten = vi.fn();

beforeEach(() => {
  listener = null;
  unlisten.mockReset();
  vi.mocked(subscribeAppServerEvents).mockImplementation((cb) => {
    listener = cb;
    return unlisten;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSkills", () => {
  it("normalizes workflow metadata and defaults existing skills to public", async () => {
    vi.mocked(getSkillsList).mockResolvedValue({
      result: {
        skills: [
          { name: "legacy", path: "/skills/legacy" },
          {
            name: "visual-check",
            path: "/skills/visual-check",
            scope: "provider",
            provider_kinds: ["opencode", "invalid"],
            model_patterns: ["minimax"],
            trigger_keywords: ["截图验证"],
            capability_requirements: ["vision", "invalid"],
            fallback: "Use DOM assertions.",
            priority: 5,
            trustLevel: "prompt",
          },
        ],
      },
    });

    const { result } = renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(result.current.skills).toHaveLength(2);
    });
    expect(result.current.skills[0]).toMatchObject({
      name: "legacy",
      scope: "public",
    });
    expect(result.current.skills[1]).toMatchObject({
      scope: "provider",
      providerKinds: ["opencode"],
      modelPatterns: ["minimax"],
      triggerKeywords: ["截图验证"],
      capabilityRequirements: ["vision"],
      fallback: "Use DOM assertions.",
      priority: 5,
      trustLevel: "prompt",
    });
  });

  it("prefers CM registry metadata and exposes agents and cache diagnostics", async () => {
    vi.mocked(getSkillsList).mockResolvedValue({
      result: {
        skills: [
          { name: "diagnose", path: "/native/diagnose", description: "native" },
        ],
      },
      cmRegistry: {
        fingerprint: "abc123",
        cacheHit: true,
        errors: ["one registry warning"],
        skills: [
          {
            name: "diagnose",
            path: "/project/diagnose/SKILL.md",
            description: "project",
            source: "project",
            instructions: "Project instructions",
          },
        ],
        agents: [
          {
            name: "reviewer",
            path: "/agents/reviewer.toml",
            scope: "model",
            modelPatterns: ["gpt"],
            triggerKeywords: ["review"],
            trustLevel: "prompt",
            developerInstructions: "Review the changed diff.",
            source: "global",
          },
        ],
      },
    });

    const { result } = renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(result.current.registryFingerprint).toBe("abc123");
    });
    expect(result.current.skills).toEqual([
      expect.objectContaining({
        name: "diagnose",
        path: "/project/diagnose/SKILL.md",
        description: "project",
        source: "project",
        instructions: "Project instructions",
      }),
    ]);
    expect(result.current.agents).toEqual([
      expect.objectContaining({
        name: "reviewer",
        scope: "model",
        modelPatterns: ["gpt"],
        triggerKeywords: ["review"],
        trustLevel: "prompt",
        developerInstructions: "Review the changed diff.",
      }),
    ]);
    expect(result.current.registryErrors).toEqual(["one registry warning"]);
    expect(result.current.registryCacheHit).toBe(true);
  });

  it("refreshes skills on canonical codex/event/skills_update_available notifications", async () => {
    vi.mocked(getSkillsList)
      .mockResolvedValueOnce({ result: { skills: [{ name: "first", path: "/skills/first" }] } })
      .mockResolvedValueOnce({
        result: {
          skills: [
            { name: "first", path: "/skills/first" },
            { name: "second", path: "/skills/second" },
          ],
        },
      });

    const { result } = renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(getSkillsList).toHaveBeenCalledTimes(1);
      expect(result.current.skills.map((skill) => skill.name)).toEqual(["first"]);
    });

    act(() => {
      listener?.({
        workspace_id: "workspace-1",
        message: {
          method: "codex/event/skills_update_available",
        },
      });
    });

    await waitFor(() => {
      expect(getSkillsList).toHaveBeenCalledTimes(2);
      expect(result.current.skills.map((skill) => skill.name)).toEqual(["first", "second"]);
    });
  });

  it("ignores non-canonical direct skills update methods", async () => {
    vi.mocked(getSkillsList)
      .mockResolvedValueOnce({ result: { skills: [{ name: "first", path: "/skills/first" }] } });

    const { result } = renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(getSkillsList).toHaveBeenCalledTimes(1);
      expect(result.current.skills.map((skill) => skill.name)).toEqual(["first"]);
    });

    act(() => {
      listener?.({
        workspace_id: "workspace-1",
        message: { method: "skills/updateAvailable" },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getSkillsList).toHaveBeenCalledTimes(1);
    expect(result.current.skills.map((skill) => skill.name)).toEqual(["first"]);
  });

  it("ignores skills update events from other workspaces", async () => {
    vi.mocked(getSkillsList).mockResolvedValue({
      result: { skills: [{ name: "first", path: "/skills/first" }] },
    });

    renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(getSkillsList).toHaveBeenCalledTimes(1);
    });

    act(() => {
      listener?.({
        workspace_id: "workspace-2",
        message: {
          method: "codex/event/skills_update_available",
        },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getSkillsList).toHaveBeenCalledTimes(1);
  });

  it("clears refreshing state and exposes refresh failures", async () => {
    vi.mocked(getSkillsList).mockRejectedValueOnce(new Error("registry unavailable"));

    const { result } = renderHook(() => useSkills({ activeWorkspace: workspace }));

    await waitFor(() => {
      expect(result.current.registryRefreshing).toBe(false);
      expect(result.current.registryRefreshError).toBe("registry unavailable");
    });
  });

  it("does not expose a stale registry response after switching workspaces", async () => {
    let resolveFirst: ((value: any) => void) | null = null;
    let resolveSecond: ((value: any) => void) | null = null;
    vi.mocked(getSkillsList)
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const { result, rerender } = renderHook(
      ({ activeWorkspace }) => useSkills({ activeWorkspace }),
      { initialProps: { activeWorkspace: workspace } },
    );
    await waitFor(() => expect(getSkillsList).toHaveBeenCalledWith("workspace-1"));
    rerender({ activeWorkspace: workspaceTwo });

    await act(async () => {
      resolveFirst?.({
        result: { skills: [{ name: "workspace-one", path: "/skills/one" }] },
      });
    });

    expect(result.current.skills.map((skill) => skill.name)).not.toContain("workspace-one");
    await waitFor(() => expect(getSkillsList).toHaveBeenCalledWith("workspace-2"));
    await act(async () => {
      resolveSecond?.({
        result: { skills: [{ name: "workspace-two", path: "/skills/two" }] },
      });
    });
    await waitFor(() => {
      expect(result.current.skills.map((skill) => skill.name)).toEqual(["workspace-two"]);
    });
  });
});

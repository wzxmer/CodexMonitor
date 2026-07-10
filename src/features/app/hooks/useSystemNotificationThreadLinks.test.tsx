// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useSystemNotificationThreadLinks } from "./useSystemNotificationThreadLinks";

const notificationMocks = vi.hoisted(() => ({
  onAction: vi.fn(),
  unregister: vi.fn(),
}));

const windowMocks = vi.hoisted(() => ({
  show: vi.fn(),
  unminimize: vi.fn(),
  setFocus: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  onAction: notificationMocks.onAction,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMocks,
}));

let actionHandler: ((notification: { extra?: Record<string, unknown> }) => void) | null;

function makeWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: "ws-1",
    name: "Workspace",
    path: "/tmp/workspace",
    connected: true,
    settings: { sidebarCollapsed: false },
    ...overrides,
  };
}

describe("useSystemNotificationThreadLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionHandler = null;
    notificationMocks.onAction.mockImplementation(async (handler) => {
      actionHandler = handler;
      return { unregister: notificationMocks.unregister };
    });
    windowMocks.show.mockResolvedValue(undefined);
    windowMocks.unminimize.mockResolvedValue(undefined);
    windowMocks.setFocus.mockResolvedValue(undefined);
  });

  it("navigates only after a notification action", async () => {
    const workspace = makeWorkspace({ connected: true });
    const workspacesById = new Map([[workspace.id, workspace]]);

    const refreshWorkspaces = vi.fn(async () => [workspace]);
    const connectWorkspace = vi.fn(async () => {});
    const openThreadLink = vi.fn();

    renderHook(() =>
      useSystemNotificationThreadLinks({
        hasLoadedWorkspaces: true,
        workspacesById,
        refreshWorkspaces,
        connectWorkspace,
        openThreadLink,
      }),
    );

    await waitFor(() => expect(notificationMocks.onAction).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(openThreadLink).not.toHaveBeenCalled();

    await act(async () => {
      actionHandler?.({
        extra: { kind: "thread", workspaceId: "ws-1", threadId: "t-1" },
      });
      await Promise.resolve();
    });

    expect(openThreadLink).toHaveBeenCalledWith("ws-1", "t-1");
    expect(connectWorkspace).not.toHaveBeenCalled();
    expect(refreshWorkspaces).not.toHaveBeenCalled();
  });

  it("connects the workspace before selecting an action target", async () => {
    const workspace = makeWorkspace({ connected: false });
    const workspacesById = new Map([[workspace.id, workspace]]);

    const refreshWorkspaces = vi.fn(async () => [workspace]);
    const connectWorkspace = vi.fn(async () => {});
    const openThreadLink = vi.fn();

    renderHook(() =>
      useSystemNotificationThreadLinks({
        hasLoadedWorkspaces: true,
        workspacesById,
        refreshWorkspaces,
        connectWorkspace,
        openThreadLink,
      }),
    );

    await waitFor(() => expect(notificationMocks.onAction).toHaveBeenCalledTimes(1));

    await act(async () => {
      actionHandler?.({
        extra: { kind: "thread", workspaceId: "ws-1", threadId: "t-1" },
      });
      await Promise.resolve();
    });

    expect(connectWorkspace).toHaveBeenCalledTimes(1);
    expect(openThreadLink).toHaveBeenCalledWith("ws-1", "t-1");
  });

  it("ignores notification actions without a valid thread target", async () => {
    const workspace = makeWorkspace({ connected: true });
    const workspacesById = new Map([[workspace.id, workspace]]);

    const refreshWorkspaces = vi.fn(async () => [workspace]);
    const connectWorkspace = vi.fn(async () => {});
    const openThreadLink = vi.fn();

    renderHook(() =>
      useSystemNotificationThreadLinks({
        hasLoadedWorkspaces: true,
        workspacesById,
        refreshWorkspaces,
        connectWorkspace,
        openThreadLink,
      }),
    );

    await waitFor(() => expect(notificationMocks.onAction).toHaveBeenCalledTimes(1));

    await act(async () => {
      actionHandler?.({ extra: { kind: "thread", workspaceId: "ws-1" } });
      await Promise.resolve();
    });

    expect(openThreadLink).not.toHaveBeenCalled();
  });

  it("restores the main window after an update notification action", async () => {
    const workspace = makeWorkspace();

    renderHook(() =>
      useSystemNotificationThreadLinks({
        hasLoadedWorkspaces: true,
        workspacesById: new Map([[workspace.id, workspace]]),
        refreshWorkspaces: vi.fn(async () => [workspace]),
        connectWorkspace: vi.fn(async () => {}),
        openThreadLink: vi.fn(),
      }),
    );

    await waitFor(() => expect(notificationMocks.onAction).toHaveBeenCalledTimes(1));

    await act(async () => {
      actionHandler?.({ extra: { kind: "update_available", version: "1.2.3" } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(windowMocks.show).toHaveBeenCalledTimes(1);
    expect(windowMocks.unminimize).toHaveBeenCalledTimes(1);
    expect(windowMocks.setFocus).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedSession } from "@/types";

const { managerMock, fetchPreviewMock } = vi.hoisted(() => ({
  managerMock: { indexedSessions: [] as ManagedSession[], sessions: [] as ManagedSession[] },
  fetchPreviewMock: vi.fn(),
}));

vi.mock("../hooks/useSessionManager", () => ({
  useSessionManager: () => managerMock,
}));

vi.mock("@services/tauri", () => ({
  fetchManagedSessionPreview: fetchPreviewMock,
}));

import { SessionManagerProvider, useSessionManagerContext } from "./SessionManagerContext";

afterEach(cleanup);

beforeEach(() => {
  managerMock.indexedSessions = [];
  managerMock.sessions = [];
  fetchPreviewMock.mockReset();
});

const session: ManagedSession = {
  key: "source:thread",
  sourceId: "source",
  threadId: "thread",
  sourceKind: "codex",
  cwd: "D:\\Project\\B",
  title: "B session",
  preview: null,
  createdAt: null,
  updatedAt: null,
  archivedAt: null,
  isArchived: false,
  parentThreadId: null,
  isSubagent: false,
  subagentNickname: null,
  subagentRole: null,
  projectExists: true,
  fileStatus: "mapped",
  fileConfidence: "exact",
};

function Probe() {
  const context = useSessionManagerContext();
  return <>
    <button type="button" onClick={() => void context.resumeSession(session)}>resume</button>
    <button type="button" onClick={context.migrateToCurrentProject}>migrate</button>
    <span>{context.pendingResumeSession?.title ?? "none"}</span>
  </>;
}

function PreviewProbe() {
  const context = useSessionManagerContext();
  return <>
    <span>{context.focusedSession?.title ?? "no focus"}</span>
    <span>{context.sessionPreview?.items[0]?.text ?? "no preview"}</span>
  </>;
}

describe("SessionManagerProvider", () => {
  it("focuses the first visible session and loads its latest preview", async () => {
    managerMock.indexedSessions = [session];
    managerMock.sessions = [session];
    fetchPreviewMock.mockResolvedValue({
      openingMessage: "opening",
      items: [{ role: "assistant", text: "latest result" }],
      incomplete: false,
    });

    render(<SessionManagerProvider active onActiveChange={vi.fn()} onResumeSession={vi.fn()} onDeriveSession={vi.fn()}><PreviewProbe /></SessionManagerProvider>);

    expect(screen.getByText("B session")).toBeTruthy();
    expect(await screen.findByText("latest result")).toBeTruthy();
    expect(fetchPreviewMock).toHaveBeenCalledWith({
      sourceId: "source",
      threadId: "thread",
      limit: 6,
    });
  });

  it("resumes directly when the current project matches", async () => {
    const onResumeSession = vi.fn(async () => false);
    render(<SessionManagerProvider active onActiveChange={vi.fn()} onResumeSession={onResumeSession} onDeriveSession={vi.fn()} currentWorkspace={{ name: "B", path: "d:/project/b/" }}><Probe /></SessionManagerProvider>);

    fireEvent.click(screen.getByRole("button", { name: "resume" }));

    await waitFor(() => expect(onResumeSession).toHaveBeenCalledWith(session));
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("offers migration when the current project differs", async () => {
    const onResumeSession = vi.fn(async () => false);
    const onDeriveSession = vi.fn();
    render(<SessionManagerProvider active onActiveChange={vi.fn()} onResumeSession={onResumeSession} onDeriveSession={onDeriveSession} currentWorkspace={{ name: "A", path: "D:\\Project\\A" }}><Probe /></SessionManagerProvider>);

    fireEvent.click(screen.getByRole("button", { name: "resume" }));

    expect(await screen.findByText("B session")).toBeTruthy();
    expect(onResumeSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "migrate" }));
    expect(onDeriveSession).toHaveBeenCalledWith(session);
  });
});

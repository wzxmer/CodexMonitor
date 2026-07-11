// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedSession } from "@/types";

vi.mock("../hooks/useSessionManager", () => ({
  useSessionManager: () => ({ indexedSessions: [], sessions: [] }),
}));

import { SessionManagerProvider, useSessionManagerContext } from "./SessionManagerContext";

afterEach(cleanup);

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

describe("SessionManagerProvider", () => {
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

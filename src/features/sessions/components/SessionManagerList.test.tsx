// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedSession, SessionSource } from "@/types";
import { SessionManagerList } from "./SessionManagerList";

afterEach(cleanup);

const source: SessionSource = { id: "source-a", name: "Primary", codexHomePath: "C:/Users/test/.codex", enabled: true, isCurrent: true, isDefault: true, discoveredAt: 1, lastScanAt: null, status: "ready", error: null };
const managedSession: ManagedSession = { key: "source-a:thread-a", sourceId: "source-a", threadId: "thread-a", sourceKind: "cli", cwd: "C:/missing/project", title: "Archived child", preview: null, createdAt: 1, updatedAt: 2, archivedAt: 2, isArchived: true, parentThreadId: "parent", isSubagent: true, subagentNickname: "worker", subagentRole: null, projectExists: false, fileStatus: "mapped", fileConfidence: "exact" };

describe("SessionManagerList", () => {
  it("renders source, archive, missing-project, and subagent metadata", () => {
    const onToggleSelected = vi.fn();
    render(<SessionManagerList sessions={[managedSession]} sources={[source]} selected={new Set()} resumingKey={null} archivingKeys={new Set()} loading={false} loadingMore={false} error={null} hasMore={false} onToggleSelected={onToggleSelected} onResume={vi.fn()} onArchive={vi.fn()} onDerive={vi.fn()} onLoadMore={vi.fn()} />);
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(screen.getByText("已归档")).toBeTruthy();
    expect(screen.getByText("项目缺失")).toBeTruthy();
    expect(screen.getByText("worker")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "选择 Archived child" }));
    expect(onToggleSelected).toHaveBeenCalledWith("source-a:thread-a");
  });

  it("resumes a restorable session without toggling selection", () => {
    const onToggleSelected = vi.fn();
    const onResume = vi.fn();
    const restorable = { ...managedSession, projectExists: true, cwd: "C:/project" };
    render(<SessionManagerList sessions={[restorable]} sources={[source]} selected={new Set()} resumingKey={null} archivingKeys={new Set()} loading={false} loadingMore={false} error={null} hasMore={false} onToggleSelected={onToggleSelected} onResume={onResume} onArchive={vi.fn()} onDerive={vi.fn()} onLoadMore={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(onResume).toHaveBeenCalledWith(restorable);
    expect(onToggleSelected).not.toHaveBeenCalled();
  });

  it("archives an active row but disables archived rows", () => {
    const onArchive = vi.fn();
    const active = { ...managedSession, isArchived: false, archivedAt: null };
    render(<SessionManagerList sessions={[active]} sources={[source]} selected={new Set()} resumingKey={null} archivingKeys={new Set()} loading={false} loadingMore={false} error={null} hasMore={false} onToggleSelected={vi.fn()} onResume={vi.fn()} onArchive={onArchive} onDerive={vi.fn()} onLoadMore={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "归档" }));
    expect(onArchive).toHaveBeenCalledWith(active);
    cleanup();
    render(<SessionManagerList sessions={[managedSession]} sources={[source]} selected={new Set()} resumingKey={null} archivingKeys={new Set()} loading={false} loadingMore={false} error={null} hasMore={false} onToggleSelected={vi.fn()} onResume={vi.fn()} onArchive={onArchive} onDerive={vi.fn()} onLoadMore={vi.fn()} />);
    expect((screen.getByRole("button", { name: "归档" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("derives one session without changing selection", () => {
    const onDerive = vi.fn();
    render(<SessionManagerList sessions={[managedSession]} sources={[source]} selected={new Set()} resumingKey={null} archivingKeys={new Set()} loading={false} loadingMore={false} error={null} hasMore={false} onToggleSelected={vi.fn()} onResume={vi.fn()} onArchive={vi.fn()} onDerive={onDerive} onLoadMore={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "派生" }));
    expect(onDerive).toHaveBeenCalledWith(managedSession);
  });
});

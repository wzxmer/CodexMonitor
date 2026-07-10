// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedSession, SessionSource } from "@/types";
import { useSessionManager } from "./useSessionManager";

const listSessionSources = vi.fn();
const scanManagedSessions = vi.fn();
const fetchManagedSessionsPage = vi.fn();
const cancelSessionTask = vi.fn();
const searchManagedSessions = vi.fn();
const fetchSessionSearchResults = vi.fn();
const archiveManagedSessions = vi.fn();

vi.mock("@services/tauri", () => ({
  listSessionSources: (...args: unknown[]) => listSessionSources(...args),
  scanManagedSessions: (...args: unknown[]) => scanManagedSessions(...args),
  fetchManagedSessionsPage: (...args: unknown[]) => fetchManagedSessionsPage(...args),
  cancelSessionTask: (...args: unknown[]) => cancelSessionTask(...args),
  searchManagedSessions: (...args: unknown[]) => searchManagedSessions(...args),
  fetchSessionSearchResults: (...args: unknown[]) => fetchSessionSearchResults(...args),
  archiveManagedSessions: (...args: unknown[]) => archiveManagedSessions(...args),
}));

const source: SessionSource = {
  id: "source-a",
  name: "Primary",
  codexHomePath: "C:/Users/test/.codex",
  enabled: true,
  isCurrent: true,
  isDefault: true,
  discoveredAt: 1,
  lastScanAt: null,
  status: "ready",
  error: null,
};

function session(overrides: Partial<ManagedSession>): ManagedSession {
  return {
    key: "source-a:thread-a",
    sourceId: "source-a",
    threadId: "thread-a",
    sourceKind: "cli",
    cwd: "C:/projects/alpha",
    title: "Alpha",
    preview: null,
    createdAt: 1,
    updatedAt: 2,
    archivedAt: null,
    isArchived: false,
    parentThreadId: null,
    isSubagent: false,
    subagentNickname: null,
    subagentRole: null,
    projectExists: true,
    fileStatus: "mapped",
    fileConfidence: "exact",
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

cancelSessionTask.mockResolvedValue(undefined);

describe("useSessionManager", () => {
  it("keeps filters local and hides subagents by default", async () => {
    listSessionSources.mockResolvedValue([source]);
    scanManagedSessions.mockResolvedValue({ requestId: "scan", totalSessions: 3, diagnosticCount: 0, cancelled: false });
    fetchManagedSessionsPage.mockResolvedValue({
      requestId: "scan",
      items: [
        session({}),
        session({ key: "source-a:archived", threadId: "archived", title: "Archived", isArchived: true }),
        session({ key: "source-a:child", threadId: "child", title: "Z", isSubagent: true }),
      ],
      diagnostics: [],
      total: 3,
      nextOffset: null,
    });

    const { result } = renderHook(() => useSessionManager(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions.map((item) => item.title)).toEqual(["Alpha", "Archived"]);

    act(() => result.current.setStatusFilter("archived"));
    expect(result.current.sessions.map((item) => item.title)).toEqual(["Archived"]);
    act(() => result.current.setShowSubagents(true));
    act(() => result.current.setStatusFilter("all"));
    act(() => result.current.setQuery("z"));
    expect(result.current.sessions.map((item) => item.title)).toEqual(["Z"]);
  });

  it("loads the next page and cancels when disabled", async () => {
    listSessionSources.mockResolvedValue([source]);
    scanManagedSessions.mockResolvedValue({ requestId: "scan", totalSessions: 2, diagnosticCount: 0, cancelled: false });
    fetchManagedSessionsPage
      .mockResolvedValueOnce({ requestId: "scan", items: [session({})], diagnostics: [], total: 2, nextOffset: 1 })
      .mockResolvedValueOnce({ requestId: "scan", items: [session({ key: "source-a:thread-b", threadId: "thread-b", title: "Beta" })], diagnostics: [], total: 2, nextOffset: null });

    const { result, rerender } = renderHook(({ enabled }) => useSessionManager(enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.nextOffset).toBe(1));
    await act(async () => result.current.loadMore());
    expect(result.current.sessions.map((item) => item.title)).toEqual(["Alpha", "Beta"]);

    rerender({ enabled: false });
    await waitFor(() => expect(cancelSessionTask).toHaveBeenCalled());
  });
  it("starts content search at two characters and cancels stale queries", async () => {
    listSessionSources.mockResolvedValue([source]);
    scanManagedSessions.mockResolvedValue({ requestId: "scan", totalSessions: 1, diagnosticCount: 0, cancelled: false });
    fetchManagedSessionsPage.mockResolvedValue({ requestId: "scan", items: [session({})], diagnostics: [], total: 1, nextOffset: null });
    searchManagedSessions.mockResolvedValue({ requestId: "search", scannedSources: 0, totalSources: 1, scannedFiles: 0, totalFiles: 1, completed: false, cancelled: false, incomplete: false });
    fetchSessionSearchResults.mockResolvedValue({
      results: [{ session: session({ title: "Content match" }), matches: [{ field: "userMessage", snippet: "needle" }], incomplete: false }],
      progress: { requestId: "search", scannedSources: 1, totalSources: 1, scannedFiles: 1, totalFiles: 1, completed: true, cancelled: false, incomplete: false },
    });

    const { result } = renderHook(() => useSessionManager(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setQuery("n"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(searchManagedSessions).not.toHaveBeenCalled();

    act(() => result.current.setQuery("ne"));
    act(() => result.current.setQuery("needle"));
    await waitFor(() => expect(searchManagedSessions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.sessions[0]?.title).toBe("Content match"));
    expect(result.current.sessions[0]?.preview).toBe("needle");
    expect(cancelSessionTask.mock.calls.some(([requestId]) => String(requestId).startsWith("session-search-"))).toBe(true);
  });

  it("refreshes successful archives and keeps failed items selected", async () => {
    const second = session({ key: "source-a:thread-b", threadId: "thread-b", title: "Beta" });
    listSessionSources.mockResolvedValue([source]);
    scanManagedSessions.mockResolvedValue({ requestId: "scan", totalSessions: 2, diagnosticCount: 0, cancelled: false });
    fetchManagedSessionsPage
      .mockResolvedValueOnce({ requestId: "scan", items: [session({}), second], diagnostics: [], total: 2, nextOffset: null })
      .mockResolvedValueOnce({ requestId: "scan-next", items: [second], diagnostics: [], total: 1, nextOffset: null });
    archiveManagedSessions.mockResolvedValue({
      results: [
        { sourceId: "source-a", threadId: "thread-a", success: true, archivedAt: 10, error: null },
        { sourceId: "source-a", threadId: "thread-b", success: false, archivedAt: null, error: "failed" },
      ],
      successCount: 1,
      failureCount: 1,
    });

    const { result } = renderHook(() => useSessionManager(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.toggleSelected("source-a:thread-a"));
    act(() => result.current.toggleSelected("source-a:thread-b"));
    await act(async () => {
      await result.current.archiveSessions(result.current.sessions);
    });

    expect(archiveManagedSessions).toHaveBeenCalledWith({
      items: [
        { sourceId: "source-a", threadId: "thread-a" },
        { sourceId: "source-a", threadId: "thread-b" },
      ],
    });
    expect(result.current.archiveResult?.failureCount).toBe(1);
    expect([...result.current.selectedSessionKeys]).toEqual(["source-a:thread-b"]);
  });
});

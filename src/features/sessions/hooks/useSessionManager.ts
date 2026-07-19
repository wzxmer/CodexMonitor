import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveManagedSessionsResponse, ManagedSession, SessionScanDiagnostic, SessionSearchProgress, SessionSearchResult, SessionSource } from "@/types";
import { archiveManagedSessions, cancelSessionTask, fetchManagedSessionsPage, fetchSessionSearchResults, listSessionSources, permanentlyDeleteManagedSession, scanManagedSessions, searchManagedSessions } from "@services/tauri";

const PAGE_LIMIT = 100;
const CONTENT_SEARCH_DELAY_MS = 250;

export type SessionManagerStatusFilter = "all" | "active" | "archived" | "missing";

export function useSessionManager(enabled: boolean) {
  const [sources, setSources] = useState<SessionSource[]>([]);
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [totalSessionCount, setTotalSessionCount] = useState(0);
  const [diagnostics, setDiagnostics] = useState<SessionScanDiagnostic[]>([]);
  const [query, setQuery] = useState("");
  const [showSubagents, setShowSubagents] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SessionManagerStatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedSessionKeys, setSelectedSessionKeys] = useState<Set<string>>(new Set());
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollOffsetRef = useRef(0);
  const [searchResults, setSearchResults] = useState<SessionSearchResult[] | null>(null);
  const [searchProgress, setSearchProgress] = useState<SessionSearchProgress | null>(null);
  const [archiveResult, setArchiveResult] = useState<ArchiveManagedSessionsResponse | null>(null);
  const [archivingKeys, setArchivingKeys] = useState<Set<string>>(new Set());
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const scanRequestIdRef = useRef<string | null>(null);
  const searchRequestIdRef = useRef<string | null>(null);
  const getScrollOffset = useCallback(() => scrollOffsetRef.current, []);
  const setScrollOffset = useCallback((offset: number) => {
    scrollOffsetRef.current = offset;
  }, []);

  const refresh = useCallback(async () => {
    const previousRequestId = scanRequestIdRef.current;
    if (previousRequestId) void cancelSessionTask(previousRequestId).catch(() => {});
    const requestId = `session-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    scanRequestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setSearchResults(null);
    setSearchProgress(null);
    try {
      const [nextSources] = await Promise.all([
        listSessionSources(),
        scanManagedSessions({ requestId }),
      ]);
      if (scanRequestIdRef.current !== requestId) return;
      setSources(nextSources);
      const page = await fetchManagedSessionsPage({ requestId, offset: 0, limit: PAGE_LIMIT });
      if (scanRequestIdRef.current !== requestId) return;
      setSessions(page.items);
      setTotalSessionCount(page.total);
      setDiagnostics(page.diagnostics);
      setNextOffset(page.nextOffset);
      setSelectedSessionKeys(new Set());
    } catch (caught) {
      if (scanRequestIdRef.current === requestId) setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (scanRequestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    return () => {
      for (const requestId of [scanRequestIdRef.current, searchRequestIdRef.current]) {
        if (requestId) void cancelSessionTask(requestId).catch(() => {});
      }
    };
  }, [enabled, refresh]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const previousRequestId = searchRequestIdRef.current;
    if (previousRequestId) {
      void cancelSessionTask(previousRequestId).catch(() => {});
      searchRequestIdRef.current = null;
    }
    setSearchResults(null);
    setSearchProgress(null);
    if (!enabled || loading || normalizedQuery.length < 2 || sessions.length === 0) return;

    const requestId = `session-search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    searchRequestIdRef.current = requestId;
    const timer = window.setTimeout(async () => {
      setSearchProgress({ requestId, scannedSources: 0, totalSources: sourceFilter === "all" ? sources.length : 1, scannedFiles: 0, totalFiles: null, completed: false, cancelled: false, incomplete: false });
      try {
        const progress = await searchManagedSessions({
          requestId,
          query: normalizedQuery,
          sourceIds: sourceFilter === "all" ? [] : [sourceFilter],
          includeArchived: statusFilter !== "active",
          includeSubagents: showSubagents,
        });
        if (searchRequestIdRef.current !== requestId) return;
        setSearchProgress(progress);
        while (searchRequestIdRef.current === requestId) {
          const response = await fetchSessionSearchResults(requestId);
          if (searchRequestIdRef.current !== requestId) return;
          setSearchResults(response.results);
          setSearchProgress(response.progress);
          if (response.progress.completed || response.progress.cancelled) break;
          await new Promise((resolve) => window.setTimeout(resolve, 75));
        }
      } catch (caught) {
        if (searchRequestIdRef.current === requestId) setError(caught instanceof Error ? caught.message : String(caught));
      }
    }, CONTENT_SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, loading, query, sessions.length, showSubagents, sourceFilter, sources.length, statusFilter]);

  const loadMore = useCallback(async () => {
    const requestId = scanRequestIdRef.current;
    if (!requestId || nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchManagedSessionsPage({ requestId, offset: nextOffset, limit: PAGE_LIMIT });
      if (scanRequestIdRef.current !== requestId) return;
      setSessions((current) => {
        const seen = new Set(current.map((session) => session.key));
        const additions = page.items.filter((session) => {
          if (seen.has(session.key)) return false;
          seen.add(session.key);
          return true;
        });
        return [...current, ...additions];
      });
      setNextOffset(page.nextOffset);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextOffset]);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const candidates = searchResults?.map((result) => ({
      ...result.session,
      preview: result.matches.find((match) => match.field === "userMessage" || match.field === "agentReply")?.snippet ?? result.session.preview,
    })) ?? sessions;
    return candidates.filter((session) => {
      if (!showSubagents && session.isSubagent) return false;
      if (sourceFilter !== "all" && session.sourceId !== sourceFilter) return false;
      if (statusFilter === "active" && session.isArchived) return false;
      if (statusFilter === "archived" && !session.isArchived) return false;
      if (statusFilter === "missing" && session.projectExists) return false;
      if (!normalizedQuery || searchResults) return true;
      return [session.title, session.threadId, session.cwd ?? "", session.sourceKind ?? ""].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [query, searchResults, sessions, showSubagents, sourceFilter, statusFilter]);

  const toggleSelected = useCallback((key: string) => {
    setSelectedSessionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const selectSingle = useCallback((key: string) => {
    setSelectedSessionKeys((current) =>
      current.size === 1 && current.has(key) ? current : new Set([key]),
    );
  }, []);

  const archiveSessions = useCallback(async (targets: ManagedSession[]) => {
    const archiveable = targets.filter((session) => !session.isArchived);
    if (archiveable.length === 0) return null;
    const keys = new Set(archiveable.map((session) => session.key));
    setArchivingKeys(keys);
    setError(null);
    try {
      const response = await archiveManagedSessions({
        items: archiveable.map((session) => ({
          sourceId: session.sourceId,
          threadId: session.threadId,
        })),
      });
      setArchiveResult(response);
      const failedKeys = new Set(
        response.results
          .filter((result) => !result.success)
          .map((result) => `${result.sourceId}:${result.threadId}`),
      );
      if (response.successCount > 0) {
        await refresh();
        setSelectedSessionKeys(failedKeys);
      }
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setArchivingKeys(new Set());
    }
  }, [refresh]);

  const permanentlyDeleteSession = useCallback(async (session: ManagedSession, cascadeRequested: boolean) => {
    if (!session.isArchived || session.archivedAt == null) return null;
    setDeletingKeys(new Set([session.key]));
    setError(null);
    try {
      const response = await permanentlyDeleteManagedSession({ sourceId: session.sourceId, threadId: session.threadId, archivedAt: session.archivedAt, cascadeRequested });
      const deleteError = response.results.find((result) => result.error)?.error;
      if (deleteError) setError(deleteError);
      await refresh();
      setSelectedSessionKeys(new Set());
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setDeletingKeys(new Set());
    }
  }, [refresh]);

  const permanentlyDeleteSessions = useCallback(async (targets: ManagedSession[], cascadeRequested: boolean) => {
    const activeTargets = targets.filter((session) => !session.isArchived);
    const readyToDelete = targets.filter((session) => session.isArchived && session.archivedAt != null);
    const archiveFailedKeys = new Set<string>();
    if (activeTargets.length > 0) {
      const archiveResponse = await archiveSessions(activeTargets);
      if (!archiveResponse) return null;
      archiveResponse.results.forEach((result) => {
        const session = activeTargets.find((candidate) => candidate.sourceId === result.sourceId && candidate.threadId === result.threadId);
        if (session && result.success && result.archivedAt != null) {
          readyToDelete.push({ ...session, isArchived: true, archivedAt: result.archivedAt });
        } else if (session) {
          archiveFailedKeys.add(session.key);
        }
      });
    }
    if (readyToDelete.length === 0) return null;
    const readyTargetKeys = new Set(
      readyToDelete.map((session) => `${session.sourceId}:${session.threadId}`),
    );
    const deleteRequests = cascadeRequested
      ? readyToDelete.filter((session) => (
        !session.parentThreadId ||
        !readyTargetKeys.has(`${session.sourceId}:${session.parentThreadId}`)
      ))
      : readyToDelete;
    setDeletingKeys(new Set(readyToDelete.map((session) => session.key)));
    setError(null);
    try {
      const settledResponses = await Promise.allSettled(deleteRequests.map((session) => permanentlyDeleteManagedSession({
        sourceId: session.sourceId,
        threadId: session.threadId,
        archivedAt: session.archivedAt as number,
        cascadeRequested,
      })));
      const responses = settledResponses.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
      const results = responses.flatMap((response) => response.results);
      settledResponses.forEach((item, index) => {
        if (item.status === "rejected") {
          const session = deleteRequests[index];
          results.push({
            sourceId: session.sourceId,
            threadId: session.threadId,
            success: false,
            error: item.reason instanceof Error ? item.reason.message : String(item.reason),
          });
        }
      });
      const response = {
        results,
        successCount: responses.reduce((count, item) => count + item.successCount, 0),
        failureCount: responses.reduce((count, item) => count + item.failureCount, 0) + settledResponses.filter((item) => item.status === "rejected").length,
      };
      const failure = results.find((result) => result.error)?.error;
      await refresh();
      if (failure) setError(failure);
      setSelectedSessionKeys(new Set([
        ...archiveFailedKeys,
        ...results.filter((result) => !result.success).map((result) => `${result.sourceId}:${result.threadId}`),
      ]));
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setDeletingKeys(new Set());
    }
  }, [archiveSessions, refresh]);

  const getPermanentDeleteChildCount = useCallback(async (session: ManagedSession) => {
    try {
      const requestId = scanRequestIdRef.current;
      let allSessions = sessions;
      let offset = nextOffset;
      while (requestId && offset !== null) {
        const page = await fetchManagedSessionsPage({ requestId, offset, limit: PAGE_LIMIT });
        allSessions = [...allSessions, ...page.items];
        offset = page.nextOffset;
      }
      if (allSessions.length !== sessions.length) {
        setSessions(allSessions);
        setNextOffset(null);
      }
      return allSessions.filter((candidate) => candidate.sourceId === session.sourceId && candidate.parentThreadId === session.threadId).length;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    }
  }, [nextOffset, sessions]);

  return { sources, sessions: filteredSessions, indexedSessions: sessions, totalSessionCount, diagnostics, query, setQuery, showSubagents, setShowSubagents, statusFilter, setStatusFilter, sourceFilter, setSourceFilter, selectedSessionKeys, toggleSelected, selectSingle, nextOffset: query.trim().length >= 2 ? null : nextOffset, loading, loadingMore, error, refresh, loadMore, getScrollOffset, setScrollOffset, searchProgress, archiveResult, dismissArchiveResult: () => setArchiveResult(null), archivingKeys, archiveSessions, deletingKeys, permanentlyDeleteSession, permanentlyDeleteSessions, getPermanentDeleteChildCount };
}

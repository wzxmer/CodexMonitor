import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ManagedSession } from "@/types";
import { useSessionManager } from "../hooks/useSessionManager";

type SessionManagerState = ReturnType<typeof useSessionManager>;

type SessionManagerContextValue = {
  active: boolean;
  setActive: (active: boolean) => void;
  manager: SessionManagerState;
  focusedSessionKey: string | null;
  focusedSession: ManagedSession | null;
  focusSession: (session: ManagedSession) => void;
  resumingKey: string | null;
  resumeSession: (session: ManagedSession) => Promise<void>;
  pendingResumeSession: ManagedSession | null;
  currentWorkspace: { name: string; path: string } | null;
  resumeInOriginalProject: () => Promise<void>;
  migrateToCurrentProject: () => void;
  cancelResumeChoice: () => void;
  deriveSession: (session: ManagedSession) => void;
};

const SessionManagerContext = createContext<SessionManagerContextValue | null>(null);

type Props = {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  onResumeSession: (session: ManagedSession) => Promise<boolean>;
  onDeriveSession: (session: ManagedSession) => void;
  currentWorkspace?: { name: string; path: string } | null;
  children: ReactNode;
};

function normalizeProjectPath(path: string | null | undefined) {
  return (path ?? "").trim().replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
}

export function SessionManagerProvider({ active, onActiveChange, onResumeSession, onDeriveSession, currentWorkspace = null, children }: Props) {
  const manager = useSessionManager(active);
  const [focusedSessionKey, setFocusedSessionKey] = useState<string | null>(null);
  const [resumingKey, setResumingKey] = useState<string | null>(null);
  const [pendingResumeSession, setPendingResumeSession] = useState<ManagedSession | null>(null);
  const focusedSession = useMemo(
    () => manager.indexedSessions.find((session) => session.key === focusedSessionKey) ?? manager.sessions[0] ?? null,
    [focusedSessionKey, manager.indexedSessions, manager.sessions],
  );
  const focusSession = useCallback((session: ManagedSession) => setFocusedSessionKey(session.key), []);
  const resumeDirectly = useCallback(async (session: ManagedSession) => {
    setResumingKey(session.key);
    try {
      const resumed = await onResumeSession(session);
      if (resumed) onActiveChange(false);
    } finally {
      setResumingKey(null);
    }
  }, [onActiveChange, onResumeSession]);
  const resumeSession = useCallback(async (session: ManagedSession) => {
    const sourcePath = normalizeProjectPath(session.cwd);
    const destinationPath = normalizeProjectPath(currentWorkspace?.path);
    if (sourcePath && destinationPath && sourcePath !== destinationPath) {
      setPendingResumeSession(session);
      return;
    }
    await resumeDirectly(session);
  }, [currentWorkspace?.path, resumeDirectly]);
  const resumeInOriginalProject = useCallback(async () => {
    if (!pendingResumeSession) return;
    const session = pendingResumeSession;
    setPendingResumeSession(null);
    await resumeDirectly(session);
  }, [pendingResumeSession, resumeDirectly]);
  const migrateToCurrentProject = useCallback(() => {
    if (!pendingResumeSession) return;
    const session = pendingResumeSession;
    setPendingResumeSession(null);
    onDeriveSession(session);
  }, [onDeriveSession, pendingResumeSession]);

  const value = useMemo<SessionManagerContextValue>(() => ({
    active,
    setActive: onActiveChange,
    manager,
    focusedSessionKey: focusedSession?.key ?? null,
    focusedSession,
    focusSession,
    resumingKey,
    resumeSession,
    pendingResumeSession,
    currentWorkspace,
    resumeInOriginalProject,
    migrateToCurrentProject,
    cancelResumeChoice: () => setPendingResumeSession(null),
    deriveSession: onDeriveSession,
  }), [active, currentWorkspace, focusSession, focusedSession, manager, migrateToCurrentProject, onActiveChange, onDeriveSession, pendingResumeSession, resumeInOriginalProject, resumeSession, resumingKey]);

  return <SessionManagerContext.Provider value={value}>{children}</SessionManagerContext.Provider>;
}

export function useSessionManagerContext() {
  const value = useContext(SessionManagerContext);
  if (!value) throw new Error("useSessionManagerContext must be used within SessionManagerProvider");
  return value;
}

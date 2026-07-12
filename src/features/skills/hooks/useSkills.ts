import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DebugEntry,
  SkillOption,
  WorkflowAgentOption,
  WorkspaceInfo,
} from "../../../types";
import { getSkillsList } from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import { isSkillsUpdateAvailableEvent } from "../../../utils/appServerEvents";

type UseSkillsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

const WORKFLOW_CAPABILITIES = new Set([
  "tool_calling",
  "structured_output",
  "parallel_tools",
  "streaming",
  "vision",
  "long_context",
  "file_access",
  "shell_access",
]);

const PROVIDER_KINDS = new Set([
  "openai",
  "deepseek",
  "openrouter",
  "opencode",
  "custom",
]);

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function capabilityArray(value: unknown) {
  return stringArray(value)?.filter((item) => WORKFLOW_CAPABILITIES.has(item)) as
    | SkillOption["capabilityRequirements"]
    | undefined;
}

function providerKindArray(value: unknown) {
  return stringArray(value)?.filter((item) => PROVIDER_KINDS.has(item)) as
    | SkillOption["providerKinds"]
    | undefined;
}

function parseSkillOption(item: any): SkillOption {
  const scope = ["public", "provider", "model"].includes(item.scope)
    ? item.scope
    : "public";
  return {
    name: String(item.name ?? ""),
    path: String(item.path ?? ""),
    description: item.description ? String(item.description) : undefined,
    scope,
    providerKinds: providerKindArray(item.providerKinds ?? item.provider_kinds),
    modelPatterns: stringArray(item.modelPatterns ?? item.model_patterns),
    triggerKeywords: stringArray(item.triggerKeywords ?? item.trigger_keywords),
    capabilityRequirements: capabilityArray(
      item.capabilityRequirements ?? item.capability_requirements,
    ),
    fallback: item.fallback ? String(item.fallback) : undefined,
    priority: Number.isFinite(item.priority) ? Number(item.priority) : undefined,
    trustLevel: ["trusted", "prompt", "untrusted"].includes(
      item.trustLevel ?? item.trust_level,
    )
      ? (item.trustLevel ?? item.trust_level)
      : undefined,
    source: ["global", "user", "project", "native"].includes(item.source)
      ? item.source
      : undefined,
    instructions:
      typeof item.instructions === "string" ? item.instructions : undefined,
  };
}

function parseAgentOption(item: any): WorkflowAgentOption {
  const scope = ["public", "provider", "model"].includes(item.scope)
    ? item.scope
    : "public";
  return {
    name: String(item.name ?? ""),
    path: String(item.path ?? ""),
    description: item.description ? String(item.description) : undefined,
    scope,
    providerKinds: providerKindArray(item.providerKinds ?? item.provider_kinds),
    modelPatterns: stringArray(item.modelPatterns ?? item.model_patterns),
    capabilityRequirements: capabilityArray(
      item.capabilityRequirements ?? item.capability_requirements,
    ),
    triggerKeywords: stringArray(item.triggerKeywords ?? item.trigger_keywords),
    fallback: item.fallback ? String(item.fallback) : undefined,
    priority: Number.isFinite(item.priority) ? Number(item.priority) : undefined,
    trustLevel: ["trusted", "prompt", "untrusted"].includes(
      item.trustLevel ?? item.trust_level,
    )
      ? (item.trustLevel ?? item.trust_level)
      : undefined,
    source: ["global", "user", "project", "native"].includes(item.source)
      ? item.source
      : undefined,
    developerInstructions:
      typeof (item.developerInstructions ?? item.developer_instructions) === "string"
        ? (item.developerInstructions ?? item.developer_instructions)
        : undefined,
  };
}

export function useSkills({ activeWorkspace, onDebug }: UseSkillsOptions) {
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [agents, setAgents] = useState<WorkflowAgentOption[]>([]);
  const [registryFingerprint, setRegistryFingerprint] = useState<string | null>(null);
  const [registryErrors, setRegistryErrors] = useState<string[]>([]);
  const [registryCacheHit, setRegistryCacheHit] = useState(false);
  const [registryRefreshing, setRegistryRefreshing] = useState(false);
  const [registryRefreshError, setRegistryRefreshError] = useState<string | null>(null);
  const [registryLastRefreshAtMs, setRegistryLastRefreshAtMs] = useState<number | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlightWorkspaceIds = useRef(new Set<string>());
  const activeWorkspaceIdRef = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);
  activeWorkspaceIdRef.current = workspaceId;

  const refreshSkills = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlightWorkspaceIds.current.has(workspaceId)) {
      return;
    }
    inFlightWorkspaceIds.current.add(workspaceId);
    setRegistryRefreshing(true);
    setRegistryRefreshError(null);
    onDebug?.({
      id: `${Date.now()}-client-skills-list`,
      timestamp: Date.now(),
      source: "client",
      label: "skills/list",
      payload: { workspaceId },
    });
    try {
      const response = await getSkillsList(workspaceId);
      if (activeWorkspaceIdRef.current !== workspaceId) {
        return;
      }
      onDebug?.({
        id: `${Date.now()}-server-skills-list`,
        timestamp: Date.now(),
        source: "server",
        label: "skills/list response",
        payload: response,
      });
      const dataBuckets = response.result?.data ?? response.data ?? [];
      const rawSkills =
        response.result?.skills ??
        response.skills ??
        (Array.isArray(dataBuckets)
          ? dataBuckets.flatMap((bucket: any) => bucket?.skills ?? [])
          : []);
      const registry = response.cmRegistry ?? response.result?.cmRegistry ?? null;
      const registrySkills = Array.isArray(registry?.skills) ? registry.skills : [];
      const skillsByName = new Map<string, SkillOption>();
      rawSkills.map(parseSkillOption).forEach((skill: SkillOption) => {
        skillsByName.set(skill.name.trim().toLocaleLowerCase(), skill);
      });
      registrySkills.map(parseSkillOption).forEach((skill: SkillOption) => {
        skillsByName.set(skill.name.trim().toLocaleLowerCase(), skill);
      });
      const data = [...skillsByName.values()];
      setSkills(data);
      setAgents(
        (Array.isArray(registry?.agents) ? registry.agents : [])
          .map(parseAgentOption)
          .filter((agent: WorkflowAgentOption) => agent.name),
      );
      setRegistryFingerprint(
        typeof registry?.fingerprint === "string" ? registry.fingerprint : null,
      );
      setRegistryErrors(stringArray(registry?.errors) ?? []);
      setRegistryCacheHit(Boolean(registry?.cacheHit));
      setRegistryLastRefreshAtMs(Date.now());
      lastFetchedWorkspaceId.current = workspaceId;
    } catch (error) {
      if (activeWorkspaceIdRef.current !== workspaceId) {
        return;
      }
      setRegistryRefreshError(error instanceof Error ? error.message : String(error));
      onDebug?.({
        id: `${Date.now()}-client-skills-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "skills/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlightWorkspaceIds.current.delete(workspaceId);
      setRegistryRefreshing(inFlightWorkspaceIds.current.size > 0);
    }
  }, [isConnected, onDebug, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && skills.length > 0) {
      return;
    }
    refreshSkills();
  }, [isConnected, refreshSkills, skills.length, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }

    return subscribeAppServerEvents((event) => {
      if (event.workspace_id !== workspaceId) {
        return;
      }
      if (!isSkillsUpdateAvailableEvent(event)) {
        return;
      }

      onDebug?.({
        id: `${Date.now()}-server-skills-update-available`,
        timestamp: Date.now(),
        source: "server",
        label: "skills/update available",
        payload: event,
      });
      void refreshSkills();
    });
  }, [isConnected, onDebug, refreshSkills, workspaceId]);

  const skillOptions = useMemo(
    () => skills.filter((skill) => skill.name),
    [skills],
  );

  return {
    skills: skillOptions,
    agents,
    registryFingerprint,
    registryErrors,
    registryCacheHit,
    registryRefreshing,
    registryRefreshError,
    registryLastRefreshAtMs,
    refreshSkills,
  };
}

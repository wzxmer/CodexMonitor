import type {
  AppSettings,
  CodexKeyProfile,
  CodexProviderModel,
  ModelOption,
} from "@/types";

const PROVIDER_BASE_URLS: Partial<
  Record<NonNullable<CodexKeyProfile["providerKind"]>, string>
> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  opencode: "https://opencode.ai/zen/go/v1",
};

const PROVIDER_REASONING_EFFORTS = ["low", "medium", "high"].map(
  (reasoningEffort) => ({ reasoningEffort, description: "" }),
);

export function resolveCodexProviderBaseUrl(
  providerKind: CodexKeyProfile["providerKind"],
  baseUrl: string | null | undefined,
): string | null {
  const explicit = baseUrl?.trim();
  if (explicit) {
    return explicit;
  }
  return PROVIDER_BASE_URLS[providerKind ?? "custom"] ?? null;
}

export function resolveCodexProviderModel(
  providerModel: string | null | undefined,
  threadModel: string | null | undefined,
): string | null {
  return threadModel?.trim() || providerModel?.trim() || null;
}

export function mergeCodexProviderModels(
  ...modelLists: Array<readonly CodexProviderModel[] | null | undefined>
): CodexProviderModel[] {
  const merged = new Map<string, CodexProviderModel>();
  for (const models of modelLists) {
    for (const model of models ?? []) {
      const id = model.id.trim();
      if (!id) {
        continue;
      }
      const previous = merged.get(id);
      merged.set(id, {
        id,
        name: model.name?.trim() || previous?.name || null,
        contextWindow: model.contextWindow ?? previous?.contextWindow ?? null,
      });
    }
  }
  return [...merged.values()];
}

export function applyRefreshedCodexProviderModels(
  settings: AppSettings,
  profileId: string,
  refreshedModels: readonly CodexProviderModel[],
  refreshedAtMs: number,
): AppSettings {
  let changed = false;
  const codexKeyProfiles = settings.codexKeyProfiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile;
    }
    changed = true;
    return {
      ...profile,
      cachedModels: mergeCodexProviderModels(profile.cachedModels, refreshedModels),
      lastModelRefreshAtMs: refreshedAtMs,
    };
  });
  return changed ? { ...settings, codexKeyProfiles } : settings;
}

export function resolveCodexProviderModelOptions(
  profile: CodexKeyProfile | null | undefined,
): ModelOption[] {
  if (!profile) {
    return [];
  }
  const selectedModel = profile.model?.trim() || null;
  const cachedModels = mergeCodexProviderModels(profile.cachedModels);
  if (selectedModel && !cachedModels.some((model) => model.id === selectedModel)) {
    cachedModels.unshift({ id: selectedModel, name: null, contextWindow: null });
  }
  return cachedModels.map((model) => ({
    id: model.id,
    model: model.id,
    displayName: model.name ?? model.id,
    description: profile.name,
    supportedReasoningEfforts: profile.supportsReasoningEffort
      ? PROVIDER_REASONING_EFFORTS
      : [],
    defaultReasoningEffort: profile.supportsReasoningEffort ? "medium" : null,
    isDefault: model.id === selectedModel,
  }));
}

import type { CodexKeyProfile } from "@/types";

const PROVIDER_BASE_URLS: Partial<
  Record<NonNullable<CodexKeyProfile["providerKind"]>, string>
> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

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

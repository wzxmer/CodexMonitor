import type { AppLanguagePreference } from "@/types";

export type ResolvedAppLanguage = "zh" | "en";

export function isChineseLocale(locale: string | null | undefined) {
  const normalized = locale?.trim().toLowerCase();
  return Boolean(normalized && (normalized === "zh" || normalized.startsWith("zh-")));
}

export function resolveAppLanguage(
  preference: AppLanguagePreference | null | undefined,
  locale =
    typeof navigator === "undefined"
      ? ""
      : navigator.language || navigator.languages?.[0] || "",
): ResolvedAppLanguage {
  if (preference === "zh" || preference === "en") {
    return preference;
  }
  return isChineseLocale(locale) ? "zh" : "en";
}

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { AppLanguagePreference } from "@/types";
import { resolveAppLanguage, type ResolvedAppLanguage } from "./appLanguage";
import { I18N_STRINGS, type I18nKey } from "./strings";

type I18nContextValue = {
  language: ResolvedAppLanguage;
  t: (key: I18nKey) => string;
};

const FALLBACK_LANGUAGE: ResolvedAppLanguage = "zh";

const I18nContext = createContext<I18nContextValue>({
  language: FALLBACK_LANGUAGE,
  t: (key) => I18N_STRINGS[FALLBACK_LANGUAGE][key],
});

type I18nProviderProps = {
  preference: AppLanguagePreference;
  children: ReactNode;
};

export function I18nProvider({ preference, children }: I18nProviderProps) {
  const language = resolveAppLanguage(preference);
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      t: (key) => I18N_STRINGS[language][key] ?? I18N_STRINGS.zh[key],
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

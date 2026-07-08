import type { CodexSection } from "@/features/settings/components/settingsTypes";
import type { I18nKey } from "./strings";

export const SETTINGS_SECTION_LABEL_KEYS: Record<CodexSection, I18nKey> = {
  projects: "settings.section.projects",
  environments: "settings.section.environments",
  session: "settings.section.session",
  display: "settings.section.display",
  pets: "settings.section.pets",
  about: "settings.section.about",
  composer: "settings.section.composer",
  dictation: "settings.section.dictation",
  shortcuts: "settings.section.shortcuts",
  "open-apps": "settings.section.openApps",
  git: "settings.section.git",
  server: "settings.section.server",
  agents: "settings.section.agents",
  codex: "settings.section.codex",
  features: "settings.section.features",
};

import type { CodexSection } from "@/features/settings/components/settingsTypes";
import type { I18nKey } from "./strings";

export const SETTINGS_SECTION_LABEL_KEYS: Record<CodexSection, I18nKey> = {
  projects: "settings.section.projects",
  environments: "settings.section.environments",
  session: "settings.section.session",
  display: "settings.section.display",
  about: "settings.section.about",
  composer: "settings.section.composer",
  dictation: "settings.section.dictation",
  shortcuts: "settings.section.shortcuts",
  "open-apps": "settings.section.openApps",
  git: "settings.section.git",
  server: "settings.section.server",
  agents: "settings.section.agents",
  workflow: "settings.section.workflow",
  "command-execution": "settings.section.commandExecution",
  codex: "settings.section.codex",
  providers: "settings.section.providers",
  features: "settings.section.features",
};

import { useMemo, useState, type KeyboardEvent } from "react";
import {
  SettingsSection,
  SettingsSubsection,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";
import { formatShortcut, getDefaultInterruptShortcut } from "@utils/shortcuts";
import { isMacPlatform } from "@utils/platformPaths";
import type {
  ShortcutDraftKey,
  ShortcutDrafts,
  ShortcutSettingKey,
} from "@settings/components/settingsTypes";

type ShortcutItem = {
  label: string;
  draftKey: ShortcutDraftKey;
  settingKey: ShortcutSettingKey;
  help: string;
};

type ShortcutGroup = {
  title: string;
  subtitle: string;
  items: ShortcutItem[];
};

type SettingsShortcutsSectionProps = {
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
};

function ShortcutField({
  item,
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
}: {
  item: ShortcutItem;
  shortcutDrafts: ShortcutDrafts;
  onShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    key: ShortcutSettingKey,
  ) => void;
  onClearShortcut: (key: ShortcutSettingKey) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="settings-field">
      <div className="settings-field-label">{item.label}</div>
      <div className="settings-field-row">
        <input
          className="settings-input settings-input--shortcut"
          value={formatShortcut(shortcutDrafts[item.draftKey])}
          onKeyDown={(event) => onShortcutKeyDown(event, item.settingKey)}
          placeholder={t("shortcuts.recordPlaceholder")}
          readOnly
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => onClearShortcut(item.settingKey)}
        >
          {t("shortcuts.clear")}
        </button>
      </div>
      <div className="settings-help">{item.help}</div>
    </div>
  );
}

export function SettingsShortcutsSection({
  shortcutDrafts,
  onShortcutKeyDown,
  onClearShortcut,
}: SettingsShortcutsSectionProps) {
  const { language, t } = useI18n();
  const isMac = isMacPlatform();
  const [searchQuery, setSearchQuery] = useState("");

  const groups = useMemo<ShortcutGroup[]>(
    () => [
      {
        title: t("shortcuts.group.file"),
        subtitle: t("shortcuts.group.fileSubtitle"),
        items: [
          {
            label: t("shortcuts.newAgent"),
            draftKey: "newAgent",
            settingKey: "newAgentShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+n")}`,
          },
          {
            label: t("shortcuts.newWorktreeAgent"),
            draftKey: "newWorktreeAgent",
            settingKey: "newWorktreeAgentShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+shift+n")}`,
          },
          {
            label: t("shortcuts.newCloneAgent"),
            draftKey: "newCloneAgent",
            settingKey: "newCloneAgentShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+alt+n")}`,
          },
          {
            label: t("shortcuts.archiveThread"),
            draftKey: "archiveThread",
            settingKey: "archiveThreadShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut(
              isMac ? "cmd+ctrl+a" : "ctrl+alt+a",
            )}`,
          },
        ],
      },
      {
        title: t("shortcuts.group.composer"),
        subtitle: t("shortcuts.group.composerSubtitle"),
        items: [
          {
            label: t("shortcuts.model"),
            draftKey: "model",
            settingKey: "composerModelShortcut",
            help: `${t("shortcuts.focusHelp")}${formatShortcut("cmd+shift+m")}`,
          },
          {
            label: t("shortcuts.access"),
            draftKey: "access",
            settingKey: "composerAccessShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+shift+a")}`,
          },
          {
            label: t("shortcuts.reasoning"),
            draftKey: "reasoning",
            settingKey: "composerReasoningShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+shift+r")}`,
          },
          {
            label: t("shortcuts.collaboration"),
            draftKey: "collaboration",
            settingKey: "composerCollaborationShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("shift+tab")}`,
          },
          {
            label: t("shortcuts.interrupt"),
            draftKey: "interrupt",
            settingKey: "interruptShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut(
              getDefaultInterruptShortcut(),
            )}`,
          },
        ],
      },
      {
        title: t("shortcuts.group.panels"),
        subtitle: t("shortcuts.group.panelsSubtitle"),
        items: [
          {
            label: t("shortcuts.projectsSidebar"),
            draftKey: "projectsSidebar",
            settingKey: "toggleProjectsSidebarShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+shift+p")}`,
          },
          {
            label: t("shortcuts.gitSidebar"),
            draftKey: "gitSidebar",
            settingKey: "toggleGitSidebarShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+shift+g")}`,
          },
          {
            label: t("shortcuts.branchSwitcher"),
            draftKey: "branchSwitcher",
            settingKey: "branchSwitcherShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+b")}`,
          },
          {
            label: t("shortcuts.debugPanel"),
            draftKey: "debugPanel",
            settingKey: "toggleDebugPanelShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+shift+d")}`,
          },
          {
            label: t("shortcuts.terminalPanel"),
            draftKey: "terminal",
            settingKey: "toggleTerminalShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut("cmd+shift+t")}`,
          },
        ],
      },
      {
        title: t("shortcuts.group.navigation"),
        subtitle: t("shortcuts.group.navigationSubtitle"),
        items: [
          {
            label: t("shortcuts.nextAgent"),
            draftKey: "cycleAgentNext",
            settingKey: "cycleAgentNextShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut(
              isMac ? "cmd+ctrl+down" : "ctrl+alt+down",
            )}`,
          },
          {
            label: t("shortcuts.prevAgent"),
            draftKey: "cycleAgentPrev",
            settingKey: "cycleAgentPrevShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut(
              isMac ? "cmd+ctrl+up" : "ctrl+alt+up",
            )}`,
          },
          {
            label: t("shortcuts.nextProject"),
            draftKey: "cycleWorkspaceNext",
            settingKey: "cycleWorkspaceNextShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut(
              isMac ? "cmd+shift+down" : "ctrl+alt+shift+down",
            )}`,
          },
          {
            label: t("shortcuts.prevProject"),
            draftKey: "cycleWorkspacePrev",
            settingKey: "cycleWorkspacePrevShortcut",
            help: `${t("shortcuts.defaultPrefix")}${formatShortcut(
              isMac ? "cmd+shift+up" : "ctrl+alt+shift+up",
            )}`,
          },
        ],
      },
    ],
    [isMac, t],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearchQuery) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const searchValue = `${group.title} ${group.subtitle} ${item.label} ${item.help}`.toLowerCase();
          return searchValue.includes(normalizedSearchQuery);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedSearchQuery]);

  return (
    <SettingsSection
      title={t("shortcuts.title")}
      subtitle={t("shortcuts.subtitle")}
    >
      <div className="settings-field settings-shortcuts-search">
        <label className="settings-field-label" htmlFor="settings-shortcuts-search">
          {t("shortcuts.searchLabel")}
        </label>
        <div className="settings-field-row">
          <input
            id="settings-shortcuts-search"
            className="settings-input"
            placeholder={t("shortcuts.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ghost settings-button-compact"
              onClick={() => setSearchQuery("")}
            >
              {t("shortcuts.clear")}
            </button>
          )}
        </div>
        <div className="settings-help">{t("shortcuts.searchHelp")}</div>
      </div>
      {filteredGroups.map((group, index) => (
        <div key={group.title}>
          {index > 0 && <div className="settings-divider" />}
          <SettingsSubsection title={group.title} subtitle={group.subtitle} />
          {group.items.map((item) => (
            <ShortcutField
              key={item.settingKey}
              item={item}
              shortcutDrafts={shortcutDrafts}
              onShortcutKeyDown={onShortcutKeyDown}
              onClearShortcut={onClearShortcut}
            />
          ))}
        </div>
      ))}
      {filteredGroups.length === 0 && (
        <div className="settings-empty">
          {t("shortcuts.noMatches")}
          {normalizedSearchQuery
            ? language === "zh"
              ? `：“${searchQuery.trim()}”`
              : `: "${searchQuery.trim()}"`
            : language === "zh"
              ? "。"
              : "."}
        </div>
      )}
    </SettingsSection>
  );
}

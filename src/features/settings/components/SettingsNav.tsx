import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import Archive from "lucide-react/dist/esm/icons/archive";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Mic from "lucide-react/dist/esm/icons/mic";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Layers from "lucide-react/dist/esm/icons/layers";
import ServerCog from "lucide-react/dist/esm/icons/server-cog";
import Bot from "lucide-react/dist/esm/icons/bot";
import Workflow from "lucide-react/dist/esm/icons/workflow";
import KeyRound from "lucide-react/dist/esm/icons/key-round";
import Info from "lucide-react/dist/esm/icons/info";
import { PanelNavItem, PanelNavList } from "@/features/design-system/components/panel/PanelPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";
import { SETTINGS_SECTION_LABEL_KEYS } from "@/features/i18n/settingsSectionLabels";
import type { CodexSection } from "./settingsTypes";

type SettingsNavProps = {
  activeSection: CodexSection;
  onSelectSection: (section: CodexSection) => void;
  showDisclosure?: boolean;
};

export function SettingsNav({
  activeSection,
  onSelectSection,
  showDisclosure = false,
}: SettingsNavProps) {
  const { t } = useI18n();
  return (
    <aside className="settings-sidebar">
      <PanelNavList className="settings-nav-list">
        <PanelNavItem
          className="settings-nav"
          icon={<LayoutGrid aria-hidden />}
          active={activeSection === "projects"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("projects")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.projects)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Layers aria-hidden />}
          active={activeSection === "environments"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("environments")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.environments)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Archive aria-hidden />}
          active={activeSection === "session"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("session")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.session)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<SlidersHorizontal aria-hidden />}
          active={activeSection === "display"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("display")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.display)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<FileText aria-hidden />}
          active={activeSection === "composer"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("composer")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.composer)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Mic aria-hidden />}
          active={activeSection === "dictation"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("dictation")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.dictation)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Keyboard aria-hidden />}
          active={activeSection === "shortcuts"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("shortcuts")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.shortcuts)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<ExternalLink aria-hidden />}
          active={activeSection === "open-apps"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("open-apps")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS["open-apps"])}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<GitBranch aria-hidden />}
          active={activeSection === "git"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("git")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.git)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<ServerCog aria-hidden />}
          active={activeSection === "server"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("server")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.server)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Bot aria-hidden />}
          active={activeSection === "agents"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("agents")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.agents)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Workflow aria-hidden />}
          active={activeSection === "workflow"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("workflow")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.workflow)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<TerminalSquare aria-hidden />}
          active={activeSection === "codex"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("codex")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.codex)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<KeyRound aria-hidden />}
          active={activeSection === "providers"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("providers")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.providers)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<FlaskConical aria-hidden />}
          active={activeSection === "features"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("features")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.features)}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Info aria-hidden />}
          active={activeSection === "about"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("about")}
        >
          {t(SETTINGS_SECTION_LABEL_KEYS.about)}
        </PanelNavItem>
      </PanelNavList>
    </aside>
  );
}

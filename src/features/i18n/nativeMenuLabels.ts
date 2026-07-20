import type { NativeMenuLabels } from "@/types";
import type { I18nKey } from "./strings";

type Translate = (key: I18nKey) => string;

export function buildNativeMenuLabels(t: Translate): NativeMenuLabels {
  return {
    about: t("menu.about"),
    checkForUpdates: t("menu.checkForUpdates"),
    settings: t("menu.settings"),
    services: t("menu.services"),
    hide: t("menu.hide"),
    hideOthers: t("menu.hideOthers"),
    quit: t("menu.quit"),
    file: t("menu.file"),
    newAgent: t("menu.newAgent"),
    newWorktreeAgent: t("menu.newWorktreeAgent"),
    newCloneAgent: t("menu.newCloneAgent"),
    addWorkspace: t("menu.addWorkspace"),
    addWorkspaceFromUrl: t("menu.addWorkspaceFromUrl"),
    closeWindow: t("menu.closeWindow"),
    edit: t("menu.edit"),
    undo: t("menu.undo"),
    redo: t("menu.redo"),
    cut: t("menu.cut"),
    copy: t("menu.copy"),
    paste: t("menu.paste"),
    selectAll: t("menu.selectAll"),
    composer: t("menu.composer"),
    cycleModel: t("menu.cycleModel"),
    cycleAccess: t("menu.cycleAccess"),
    cycleReasoning: t("menu.cycleReasoning"),
    cycleCollaboration: t("menu.cycleCollaboration"),
    view: t("menu.view"),
    toggleProjectsSidebar: t("menu.toggleProjectsSidebar"),
    toggleGitSidebar: t("menu.toggleGitSidebar"),
    toggleDebugPanel: t("menu.toggleDebugPanel"),
    toggleTerminal: t("menu.toggleTerminal"),
    nextAgent: t("menu.nextAgent"),
    previousAgent: t("menu.previousAgent"),
    nextWorkspace: t("menu.nextWorkspace"),
    previousWorkspace: t("menu.previousWorkspace"),
    toggleFullScreen: t("menu.toggleFullScreen"),
    window: t("menu.window"),
    minimize: t("menu.minimize"),
    maximize: t("menu.maximize"),
    help: t("menu.help"),
  };
}

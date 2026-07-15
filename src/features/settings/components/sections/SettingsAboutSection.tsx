import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppSettings } from "@/types";
import {
  getAppBuildType,
  isMobileRuntime,
  type AppBuildType,
} from "@services/tauri";
import { useUpdater } from "@/features/update/hooks/useUpdater";
import { WindowsInstallerRepairDialog } from "@/features/update/components/WindowsInstallerRepairDialog";
import { FeatureIntroPrompt } from "@app/components/FeatureIntroPrompt";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";

const PROJECT_REPOSITORY_URL = "https://github.com/wzxmer/CodexMonitor";

type SettingsAboutSectionProps = {
  appSettings: AppSettings;
  onToggleAutomaticAppUpdateChecks?: () => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function SettingsAboutSection({
  appSettings,
  onToggleAutomaticAppUpdateChecks,
}: SettingsAboutSectionProps) {
  const { t } = useI18n();
  const [appBuildType, setAppBuildType] = useState<AppBuildType | "unknown">("unknown");
  const [updaterEnabled, setUpdaterEnabled] = useState(false);
  const [featureIntroOpen, setFeatureIntroOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const { state: updaterState, checkForUpdates, startUpdate } = useUpdater({
    enabled: updaterEnabled,
    autoCheckOnMount: false,
  });

  useEffect(() => {
    let active = true;
    const loadBuildType = async () => {
      try {
        const value = await getAppBuildType();
        if (active) {
          setAppBuildType(value);
        }
      } catch {
        if (active) {
          setAppBuildType("unknown");
        }
      }
    };
    void loadBuildType();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const detectRuntime = async () => {
      try {
        const mobileRuntime = await isMobileRuntime();
        if (active) {
          setUpdaterEnabled(!mobileRuntime);
        }
      } catch {
        if (active) {
          // In non-Tauri previews we still want local desktop-like behavior.
          setUpdaterEnabled(true);
        }
      }
    };
    void detectRuntime();
    return () => {
      active = false;
    };
  }, []);

  const buildDateValue = __APP_BUILD_DATE__.trim();
  const parsedBuildDate = Date.parse(buildDateValue);
  const buildDateLabel = Number.isNaN(parsedBuildDate)
    ? buildDateValue || t("about.unknown")
    : new Date(parsedBuildDate).toLocaleString();

  return (
    <SettingsSection title={t("about.title")} subtitle={t("about.subtitle")}>
      <div className="settings-field">
        <div className="settings-label">{t("featureIntro.title")}</div>
        <div className="settings-help">{t("featureIntro.settingsDescription")}</div>
        <button type="button" className="ghost" onClick={() => setFeatureIntroOpen(true)}>
          {t("featureIntro.action")}
        </button>
      </div>
      <div className="settings-field">
        <div className="settings-help">
          {t("about.version")}：<code>{__APP_VERSION__}</code>
        </div>
        <div className="settings-help">
          {t("about.buildType")}：<code>{appBuildType}</code>
        </div>
        <div className="settings-help">
          {t("about.branch")}：<code>{__APP_GIT_BRANCH__ || t("about.unknown")}</code>
        </div>
        <div className="settings-help">
          {t("about.commit")}：<code>{__APP_COMMIT_HASH__ || t("about.unknown")}</code>
        </div>
        <div className="settings-help">
          {t("about.buildTime")}：<code>{buildDateLabel}</code>
        </div>
        <div className="settings-help">
          {t("about.repository")}：
          <button
            type="button"
            className="ghost"
            onClick={() => void openUrl(PROJECT_REPOSITORY_URL)}
          >
            {PROJECT_REPOSITORY_URL}
          </button>
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-label">{t("about.appUpdate")}</div>
        <SettingsToggleRow
          title={t("about.autoUpdateTitle")}
          subtitle={t("about.autoUpdateSubtitle")}
        >
          <SettingsToggleSwitch
            pressed={appSettings.automaticAppUpdateChecksEnabled}
            onClick={() => {
              onToggleAutomaticAppUpdateChecks?.();
            }}
          />
        </SettingsToggleRow>
        <div className="settings-help">
          {t("about.currentVersion")} <code>{__APP_VERSION__}</code>
        </div>
        {!updaterEnabled && (
          <div className="settings-help">
            {t("about.updateUnavailable")}
          </div>
        )}

        {updaterState.stage === "error" && (
          <div className="settings-help ds-text-danger">
            {t("about.updateFailed")}：
            {updaterState.errorCode === "mixedInstaller"
              ? t("update.mixedInstallerBlocked")
              : updaterState.error}
          </div>
        )}

        {updaterState.stage === "downloading" ||
        updaterState.stage === "installing" ||
        updaterState.stage === "restarting" ? (
          <div className="settings-help">
            {updaterState.stage === "downloading" ? (
              <>
                {t("about.downloading")}{" "}
                {updaterState.progress?.totalBytes
                  ? `${Math.round((updaterState.progress.downloadedBytes / updaterState.progress.totalBytes) * 100)}%`
                  : formatBytes(updaterState.progress?.downloadedBytes ?? 0)}
              </>
            ) : updaterState.stage === "installing" ? (
              t("about.installing")
            ) : (
              t("about.restarting")
            )}
          </div>
        ) : updaterState.stage === "available" ? (
          <div className="settings-help">
            {t("about.newVersion")} <code>{updaterState.version}</code>。
          </div>
        ) : updaterState.stage === "upToDate" ? (
          <div className="settings-help">
            {t("about.latest")}
          </div>
        ) : null}

        <div className="settings-controls">
          {updaterState.stage === "error" && updaterState.errorCode === "mixedInstaller" ? (
            <button type="button" className="primary" onClick={() => setRepairOpen(true)}>
              {t("installerRepair.view")}
            </button>
          ) : updaterState.stage === "available" ? (
            <button
              type="button"
              className="primary"
              disabled={!updaterEnabled}
              onClick={() => void startUpdate()}
            >
              {t("about.downloadInstall")}
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              disabled={
                !updaterEnabled ||
                updaterState.stage === "checking" ||
                updaterState.stage === "downloading" ||
                updaterState.stage === "installing" ||
                updaterState.stage === "restarting"
              }
              onClick={() => void checkForUpdates()}
            >
              {updaterState.stage === "checking"
                ? t("about.checking")
                : t("about.checkUpdate")}
            </button>
          )}
        </div>
      </div>
      <FeatureIntroPrompt open={featureIntroOpen} onClose={() => setFeatureIntroOpen(false)} />
      <WindowsInstallerRepairDialog
        open={repairOpen}
        onClose={() => setRepairOpen(false)}
        onRecheck={checkForUpdates}
      />
    </SettingsSection>
  );
}

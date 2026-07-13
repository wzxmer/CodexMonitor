import { useEffect, useState } from "react";
import type { AppSettings } from "@/types";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";
import { detectPython } from "@/services/tauri";

type PythonStatus = {
  available: boolean;
  interpreterPath: string | null;
  version: string | null;
  source: string | null;
} | null;

export type SettingsCommandExecutionSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function SettingsCommandExecutionSection({
  appSettings,
  onUpdateAppSettings,
}: SettingsCommandExecutionSectionProps) {
  const { t } = useI18n();
  const [pythonStatus, setPythonStatus] = useState<PythonStatus>(null);
  const [detecting, setDetecting] = useState(false);

  const policy = appSettings.commandExecutionPolicy ?? "auto";

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const result = await detectPython();
      setPythonStatus(result);
    } catch {
      setPythonStatus({ available: false, interpreterPath: null, version: null, source: null });
    }
    setDetecting(false);
  };

  useEffect(() => {
    void handleDetect();
  }, []);

  return (
    <SettingsSection title={t("settings.commandExecution.title")} subtitle={t("settings.commandExecution.subtitle")}>
      <div>
        <div className="settings-field">
          <div className="settings-label">{t("settings.commandExecution.pythonStatus")}</div>
          {pythonStatus ? (
            <>
              <div className="settings-help">
                {pythonStatus.available
                  ? t("settings.commandExecution.pythonAvailable")
                  : t("settings.commandExecution.pythonUnavailable")}
                {pythonStatus.version ? ` (${pythonStatus.version})` : ""}
              </div>
              {pythonStatus.interpreterPath && (
                <div className="settings-help">
                  {t("settings.commandExecution.pythonPath")}: <code>{pythonStatus.interpreterPath}</code>
                </div>
              )}
            </>
          ) : (
            <div className="settings-help">
              {detecting ? "..." : t("settings.commandExecution.pythonUnavailable")}
            </div>
          )}
          <button
            type="button"
            className="ghost"
            onClick={handleDetect}
            disabled={detecting}
          >
            {t("settings.commandExecution.detectPython")}
          </button>
        </div>
        <div className="settings-field">
          <div className="settings-label">{t("settings.commandExecution.title")}</div>
          <SettingsToggleRow
            title={t("settings.commandExecution.auto")}
            subtitle={t("settings.commandExecution.subtitle")}
          >
            <SettingsToggleSwitch
              pressed={policy === "auto"}
              onClick={() => void onUpdateAppSettings({ ...appSettings, commandExecutionPolicy: "auto" })}
            />
          </SettingsToggleRow>
          <SettingsToggleRow
            title={t("settings.commandExecution.preferPython")}
            subtitle=""
          >
            <SettingsToggleSwitch
              pressed={policy === "prefer-python"}
              onClick={() => void onUpdateAppSettings({ ...appSettings, commandExecutionPolicy: "prefer-python" })}
            />
          </SettingsToggleRow>
          <SettingsToggleRow
            title={t("settings.commandExecution.preferPowershell")}
            subtitle=""
          >
            <SettingsToggleSwitch
              pressed={policy === "prefer-powershell"}
              onClick={() => void onUpdateAppSettings({ ...appSettings, commandExecutionPolicy: "prefer-powershell" })}
            />
          </SettingsToggleRow>
          <SettingsToggleRow
            title={t("settings.commandExecution.nativeOnly")}
            subtitle=""
          >
            <SettingsToggleSwitch
              pressed={policy === "native-only"}
              onClick={() => void onUpdateAppSettings({ ...appSettings, commandExecutionPolicy: "native-only" })}
            />
          </SettingsToggleRow>
        </div>
      </div>
    </SettingsSection>
  );
}

import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppSettings, CodexNativePet, CodexNativePetState } from "@/types";
import {
  getCodexNativePetState,
  importCodexNativePet,
  setCodexNativePetEnabled,
  setCodexNativePetSelected,
  wakeCodexNativePet,
} from "@services/tauri";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";

type SettingsPetsSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

function PetPreview({ pet }: { pet: CodexNativePet }) {
  const src = useMemo(() => convertFileSrc(pet.spritesheetPath), [pet.spritesheetPath]);

  return (
    <span className="settings-codex-pet-preview" aria-hidden>
      <img src={src} alt="" loading="lazy" />
    </span>
  );
}

export function SettingsPetsSection({
  appSettings,
  onUpdateAppSettings,
}: SettingsPetsSectionProps) {
  const { t } = useI18n();
  const [nativePetState, setNativePetState] = useState<CodexNativePetState | null>(null);
  const [nativePetError, setNativePetError] = useState<string | null>(null);
  const [nativePetBusy, setNativePetBusy] = useState(false);
  const selectedNativePetId =
    nativePetState?.selectedAvatarId ?? appSettings.codexPetId ?? "codex";

  const syncLegacyCodexPet = (state: CodexNativePetState) => {
    void onUpdateAppSettings({
      ...appSettings,
      codexPetEnabled: state.enabled,
      codexPetId: "custom",
      codexPetCustomImagePath: state.petsDir,
      codexPetWakeVersion: Date.now(),
    });
  };

  const refreshNativePetState = async () => {
    setNativePetError(null);
    try {
      const state = await getCodexNativePetState();
      setNativePetState(state);
      if (appSettings.codexPetEnabled !== state.enabled) {
        syncLegacyCodexPet(state);
      }
    } catch (error) {
      setNativePetError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void refreshNativePetState();
  }, []);

  const runNativePetAction = async (
    action: () => Promise<CodexNativePetState>,
    syncLegacy = true,
  ) => {
    setNativePetBusy(true);
    setNativePetError(null);
    try {
      const nextState = await action();
      setNativePetState(nextState);
      if (syncLegacy) {
        syncLegacyCodexPet(nextState);
      }
    } catch (error) {
      setNativePetError(error instanceof Error ? error.message : String(error));
    } finally {
      setNativePetBusy(false);
    }
  };

  const toggleCodexPet = () => {
    void runNativePetAction(() => setCodexNativePetEnabled(!nativePetState?.enabled));
  };

  const selectCodexPet = (avatarId: string) => {
    void runNativePetAction(async () => {
      const selected = await setCodexNativePetSelected(avatarId);
      if (selected.enabled) {
        return selected;
      }
      return setCodexNativePetEnabled(true);
    });
  };

  const importCodexPet = async () => {
    const selection = await open({
      multiple: false,
      directory: true,
    });
    if (!selection || Array.isArray(selection)) {
      return;
    }
    void runNativePetAction(() => importCodexNativePet(selection));
  };

  const setPetVisible = (enabled: boolean) => {
    void runNativePetAction(() => setCodexNativePetEnabled(enabled));
  };

  return (
    <SettingsSection title={t("settings.pets.title")} subtitle={t("settings.pets.subtitle")}>
      <SettingsToggleRow
        title={t("settings.pets.enabledTitle")}
        subtitle={t("settings.pets.enabledSubtitle")}
      >
        <SettingsToggleSwitch
          pressed={Boolean(nativePetState?.enabled)}
          disabled={nativePetBusy}
          onClick={toggleCodexPet}
        />
      </SettingsToggleRow>

      <div className="settings-codex-pet-panel">
        <div className="settings-codex-pet-toolbar">
          <div className="settings-help">
            {nativePetState
              ? `${nativePetState.pets.length} ${t("settings.pets.countUnit")} · ${
                  nativePetState.petsDir
                }`
              : t("common.loading")}
          </div>
          <div className="settings-codex-pet-actions">
            <button
              type="button"
              className="ghost settings-button-compact"
              disabled={nativePetBusy}
              onClick={() => void importCodexPet()}
            >
              {t("settings.pets.import")}
            </button>
            <button
              type="button"
              className="ghost settings-button-compact"
              disabled={nativePetBusy}
              onClick={() => void refreshNativePetState()}
            >
              {t("common.refresh")}
            </button>
            <button
              type="button"
              className="ghost settings-button-compact"
              disabled={nativePetBusy}
              onClick={() =>
                nativePetState?.enabled
                  ? setPetVisible(false)
                  : void runNativePetAction(() => wakeCodexNativePet())
              }
            >
              {nativePetState?.enabled ? t("settings.pets.collapse") : t("settings.pets.wake")}
            </button>
          </div>
        </div>

        {nativePetError ? (
          <div className="settings-help settings-error-text">{nativePetError}</div>
        ) : null}

        <div
          className="settings-codex-pet-list"
          role="radiogroup"
          aria-label={t("settings.pets.choice")}
        >
          {(nativePetState?.pets ?? []).map((pet) => {
            const selected = selectedNativePetId === pet.id;
            return (
              <button
                key={pet.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`settings-codex-pet-row ${selected ? "is-selected" : ""}`}
                disabled={nativePetBusy}
                onClick={() => selectCodexPet(pet.id)}
              >
                <PetPreview pet={pet} />
                <span className="settings-codex-pet-copy">
                  <span className="settings-codex-pet-title">{pet.displayName}</span>
                  <span className="settings-codex-pet-subtitle">
                    {pet.description?.trim() || pet.id}
                  </span>
                </span>
                <span className="settings-codex-pet-select">
                  {selected ? t("settings.pets.selected") : t("settings.pets.select")}
                </span>
              </button>
            );
          })}
        </div>

        {nativePetState?.selectedAvatarId && (
          <div className="settings-help settings-codex-pet-path">
            {t("settings.pets.selectedAvatarId")}: {nativePetState.selectedAvatarId}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

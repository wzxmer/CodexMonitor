import { useState } from "react";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { useI18n } from "@/features/i18n/I18nProvider";

type Props = {
  eligibleCount: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SessionImmediateCleanupPrompt({
  eligibleCount,
  busy,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <ModalShell
      onBackdropClick={busy ? undefined : onCancel}
      ariaLabel={t("settings.session.immediateCleanupTitle")}
    >
      <div className="ds-modal-title">
        {t("settings.session.immediateCleanupTitle")}
      </div>
      <div className="settings-help ds-text-danger">
        {t("settings.session.immediateCleanupWarning")}
      </div>
      <div>
        {t("settings.session.autoDeleteEligible").replace(
          "{count}",
          String(eligibleCount),
        )}
      </div>
      {error && <div className="settings-error">{error}</div>}
      <label>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        {t("settings.session.autoDeleteAcknowledge")}
      </label>
      <div className="ds-modal-actions">
        <button type="button" className="ghost ds-modal-button" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="primary ds-modal-button"
          onClick={onConfirm}
          disabled={busy || !acknowledged || eligibleCount === 0}
        >
          {busy
            ? t("settings.session.immediateCleaning")
            : t("settings.session.immediateCleanupConfirm")}
        </button>
      </div>
    </ModalShell>
  );
}

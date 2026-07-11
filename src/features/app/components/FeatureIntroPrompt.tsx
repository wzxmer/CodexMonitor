import { CheckCircle2 } from "lucide-react";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";
import { useI18n } from "@/features/i18n/I18nProvider";

type FeatureIntroPromptProps = {
  open: boolean;
  onClose: () => void;
};

const featureKeys = ["agents", "sessions", "git", "usage", "remote"] as const;

export function FeatureIntroPrompt({ open, onClose }: FeatureIntroPromptProps) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <ModalShell ariaLabel={t("featureIntro.title")} className="feature-intro-modal" onBackdropClick={onClose}>
      <div className="ds-modal-title">{t("featureIntro.title")}</div>
      <div className="ds-modal-subtitle">{t("featureIntro.subtitle")}</div>
      <div className="feature-intro-list">
        {featureKeys.map((key) => (
          <div className="feature-intro-item" key={key}>
            <CheckCircle2 aria-hidden="true" size={18} />
            <div>
              <strong>{t(`featureIntro.${key}.title`)}</strong>
              <span>{t(`featureIntro.${key}.description`)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="ds-modal-actions">
        <button type="button" className="primary ds-modal-button" onClick={onClose}>
          {t("featureIntro.close")}
        </button>
      </div>
    </ModalShell>
  );
}

import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Quote from "lucide-react/dist/esm/icons/quote";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import TextQuote from "lucide-react/dist/esm/icons/text-quote";
import { useEffect, useRef } from "react";
import { useI18n } from "@/features/i18n/I18nProvider";
import type {
  MessageReferenceDestination,
  MessageReferenceMode,
} from "../utils/messageReferences";

type Props = {
  mode: MessageReferenceMode;
  characterCount: number;
  estimatedTokens: number;
  hasSelection: boolean;
  onModeChange: (mode: MessageReferenceMode) => void;
  onChoose: (destination: MessageReferenceDestination) => void;
  onClose: () => void;
};

export function MessageReferenceMenu({
  mode,
  characterCount,
  estimatedTokens,
  hasSelection,
  onModeChange,
  onChoose,
  onClose,
}: Props) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} className="ds-popover message-reference-menu" role="menu">
      <div className="message-reference-menu-header">
        <strong>
          {hasSelection
            ? t("messages.referenceSelection")
            : t("messages.referenceMessage")}
        </strong>
        <span>
          {t("messages.referenceStats")
            .replace("{characters}", characterCount.toLocaleString())
            .replace("{tokens}", estimatedTokens.toLocaleString())}
        </span>
      </div>
      <button
        type="button"
        className="ds-popover-item message-reference-destination"
        role="menuitem"
        onClick={() => onChoose("current")}
      >
        <span className="ds-popover-item-icon"><Quote aria-hidden /></span>
        <span className="ds-popover-item-label">
          <strong>{t("messages.referenceCurrent")}</strong>
          <small>{t("messages.referenceCurrentHint")}</small>
        </span>
      </button>
      <button
        type="button"
        className="ds-popover-item message-reference-destination is-recommended"
        role="menuitem"
        onClick={() => onChoose("new")}
      >
        <span className="ds-popover-item-icon"><GitBranch aria-hidden /></span>
        <span className="ds-popover-item-label">
          <strong>{t("messages.referenceNew")}</strong>
          <small>{t("messages.referenceNewHint")}</small>
        </span>
        <span className="message-reference-recommended">{t("common.recommended")}</span>
      </button>
      <div className="message-reference-mode-label">{t("messages.referenceMode")}</div>
      <div className="message-reference-mode" role="group" aria-label={t("messages.referenceMode")}>
        <button
          type="button"
          className={mode === "smart" ? "is-active" : ""}
          onClick={() => onModeChange("smart")}
          aria-pressed={mode === "smart"}
        >
          <Sparkles size={13} aria-hidden />
          {t("messages.referenceSmart")}
        </button>
        <button
          type="button"
          className={mode === "full" ? "is-active" : ""}
          onClick={() => onModeChange("full")}
          aria-pressed={mode === "full"}
        >
          <TextQuote size={13} aria-hidden />
          {t("messages.referenceFull")}
        </button>
      </div>
      {mode === "full" && estimatedTokens >= 2_000 && (
        <div className="message-reference-warning">
          {t("messages.referenceTokenWarning").replace("{tokens}", estimatedTokens.toLocaleString())}
        </div>
      )}
    </div>
  );
}

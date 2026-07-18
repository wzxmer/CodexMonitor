import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, X } from "lucide-react";
import type { ComposerReference } from "@/types";
import { LONG_REFERENCE_CHARACTER_THRESHOLD, REFERENCE_PREVIEW_CHARACTER_LIMIT } from "@/features/messages/utils/messageReferences";
import { useI18n } from "@/features/i18n/I18nProvider";

type Props = {
  references: ComposerReference[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
};

export function ComposerReferences({ references, onToggle, onRemove, onMove }: Props) {
  const { t } = useI18n();
  if (!references.length) return null;
  return <div className="composer-references" aria-label={t("messages.referenceAction")}>
    {references.map((reference, index) => {
      const long = reference.content.length >= LONG_REFERENCE_CHARACTER_THRESHOLD;
      const preview = reference.content.slice(0, REFERENCE_PREVIEW_CHARACTER_LIMIT);
      return <div className={`composer-reference${reference.collapsed ? " is-collapsed" : ""}`} key={reference.id}>
        <div className="composer-reference-header">
          <button type="button" className="ghost composer-reference-toggle" data-button-elevation="none" onClick={() => onToggle(reference.id)} aria-expanded={!reference.collapsed}>
            {reference.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span>{reference.sourceTitle}</span>
          </button>
          <span className="composer-reference-size">{t("messages.referenceCharacters").replace("{count}", reference.content.length.toLocaleString())}</span>
          <button type="button" className="ghost" data-button-elevation="none" onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label={t("messages.referenceMoveUp")} title={t("messages.referenceMoveUp")}><ArrowUp size={13} /></button>
          <button type="button" className="ghost" data-button-elevation="none" onClick={() => onMove(index, index + 1)} disabled={index === references.length - 1} aria-label={t("messages.referenceMoveDown")} title={t("messages.referenceMoveDown")}><ArrowDown size={13} /></button>
          <button type="button" className="ghost" data-button-elevation="none" onClick={() => onRemove(reference.id)} aria-label={t("messages.referenceRemove")} title={t("messages.referenceRemove")}><X size={13} /></button>
        </div>
        {!reference.collapsed && <div className="composer-reference-preview">{long ? `${preview}…` : reference.content}</div>}
      </div>;
    })}
  </div>;
}

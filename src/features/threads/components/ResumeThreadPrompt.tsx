import { useEffect, useRef } from "react";
import { useI18n } from "@/features/i18n/I18nProvider";
import { ModalShell } from "@/features/design-system/components/modal/ModalShell";

type ResumeThreadPromptProps = {
  workspaceName: string;
  threadId: string;
  error: string | null;
  isBusy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ResumeThreadPrompt({
  workspaceName,
  threadId,
  error,
  isBusy,
  onChange,
  onCancel,
  onConfirm,
}: ResumeThreadPromptProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <ModalShell
      className="worktree-modal"
      onBackdropClick={isBusy ? undefined : onCancel}
      ariaLabel={t("resumeThread.title")}
    >
      <div className="ds-modal-title worktree-modal-title">{t("resumeThread.title")}</div>
      <div className="ds-modal-subtitle worktree-modal-subtitle">
        {t("resumeThread.subtitle")}
        <br />
        {workspaceName}
      </div>
      <label className="ds-modal-label worktree-modal-label" htmlFor="resume-thread-id">
        {t("resumeThread.threadId")}
      </label>
      <input
        id="resume-thread-id"
        ref={inputRef}
        className="ds-modal-input worktree-modal-input"
        value={threadId}
        placeholder={t("resumeThread.placeholder")}
        disabled={isBusy}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isBusy) {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Enter" && threadId.trim() && !isBusy) {
            event.preventDefault();
            onConfirm();
          }
        }}
      />
      {error && <div className="worktree-modal-error">{error}</div>}
      <div className="ds-modal-actions worktree-modal-actions">
        <button
          className="ghost ds-modal-button worktree-modal-button"
          onClick={onCancel}
          type="button"
          disabled={isBusy}
        >
          {t("common.cancel")}
        </button>
        <button
          className="primary ds-modal-button worktree-modal-button"
          onClick={onConfirm}
          type="button"
          disabled={threadId.trim().length === 0 || isBusy}
        >
          {isBusy ? t("resumeThread.restoring") : t("resumeThread.confirm")}
        </button>
      </div>
    </ModalShell>
  );
}

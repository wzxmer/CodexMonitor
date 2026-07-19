import { useRef } from "react";
import type { ManagedSessionPreviewItem } from "@/types";
import { useI18n } from "@/features/i18n/I18nProvider";
import { useMessageHistoryWindow } from "@/features/messages/components/useMessageHistoryWindow";

const SESSION_CONTENT_BATCH_SIZE = 40;

type Props = {
  sessionKey: string;
  items: ManagedSessionPreviewItem[];
  loading: boolean;
  error: string | null;
  incomplete: boolean;
  fallback: string | null;
};

export function SessionManagerConversation({ sessionKey, items, loading, error, incomplete, fallback }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const historyWindow = useMessageHistoryWindow({
    items,
    threadId: sessionKey,
    batchSize: SESSION_CONTENT_BATCH_SIZE,
    containerRef,
  });

  return (
    <section className="session-manager-latest-preview">
      <h2>{t("sessionManager.conversationContent")}</h2>
      {loading ? (
        <div className="session-manager-preview-state">{t("sessionManager.previewLoading")}</div>
      ) : error ? (
        <div className="session-manager-preview-state is-error">{t("sessionManager.previewUnavailable")}</div>
      ) : items.length ? (
        <div
          className="session-manager-preview-items"
          ref={containerRef}
          onScroll={(event) => historyWindow.handleHistoryScroll(event.currentTarget)}
        >
          {historyWindow.hiddenBeforeCount > 0 && (
            <button
              type="button"
              className="session-manager-preview-load-earlier"
              data-button-elevation="none"
              onClick={historyWindow.loadEarlier}
            >
              {t("sessionManager.loadEarlierMessages")}
            </button>
          )}
          {historyWindow.visibleItems.map((item, index) => (
            <article key={`${historyWindow.hiddenBeforeCount + index}-${item.role}`} className={`session-manager-preview-item is-${item.role}`}>
              <span>{item.role === "user" ? t("sessionManager.previewUser") : t("sessionManager.previewAssistant")}</span>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      ) : fallback ? (
        <div className="session-manager-detail-preview">{fallback}</div>
      ) : (
        <div className="session-manager-preview-state">{t("sessionManager.previewEmpty")}</div>
      )}
      {incomplete && <div className="session-manager-preview-note">{t("sessionManager.contentIncomplete")}</div>}
    </section>
  );
}

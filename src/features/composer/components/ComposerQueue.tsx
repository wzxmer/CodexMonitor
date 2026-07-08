import { useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { QueuedMessage } from "../../../types";
import {
  PopoverMenuItem,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../../app/hooks/useMenuController";
import { useI18n } from "@/features/i18n/I18nProvider";

type ComposerQueueProps = {
  queuedMessages: QueuedMessage[];
  pausedReason?: string | null;
  canSteerQueued?: boolean;
  onSteerQueued?: (id: string) => void;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
};

export function ComposerQueue({
  queuedMessages,
  pausedReason = null,
  canSteerQueued = false,
  onSteerQueued,
  onEditQueued,
  onDeleteQueued,
}: ComposerQueueProps) {
  const { t } = useI18n();
  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <div className="composer-queue">
      <div className="composer-queue-title">{t("composer.queueTitle")}</div>
      {pausedReason ? (
        <div className="composer-queue-hint">{pausedReason}</div>
      ) : null}
      <div className="composer-queue-list">
        {queuedMessages.map((item) => (
          <div key={item.id} className="composer-queue-item">
            <span className="composer-queue-text">
              {item.text ||
                (item.images?.length
                  ? item.images.length === 1
                    ? t("composer.attachment")
                    : t("composer.attachment")
                  : "")}
              {item.images?.length
                ? ` · ${item.images.length} ${t("composer.attachmentCountSuffix")}`
                : ""}
            </span>
            {canSteerQueued && (
              <button
                type="button"
                className="composer-queue-steer"
                onClick={() => onSteerQueued?.(item.id)}
              >
                {t("composer.guide")}
              </button>
            )}
            <QueueMenuButton
              item={item}
              onEditQueued={onEditQueued}
              onDeleteQueued={onDeleteQueued}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

type QueueMenuButtonProps = {
  item: QueuedMessage;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
};

function QueueMenuButton({ item, onEditQueued, onDeleteQueued }: QueueMenuButtonProps) {
  const { t } = useI18n();
  const menu = useMenuController();
  const handleToggleMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      menu.toggle();
    },
    [menu],
  );

  const handleEdit = useCallback(() => {
    menu.close();
    onEditQueued?.(item);
  }, [item, menu, onEditQueued]);

  const handleDelete = useCallback(() => {
    menu.close();
    onDeleteQueued?.(item.id);
  }, [item.id, menu, onDeleteQueued]);

  return (
    <div className="composer-queue-menu-wrap" ref={menu.containerRef}>
      <button
        type="button"
        className={`composer-queue-menu${menu.isOpen ? " is-open" : ""}`}
        onClick={handleToggleMenu}
        aria-label={t("composer.queueMenu")}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
      >
        ...
      </button>
      {menu.isOpen && (
        <PopoverSurface className="composer-queue-item-popover" role="menu">
          <PopoverMenuItem onClick={handleEdit}>{t("composer.edit")}</PopoverMenuItem>
          <PopoverMenuItem onClick={handleDelete}>{t("composer.delete")}</PopoverMenuItem>
        </PopoverSurface>
      )}
    </div>
  );
}

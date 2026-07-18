import Archive from "lucide-react/dist/esm/icons/archive";
import Copy from "lucide-react/dist/esm/icons/copy";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Play from "lucide-react/dist/esm/icons/play";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { ManagedSession } from "@/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/features/i18n/I18nProvider";
import { PopoverMenuItem, PopoverSurface } from "@/features/design-system/components/popover/PopoverPrimitives";

type Props = {
  sessions: ManagedSession[];
  x: number;
  y: number;
  busy: boolean;
  onClose: () => void;
  onResume: (session: ManagedSession) => void;
  onDerive: (sessions: ManagedSession[]) => void;
  onArchive: (sessions: ManagedSession[]) => void;
  onPermanentDelete: (sessions: ManagedSession[]) => void;
};

export function SessionManagerContextMenu({ sessions, x, y, busy, onClose, onResume, onDerive, onArchive, onPermanentDelete }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const target = sessions[0];
  const active = sessions.filter((session) => !session.isArchived);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", keydown);
    };
  }, [onClose]);
  useLayoutEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const next = {
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    };
    setPosition((current) => current.x === next.x && current.y === next.y ? current : next);
  }, [sessions, x, y]);
  if (!target) return null;
  const run = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <PopoverSurface
      ref={ref}
      className="session-manager-context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {sessions.length === 1 && (
        <>
          <PopoverMenuItem role="menuitem" disabled={busy || !target.projectExists} icon={<Play size={14} />} onClick={() => run(() => onResume(target))}>
            {t("sessionManager.continueSession")}
          </PopoverMenuItem>
        </>
      )}
      <PopoverMenuItem role="menuitem" disabled={busy} icon={<GitBranch size={14} />} onClick={() => run(() => onDerive(sessions))}>
        {sessions.length === 1 ? t("sessionManager.deriveToCurrentProject") : t("sessionManager.deriveSelectedToCurrentProject")}
      </PopoverMenuItem>
      {active.length > 0 && (
        <PopoverMenuItem role="menuitem" disabled={busy} icon={<Archive size={14} />} onClick={() => run(() => onArchive(active))}>
          {sessions.length === 1 ? t("sessionManager.archive") : t("sessionManager.archiveSelected")}
        </PopoverMenuItem>
      )}
      <PopoverMenuItem role="menuitem" disabled={busy} className="is-danger" icon={<Trash2 size={14} />} onClick={() => run(() => onPermanentDelete(sessions))}>
          {sessions.length === 1 ? t("sessionManager.permanentDelete") : t("sessionManager.permanentDeleteSelected")}
      </PopoverMenuItem>
      <PopoverMenuItem role="menuitem" icon={<Copy size={14} />} onClick={() => run(() => { void navigator.clipboard?.writeText(sessions.map((session) => session.threadId).join("\n")).catch(() => undefined); })}>
        {sessions.length === 1 ? t("sessionManager.copySessionId") : t("sessionManager.copySessionIds")}
      </PopoverMenuItem>
    </PopoverSurface>
  );
}

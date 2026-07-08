import type { CSSProperties, PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getCodexNativePetState,
  setCodexNativePetPosition,
} from "@/services/tauri";
import type { CodexNativePetState } from "@/types";
import { useI18n } from "@/features/i18n/I18nProvider";
import {
  getCodexPetFrame,
  isCodexPetActivity,
  type CodexPetActivity,
} from "@app/utils/codexPetAnimation";

function selectedPet(state: CodexNativePetState | null) {
  if (!state) {
    return null;
  }
  return (
    state.pets.find((pet) => pet.id === state.selectedAvatarId) ??
    state.pets[0] ??
    null
  );
}

export function CodexPetOverlay() {
  const { t } = useI18n();
  const [state, setState] = useState<CodexNativePetState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<CodexPetActivity>("waving");
  const [frame, setFrame] = useState(() => getCodexPetFrame("waving", 0));
  const baseActivityRef = useRef<CodexPetActivity>("idle");
  const animationStartRef = useRef<number | null>(null);
  const moveSaveTimerRef = useRef<number | null>(null);
  const pet = selectedPet(state);
  const spriteUrl = useMemo(
    () => (pet ? convertFileSrc(pet.spritesheetPath) : null),
    [pet],
  );

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      getCodexNativePetState()
        .then((nextState) => {
          if (!mounted) {
            return;
          }
          setState(nextState);
          setError(null);
        })
        .catch((nextError) => {
          if (!mounted) {
            return;
          }
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        });
    };

    refresh();
    const unlisten = listen("codex-pet-state-changed", refresh);
    return () => {
      mounted = false;
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ activity?: unknown }>("codex-pet-activity", (event) => {
      const nextActivity = event.payload?.activity;
      if (!isCodexPetActivity(nextActivity)) {
        return;
      }
      baseActivityRef.current = nextActivity;
      setActivity(nextActivity);
      animationStartRef.current = null;
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onMoved(({ payload }) => {
      if (moveSaveTimerRef.current !== null) {
        window.clearTimeout(moveSaveTimerRef.current);
      }
      moveSaveTimerRef.current = window.setTimeout(() => {
        void setCodexNativePetPosition({
          x: Math.round(payload.x),
          y: Math.round(payload.y),
        }).catch(() => {});
      }, 250);
    });
    return () => {
      if (moveSaveTimerRef.current !== null) {
        window.clearTimeout(moveSaveTimerRef.current);
      }
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    const tick = (timestamp: number) => {
      if (animationStartRef.current === null) {
        animationStartRef.current = timestamp;
      }
      setFrame(getCodexPetFrame(activity, timestamp - animationStartRef.current));
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [activity]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    void getCurrentWindow().startDragging().catch(() => {});
  }, []);

  const handleWake = useCallback(() => {
    setActivity("waving");
    animationStartRef.current = null;
    window.setTimeout(() => {
      setActivity(baseActivityRef.current);
      animationStartRef.current = null;
    }, 1300);
  }, []);

  const label = pet?.displayName ?? t("petOverlay.fallbackName");
  const spriteStyle = {
    backgroundImage: spriteUrl ? `url("${spriteUrl}")` : undefined,
    backgroundPosition: `${-frame.frame * 128}px ${-frame.row * 128}px`,
  } as CSSProperties;

  return (
    <main
      className="codex-native-pet-window"
      onPointerDown={handlePointerDown}
      onDoubleClick={handleWake}
      data-tauri-drag-region
    >
      <div
        className="codex-native-pet-card"
        title={`${t("petOverlay.title")}: ${label}`}
        aria-label={`${t("petOverlay.title")}: ${label}`}
        data-tauri-drag-region
      >
        {spriteUrl ? (
          <span
            className={`codex-native-pet-sprite codex-native-pet-sprite--${activity}`}
            style={spriteStyle}
            aria-hidden
            data-tauri-drag-region
          />
        ) : (
          <span className="codex-native-pet-fallback" aria-hidden data-tauri-drag-region>
            {error ? "!" : "C"}
          </span>
        )}
      </div>
    </main>
  );
}

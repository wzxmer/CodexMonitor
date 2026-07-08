import { convertFileSrc } from "@tauri-apps/api/core";
import { useMemo } from "react";
import type { AppSettings } from "@/types";

type CodexPetProps = {
  enabled?: boolean;
  petId?: AppSettings["codexPetId"];
  customImagePath?: string | null;
  wakeVersion?: number;
};

const PET_LABELS: Record<Exclude<NonNullable<AppSettings["codexPetId"]>, "custom">, string> = {
  codex: "Codex",
  terminal: "Terminal",
  review: "Review",
};

export function CodexPet({
  enabled = false,
  petId = "codex",
  customImagePath = null,
  wakeVersion = 0,
}: CodexPetProps) {
  const customImageSrc = useMemo(
    () => (customImagePath ? convertFileSrc(customImagePath) : null),
    [customImagePath],
  );

  if (!enabled) {
    return null;
  }

  const resolvedPetId = petId === "custom" && customImageSrc ? "custom" : petId ?? "codex";
  const label =
    resolvedPetId === "custom" ? "Custom" : PET_LABELS[resolvedPetId] ?? PET_LABELS.codex;

  return (
    <button
      key={`${resolvedPetId}-${wakeVersion}`}
      type="button"
      className={`codex-pet codex-pet--${resolvedPetId}`}
      aria-label={`Codex pet: ${label}`}
      title={`Codex pet: ${label}`}
    >
      <span className="codex-pet-shadow" aria-hidden />
      <span className="codex-pet-body" aria-hidden>
        {resolvedPetId === "custom" && customImageSrc ? (
          <img src={customImageSrc} alt="" draggable={false} />
        ) : (
          <>
            <span className="codex-pet-ear codex-pet-ear--left" />
            <span className="codex-pet-ear codex-pet-ear--right" />
            <span className="codex-pet-face">
              <span className="codex-pet-eye" />
              <span className="codex-pet-eye" />
            </span>
            <span className="codex-pet-mark" />
          </>
        )}
      </span>
      <span className="codex-pet-bubble" aria-hidden>
        {label}
      </span>
    </button>
  );
}

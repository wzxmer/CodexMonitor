export type CodexPetActivity =
  | "idle"
  | "running"
  | "review"
  | "waiting"
  | "failed"
  | "waving";

export type CodexPetFrame = {
  row: number;
  frame: number;
};

type CodexPetAnimation = {
  row: number;
  frames: number;
  fps: number;
};

const PET_COLUMNS = 8;
const PET_ROWS = 9;

const ANIMATIONS: Record<CodexPetActivity, CodexPetAnimation> = {
  idle: { row: 0, frames: 8, fps: 6 },
  running: { row: 1, frames: 8, fps: 10 },
  review: { row: 2, frames: 8, fps: 7 },
  waiting: { row: 3, frames: 8, fps: 5 },
  failed: { row: 4, frames: 8, fps: 6 },
  waving: { row: 5, frames: 8, fps: 9 },
};

export function isCodexPetActivity(value: unknown): value is CodexPetActivity {
  return typeof value === "string" && value in ANIMATIONS;
}

export function getCodexPetFrame(
  activity: CodexPetActivity,
  elapsedMs: number,
): CodexPetFrame {
  const animation = ANIMATIONS[activity] ?? ANIMATIONS.idle;
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const frame = Math.floor((safeElapsed / 1000) * animation.fps) % animation.frames;
  return {
    row: Math.min(animation.row, PET_ROWS - 1),
    frame: Math.min(frame, PET_COLUMNS - 1),
  };
}

export function resolveCodexPetActivity(input: {
  hasErrors: boolean;
  isWaitingForUser: boolean;
  hasReviewPrompt: boolean;
  isProcessing: boolean;
}): CodexPetActivity {
  if (input.hasErrors) {
    return "failed";
  }
  if (input.isWaitingForUser) {
    return "waiting";
  }
  if (input.hasReviewPrompt) {
    return "review";
  }
  if (input.isProcessing) {
    return "running";
  }
  return "idle";
}

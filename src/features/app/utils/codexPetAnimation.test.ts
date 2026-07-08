import { describe, expect, it } from "vitest";
import {
  getCodexPetFrame,
  isCodexPetActivity,
  resolveCodexPetActivity,
} from "./codexPetAnimation";

describe("codexPetAnimation", () => {
  it("maps activity to stable spritesheet rows", () => {
    expect(getCodexPetFrame("idle", 0)).toEqual({ row: 0, frame: 0 });
    expect(getCodexPetFrame("running", 0)).toEqual({ row: 1, frame: 0 });
    expect(getCodexPetFrame("review", 0)).toEqual({ row: 2, frame: 0 });
    expect(getCodexPetFrame("waiting", 0)).toEqual({ row: 3, frame: 0 });
    expect(getCodexPetFrame("failed", 0)).toEqual({ row: 4, frame: 0 });
    expect(getCodexPetFrame("waving", 0)).toEqual({ row: 5, frame: 0 });
  });

  it("loops frames inside the 8-column spritesheet", () => {
    expect(getCodexPetFrame("running", 0).frame).toBe(0);
    expect(getCodexPetFrame("running", 100).frame).toBe(1);
    expect(getCodexPetFrame("running", 800).frame).toBe(0);
  });

  it("prioritizes user-visible states", () => {
    expect(
      resolveCodexPetActivity({
        hasErrors: true,
        isWaitingForUser: true,
        hasReviewPrompt: true,
        isProcessing: true,
      }),
    ).toBe("failed");
    expect(
      resolveCodexPetActivity({
        hasErrors: false,
        isWaitingForUser: true,
        hasReviewPrompt: true,
        isProcessing: true,
      }),
    ).toBe("waiting");
    expect(
      resolveCodexPetActivity({
        hasErrors: false,
        isWaitingForUser: false,
        hasReviewPrompt: true,
        isProcessing: true,
      }),
    ).toBe("review");
  });

  it("validates event payload activity values", () => {
    expect(isCodexPetActivity("running")).toBe(true);
    expect(isCodexPetActivity("unknown")).toBe(false);
  });
});

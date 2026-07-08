// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import {
  getCodexNativePetState,
  setCodexNativePetEnabled,
  setCodexNativePetSelected,
} from "@services/tauri";
import { SettingsPetsSection } from "./SettingsPetsSection";

const nativePetState = {
  enabled: true,
  selectedAvatarId: "eve",
  codexHome: "/tmp/codex",
  globalStatePath: "/tmp/codex/.codex-global-state.json",
  petsDir: "/tmp/codex-pets",
  pets: [
    {
      id: "bolt",
      displayName: "Bolt",
      description: "A small original boxy robot companion.",
      directory: "/tmp/codex-pets/bolt",
      spritesheetPath: "/tmp/codex-pets/bolt/spritesheet.webp",
    },
    {
      id: "eve",
      displayName: "EVE",
      description: "A tiny movie-faithful EVE robot companion.",
      directory: "/tmp/codex-pets/eve",
      spritesheetPath: "/tmp/codex-pets/eve/spritesheet.webp",
    },
  ],
};

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `tauri://${path}`,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
}));

vi.mock("@services/tauri", () => ({
  getCodexNativePetState: vi.fn(async () => nativePetState),
  setCodexNativePetEnabled: vi.fn(async (enabled: boolean) => ({
    ...nativePetState,
    enabled,
  })),
  setCodexNativePetSelected: vi.fn(async (selectedAvatarId: string) => ({
    ...nativePetState,
    selectedAvatarId,
  })),
  wakeCodexNativePet: vi.fn(async () => nativePetState),
  importCodexNativePet: vi.fn(async () => nativePetState),
}));

describe("SettingsPetsSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows native pets with previews and controls selection", async () => {
    const onUpdateAppSettings = vi.fn(async (_next: AppSettings) => {});

    const { container } = render(
      <SettingsPetsSection
        appSettings={
          ({
            codexPetId: "eve",
            codexPetEnabled: true,
            codexPetWakeVersion: 2,
          } as unknown) as AppSettings
        }
        onUpdateAppSettings={onUpdateAppSettings}
      />,
    );

    const petGroup = await screen.findByRole("radiogroup", {
      name: "Codex 宠物选择",
    });
    expect(within(petGroup).getByRole("radio", { name: /Bolt/ })).toBeTruthy();
    expect(
      within(petGroup)
        .getByRole("radio", { name: /EVE/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(container.querySelectorAll(".settings-codex-pet-preview img")).toHaveLength(2);

    fireEvent.click(within(petGroup).getByRole("radio", { name: /Bolt/ }));
    await waitFor(() => {
      expect(setCodexNativePetSelected).toHaveBeenCalledWith("bolt");
    });

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => {
      expect(getCodexNativePetState).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "收起宠物" }));
    await waitFor(() => {
      expect(setCodexNativePetEnabled).toHaveBeenCalledWith(false);
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          codexPetEnabled: false,
          codexPetId: "custom",
          codexPetCustomImagePath: "/tmp/codex-pets",
          codexPetWakeVersion: expect.any(Number),
        }),
      );
    });
  });
});

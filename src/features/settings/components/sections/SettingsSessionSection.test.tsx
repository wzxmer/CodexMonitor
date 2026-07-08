// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import { SettingsSessionSection } from "./SettingsSessionSection";

function renderSessionSection(
  settings: Partial<AppSettings>,
  onUpdateAppSettings = vi.fn(async () => {}),
) {
  const appSettings = ({
    chatHistoryScrollbackItems: 200,
    threadTitleAutogenerationEnabled: false,
    autoArchiveThreadsEnabled: false,
    autoArchiveThreadsDays: 7,
    ...settings,
  } as unknown) as AppSettings;

  render(
    <SettingsSessionSection
      appSettings={appSettings}
      onUpdateAppSettings={onUpdateAppSettings}
    />,
  );

  return { appSettings, onUpdateAppSettings };
}

describe("SettingsSessionSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("toggles auto archive", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    renderSessionSection({}, onUpdateAppSettings);

    const row = screen
      .getByText("自动归档旧会话")
      .closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole("button"));

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoArchiveThreadsEnabled: true }),
    );
  });

  it("updates auto archive days", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    renderSessionSection(
      { autoArchiveThreadsEnabled: true, autoArchiveThreadsDays: 7 },
      onUpdateAppSettings,
    );

    fireEvent.change(screen.getByLabelText("归档时间"), {
      target: { value: "15" },
    });

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoArchiveThreadsDays: 15 }),
    );
  });

  it("toggles auto-generated thread titles", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    renderSessionSection({}, onUpdateAppSettings);

    const row = screen
      .getByText("自动生成标题")
      .closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole("button"));

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ threadTitleAutogenerationEnabled: true }),
    );
  });

  it("toggles unlimited chat history", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    renderSessionSection({ chatHistoryScrollbackItems: 200 }, onUpdateAppSettings);

    const row = screen.getByText("不限聊天历史").closest(".settings-toggle-row");
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole("button"));

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: null }),
    );
  });

  it("disables scrollback controls when unlimited chat history is enabled", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    renderSessionSection({ chatHistoryScrollbackItems: null }, onUpdateAppSettings);

    const presetSelect = screen.getByLabelText("初始加载消息数量");
    expect((presetSelect as HTMLSelectElement).disabled).toBe(true);

    const maxItemsInput = screen.getByLabelText("初始加载上限");
    expect((maxItemsInput as HTMLInputElement).disabled).toBe(true);

    const maxItemsRow = maxItemsInput.closest(".settings-field-row");
    expect(maxItemsRow).toBeTruthy();
    const resetButton = within(maxItemsRow as HTMLElement).getByRole("button", {
      name: "重置",
    });
    expect((resetButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(presetSelect, { target: { value: "1000" } });
    expect(onUpdateAppSettings).not.toHaveBeenCalled();
  });

  it("applies scrollback presets", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    renderSessionSection({ chatHistoryScrollbackItems: 200 }, onUpdateAppSettings);

    fireEvent.change(screen.getByLabelText("初始加载消息数量"), {
      target: { value: "1000" },
    });

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: 1000 }),
    );
  });

  it("does not persist scrollback draft on blur when toggling unlimited", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    renderSessionSection({ chatHistoryScrollbackItems: 200 }, onUpdateAppSettings);

    const maxItemsInput = screen.getByLabelText("初始加载上限");
    fireEvent.change(maxItemsInput, { target: { value: "50" } });

    const unlimitedRow = screen
      .getByText("不限聊天历史")
      .closest(".settings-toggle-row");
    expect(unlimitedRow).toBeTruthy();
    const unlimitedButton = within(unlimitedRow as HTMLElement).getByRole("button");

    fireEvent.blur(maxItemsInput, { relatedTarget: unlimitedButton });
    fireEvent.click(unlimitedButton);

    expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: null }),
    );
  });

  it("does not persist scrollback draft on blur when clicking Reset", () => {
    const onUpdateAppSettings = vi.fn(async () => {});
    renderSessionSection({ chatHistoryScrollbackItems: 200 }, onUpdateAppSettings);

    const maxItemsInput = screen.getByLabelText("初始加载上限");
    fireEvent.change(maxItemsInput, { target: { value: "50" } });

    const maxItemsRow = maxItemsInput.closest(".settings-field-row");
    expect(maxItemsRow).toBeTruthy();
    const resetButton = within(maxItemsRow as HTMLElement).getByRole("button", {
      name: "重置",
    });

    fireEvent.blur(maxItemsInput, { relatedTarget: resetButton });
    fireEvent.click(resetButton);

    expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ chatHistoryScrollbackItems: 200 }),
    );
  });
});

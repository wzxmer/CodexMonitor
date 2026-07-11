// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import { CodexInstallPrompt } from "./CodexInstallPrompt";

describe("CodexInstallPrompt", () => {
  it("offers automatic install and existing CLI selection", () => {
    const onInstall = vi.fn();
    const onChooseExisting = vi.fn();
    render(
      <I18nProvider preference="zh">
        <CodexInstallPrompt open stage="ready" onInstall={onInstall} onChooseExisting={onChooseExisting} onLater={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "自动安装" }));
    fireEvent.click(screen.getByRole("button", { name: "选择已有 CLI" }));
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onChooseExisting).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import { FeatureIntroPrompt } from "./FeatureIntroPrompt";

describe("FeatureIntroPrompt", () => {
  it("shows the five core capabilities", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider preference="zh">
        <FeatureIntroPrompt open onClose={onClose} />
      </I18nProvider>,
    );
    expect(screen.getByText("多项目与多 Agent")).toBeTruthy();
    expect(screen.getByText("本地历史会话")).toBeTruthy();
    expect(screen.getByText("Git 与代码变更")).toBeTruthy();
    expect(screen.getByText("用量与配置")).toBeTruthy();
    expect(screen.getByText("远程访问")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionManagerConversation } from "./SessionManagerConversation";

describe("SessionManagerConversation", () => {
  it("loads one selected session in bounded visible batches", () => {
    const items = Array.from({ length: 45 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      text: `message ${index}`,
    }));

    const { container } = render(
      <SessionManagerConversation
        sessionKey="source:thread"
        items={items}
        loading={false}
        error={null}
        incomplete={false}
        fallback={null}
      />,
    );

    expect(container.querySelectorAll(".session-manager-preview-item")).toHaveLength(40);
    expect(screen.queryByText("message 0")).toBeNull();
    expect(screen.getByText("message 44")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "加载更早内容" }));

    expect(container.querySelectorAll(".session-manager-preview-item")).toHaveLength(45);
    expect(screen.getByText("message 0")).toBeTruthy();
  });
});

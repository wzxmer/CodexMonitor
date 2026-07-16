// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanPanel } from "./PlanPanel";

describe("PlanPanel", () => {
  it("shows a waiting label while processing without a plan", () => {
    render(<PlanPanel plan={null} isProcessing />);

    expect(screen.getByText("Waiting on a plan...")).toBeTruthy();
  });

  it("shows an empty label when idle without a plan", () => {
    render(<PlanPanel plan={null} isProcessing={false} />);

    expect(screen.getByText("No active plan.")).toBeTruthy();
  });

  it("shows a delta stream while the structured plan is stale", () => {
    render(
      <PlanPanel
        plan={{
          turnId: "turn-1",
          explanation: "Previous plan",
          steps: [{ step: "Previous step", status: "inProgress" }],
        }}
        planStream={"- Inspect source\n- Run tests"}
        activeTurnId="turn-2"
        isProcessing
      />,
    );

    expect(document.querySelector(".plan-stream")?.textContent).toBe(
      "- Inspect source\n- Run tests",
    );
    expect(screen.queryByText("Previous plan")).toBeNull();
  });

  it("shows the first delta before a structured plan arrives", () => {
    render(
      <PlanPanel
        plan={null}
        planStream="- Inspect source"
        activeTurnId="turn-1"
        isProcessing
      />,
    );

    const streams = document.querySelectorAll(".plan-stream");
    expect(streams[streams.length - 1]?.textContent).toBe("- Inspect source");
    const panels = document.querySelectorAll(".plan-panel");
    expect(panels[panels.length - 1]?.querySelector(".plan-empty")).toBeNull();
  });
});

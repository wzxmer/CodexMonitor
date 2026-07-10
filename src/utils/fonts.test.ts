import { describe, expect, it } from "vitest";
import { composeContentFontFamily, composeUiFontFamily } from "./fonts";

describe("font family composition", () => {
  it("places the selected CJK font before generic UI fallbacks", () => {
    expect(
      composeUiFontFamily(
        '"Segoe UI", system-ui, sans-serif',
        '"LXGW WenKai Screen", sans-serif',
        'system-ui, "Segoe UI", sans-serif',
      ),
    ).toBe('"Segoe UI", "LXGW WenKai Screen", system-ui, sans-serif');
  });

  it("keeps code fonts first while placing the CJK font before monospace", () => {
    expect(
      composeContentFontFamily(
        '"JetBrains Mono", ui-monospace, monospace',
        '"Microsoft YaHei UI", sans-serif',
        'system-ui, sans-serif',
      ),
    ).toBe(
      '"JetBrains Mono", "Microsoft YaHei UI", ui-monospace, monospace, sans-serif, system-ui',
    );
  });
});

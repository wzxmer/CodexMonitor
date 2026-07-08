import { describe, expect, it } from "vitest";
import { isChineseLocale, resolveAppLanguage } from "./appLanguage";

describe("appLanguage", () => {
  it("detects Chinese locales", () => {
    expect(isChineseLocale("zh-CN")).toBe(true);
    expect(isChineseLocale("zh-Hant")).toBe(true);
    expect(isChineseLocale("en-US")).toBe(false);
  });

  it("resolves explicit and system language preferences", () => {
    expect(resolveAppLanguage("zh", "en-US")).toBe("zh");
    expect(resolveAppLanguage("en", "zh-CN")).toBe("en");
    expect(resolveAppLanguage("system", "zh-CN")).toBe("zh");
    expect(resolveAppLanguage("system", "fr-FR")).toBe("en");
  });
});

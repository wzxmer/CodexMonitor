import { describe, expect, it } from "vitest";
import { buildNativeMenuLabels } from "./nativeMenuLabels";
import { I18N_STRINGS } from "./strings";

describe("native menu labels", () => {
  it("builds Chinese labels from the shared i18n table", () => {
    const labels = buildNativeMenuLabels((key) => I18N_STRINGS.zh[key]);

    expect(labels.file).toBe("文件");
    expect(labels.checkForUpdates).toBe("检查更新...");
    expect(labels.toggleProjectsSidebar).toBe("切换项目侧栏");
    expect(labels.undo).toBe("撤销");
  });

  it("builds English labels from the shared i18n table", () => {
    const labels = buildNativeMenuLabels((key) => I18N_STRINGS.en[key]);

    expect(labels.file).toBe("File");
    expect(labels.checkForUpdates).toBe("Check for Updates...");
    expect(labels.toggleProjectsSidebar).toBe("Toggle Projects Sidebar");
    expect(labels.undo).toBe("Undo");
  });
});

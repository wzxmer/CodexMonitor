import type { ConversationItem } from "@/types";

const ACTIVE_PLAN_STATUSES = new Set(["in_progress", "inprogress", "running", "started"]);

export function getActivePlanStream(items: ConversationItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind !== "tool" || item.toolType !== "plan") {
      continue;
    }
    const status = String(item.status ?? "")
      .replace(/[\s-]/g, "_")
      .toLowerCase();
    const output = item.output?.trim();
    if (output && ACTIVE_PLAN_STATUSES.has(status)) {
      return item.output ?? null;
    }
  }
  return null;
}

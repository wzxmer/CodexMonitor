export const DEFAULT_UI_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DEFAULT_UI_LATIN_FONT_FAMILY =
  '"Segoe UI", Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
export const DEFAULT_UI_CJK_FONT_FAMILY =
  '"Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif';

export const DEFAULT_CODE_FONT_FAMILY =
  'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export const CODE_FONT_SIZE_DEFAULT = 11;
export const CODE_FONT_SIZE_MIN = 9;
export const CODE_FONT_SIZE_MAX = 16;
export const UI_FONT_SIZE_DEFAULT = 13;
export const UI_FONT_SIZE_MIN = 11;
export const UI_FONT_SIZE_MAX = 17;
export const UI_FONT_WEIGHT_DEFAULT = 500;
export const UI_FONT_WEIGHT_MIN = 350;
export const UI_FONT_WEIGHT_MAX = 650;
export const MESSAGE_FONT_SIZE_DEFAULT = 13;
export const MESSAGE_FONT_SIZE_MIN = 12;
export const MESSAGE_FONT_SIZE_MAX = 18;
export const MESSAGE_FONT_WEIGHT_DEFAULT = 500;
export const MESSAGE_FONT_WEIGHT_MIN = 400;
export const MESSAGE_FONT_WEIGHT_MAX = 650;

export const UI_FONT_FAMILY_PRESETS = [
  { label: "系统默认", value: DEFAULT_UI_FONT_FAMILY },
  { label: "Segoe UI", value: '"Segoe UI", system-ui, sans-serif' },
  { label: "Microsoft YaHei UI", value: '"Microsoft YaHei UI", "Segoe UI", sans-serif' },
  { label: "Microsoft YaHei", value: '"Microsoft YaHei", "Segoe UI", sans-serif' },
  { label: "Inter", value: 'Inter, "Segoe UI", system-ui, sans-serif' },
  { label: "Arial", value: 'Arial, "Segoe UI", sans-serif' },
];

export const UI_LATIN_FONT_FAMILY_PRESETS = [
  { label: "Segoe UI", value: '"Segoe UI", system-ui, sans-serif' },
  { label: "Inter", value: 'Inter, "Segoe UI", system-ui, sans-serif' },
  { label: "Arial", value: 'Arial, "Segoe UI", sans-serif' },
  { label: "系统默认", value: DEFAULT_UI_LATIN_FONT_FAMILY },
];

export const UI_CJK_FONT_FAMILY_PRESETS = [
  { label: "Microsoft YaHei UI", value: DEFAULT_UI_CJK_FONT_FAMILY },
  { label: "Microsoft YaHei", value: '"Microsoft YaHei", "Microsoft YaHei UI", "Segoe UI", sans-serif' },
  { label: "Noto Sans CJK SC", value: '"Noto Sans CJK SC", "Microsoft YaHei UI", sans-serif' },
  { label: "SimSun", value: 'SimSun, "Microsoft YaHei UI", sans-serif' },
  { label: "系统默认", value: DEFAULT_UI_CJK_FONT_FAMILY },
];

export const CODE_FONT_FAMILY_PRESETS = [
  { label: "系统等宽默认", value: DEFAULT_CODE_FONT_FAMILY },
  { label: "Cascadia Mono", value: '"Cascadia Mono", "Segoe UI Mono", monospace' },
  { label: "Cascadia Code", value: '"Cascadia Code", "Cascadia Mono", monospace' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", "Cascadia Mono", monospace' },
  { label: "Consolas", value: 'Consolas, "Cascadia Mono", monospace' },
  { label: "Fira Code", value: '"Fira Code", "Cascadia Mono", monospace' },
];

export function normalizeFontFamily(
  value: string | null | undefined,
  fallback: string,
) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function clampCodeFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return CODE_FONT_SIZE_DEFAULT;
  }
  return Math.min(CODE_FONT_SIZE_MAX, Math.max(CODE_FONT_SIZE_MIN, value));
}

export function clampUiFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return UI_FONT_SIZE_DEFAULT;
  }
  return Math.min(UI_FONT_SIZE_MAX, Math.max(UI_FONT_SIZE_MIN, value));
}

export function clampUiFontWeight(value: number) {
  if (!Number.isFinite(value)) {
    return UI_FONT_WEIGHT_DEFAULT;
  }
  return Math.min(UI_FONT_WEIGHT_MAX, Math.max(UI_FONT_WEIGHT_MIN, value));
}

export function clampMessageFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return MESSAGE_FONT_SIZE_DEFAULT;
  }
  return Math.min(MESSAGE_FONT_SIZE_MAX, Math.max(MESSAGE_FONT_SIZE_MIN, value));
}

export function clampMessageFontWeight(value: number) {
  if (!Number.isFinite(value)) {
    return MESSAGE_FONT_WEIGHT_DEFAULT;
  }
  return Math.min(
    MESSAGE_FONT_WEIGHT_MAX,
    Math.max(MESSAGE_FONT_WEIGHT_MIN, value),
  );
}

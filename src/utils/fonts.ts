export const DEFAULT_UI_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const DEFAULT_UI_LATIN_FONT_FAMILY =
  '"Segoe UI", Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
export const DEFAULT_UI_CJK_FONT_FAMILY =
  '"PingFang SC", "Noto Sans SC Variable", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
export const WINDOWS_UI_CJK_FONT_FAMILY =
  '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';

const LEGACY_UI_CJK_FONT_FAMILIES = new Set([
  '"Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif',
  WINDOWS_UI_CJK_FONT_FAMILY,
  '"苹方-简", "Microsoft YaHei UI", sans-serif',
  '苹方-简, "Microsoft YaHei UI", sans-serif',
]);

export const DEFAULT_CODE_FONT_FAMILY =
  'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export const CODE_FONT_SIZE_DEFAULT = 13;
export const CODE_FONT_SIZE_MIN = 9;
export const CODE_FONT_SIZE_MAX = 18;
export const UI_FONT_SIZE_DEFAULT = 14;
export const UI_FONT_SIZE_MIN = 11;
export const UI_FONT_SIZE_MAX = 18;
export const UI_FONT_WEIGHT_DEFAULT = 450;
export const UI_FONT_WEIGHT_MIN = 350;
export const UI_FONT_WEIGHT_MAX = 650;
export const MESSAGE_FONT_SIZE_DEFAULT = 14;
export const MESSAGE_FONT_SIZE_MIN = 12;
export const MESSAGE_FONT_SIZE_MAX = 22;
export const PROCESS_FONT_SIZE_DEFAULT = 12;
export const PROCESS_FONT_SIZE_MIN = 10;
export const PROCESS_FONT_SIZE_MAX = 16;
export const MESSAGE_FONT_WEIGHT_DEFAULT = 450;
export const MESSAGE_FONT_WEIGHT_MIN = 400;
export const MESSAGE_FONT_WEIGHT_MAX = 650;

export const UI_FONT_FAMILY_PRESETS = [
  { label: "系统默认", value: DEFAULT_UI_FONT_FAMILY },
  { label: "Segoe UI", value: '"Segoe UI", system-ui, sans-serif' },
  { label: "Microsoft YaHei UI", value: WINDOWS_UI_CJK_FONT_FAMILY },
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
  { label: "PingFang / Noto Sans SC", value: DEFAULT_UI_CJK_FONT_FAMILY },
  { label: "Noto Sans SC", value: '"Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif' },
  { label: "Microsoft YaHei UI", value: '"Microsoft YaHei UI", "Segoe UI", sans-serif' },
  { label: "Microsoft YaHei", value: '"Microsoft YaHei", "Microsoft YaHei UI", "Segoe UI", sans-serif' },
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

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

function splitFontFamily(value: string) {
  const families: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const character of value) {
    if ((character === '"' || character === "'") && quote === null) {
      quote = character;
    } else if (character === quote) {
      quote = null;
    }

    if (character === "," && quote === null) {
      if (current.trim()) {
        families.push(current.trim());
      }
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    families.push(current.trim());
  }

  return families;
}

function normalizeFontFamilyName(value: string) {
  return value.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

export function composeFontFamily(...fontFamilies: Array<string | null | undefined>) {
  const namedFamilies: string[] = [];
  const genericFamilies: string[] = [];
  const seen = new Set<string>();

  for (const fontFamily of fontFamilies) {
    if (!fontFamily?.trim()) {
      continue;
    }

    for (const family of splitFontFamily(fontFamily)) {
      const normalized = normalizeFontFamilyName(family);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      if (GENERIC_FONT_FAMILIES.has(normalized)) {
        genericFamilies.push(family);
      } else {
        namedFamilies.push(family);
      }
    }
  }

  return [...namedFamilies, ...genericFamilies].join(", ");
}

export function composeUiFontFamily(
  latinFontFamily: string,
  cjkFontFamily: string,
  fallbackFontFamily: string,
) {
  return composeFontFamily(latinFontFamily, cjkFontFamily, fallbackFontFamily);
}

export function composeContentFontFamily(
  contentFontFamily: string,
  cjkFontFamily: string,
  fallbackFontFamily: string,
) {
  return composeFontFamily(contentFontFamily, cjkFontFamily, fallbackFontFamily);
}

export function normalizeFontFamily(
  value: string | null | undefined,
  fallback: string,
) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function normalizeUiCjkFontFamily(value: string | null | undefined) {
  const normalized = normalizeFontFamily(value, DEFAULT_UI_CJK_FONT_FAMILY);
  return LEGACY_UI_CJK_FONT_FAMILIES.has(normalized)
    ? DEFAULT_UI_CJK_FONT_FAMILY
    : normalized;
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

export function clampProcessFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return PROCESS_FONT_SIZE_DEFAULT;
  }
  return Math.min(PROCESS_FONT_SIZE_MAX, Math.max(PROCESS_FONT_SIZE_MIN, value));
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

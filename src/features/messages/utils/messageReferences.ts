export type MessageReferenceMode = "smart" | "full";
export type MessageReferenceDestination = "current" | "new";

export type MessageReferenceAction = {
  messageId: string;
  sourceRole: "user" | "assistant";
  sourceText: string;
  selectedText: string | null;
  mode: MessageReferenceMode;
  destination: MessageReferenceDestination;
};

export const SMART_REFERENCE_TOKEN_THRESHOLD = 2_000;

export function estimateReferenceTokens(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  const characters = Array.from(normalized).length;
  const bytes = new TextEncoder().encode(normalized).byteLength;
  return Math.max(1, Math.ceil(Math.max(characters, bytes) / 4));
}

export function defaultReferenceMode(text: string): MessageReferenceMode {
  return estimateReferenceTokens(text) >= SMART_REFERENCE_TOKEN_THRESHOLD
    ? "smart"
    : "full";
}

export function toMarkdownQuote(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")
    .concat("\n\n");
}

export function buildSmartReferencePrompt(input: {
  referenceId: string;
  path: string;
  sourceTitle: string;
  sourceRole: "user" | "assistant";
  characterCount: number;
  estimatedTokens: number;
  instruction?: string;
}) {
  const instruction = input.instruction?.trim();
  return [
    "<message_reference",
    `  id="${input.referenceId}"`,
    `  source_role="${input.sourceRole}"`,
    `  characters="${input.characterCount}"`,
    `  estimated_tokens="${input.estimatedTokens}"`,
    `  path="${input.path.replace(/"/g, "&quot;")}"`,
    ">",
    `Source: ${input.sourceTitle}`,
    "Read the referenced Markdown file only when its exact content is needed. Prefer targeted searches or partial reads over loading the full file.",
    "</message_reference>",
    ...(instruction ? ["", instruction] : []),
  ].join("\n");
}

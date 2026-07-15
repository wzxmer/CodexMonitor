export type ParsedSubagentCheckpoint = {
  checkpointId: string;
  childThreadId: string;
  childName?: string;
  priority: "normal" | "final";
  sequence: number;
  text: string;
};

export const SUBAGENT_CHECKPOINT_MAX_TEXT_LENGTH = 2_000;

const ATTRIBUTE_PATTERN = /([a-z_]+)="([^"]*)"/g;
const CLOSING_TAG = "</subagent_checkpoint>";
const ALLOWED_ATTRIBUTES = new Set([
  "checkpoint_id",
  "child_thread_id",
  "child_name",
  "priority",
  "sequence",
  "text_length",
]);

function decodeXmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(source: string) {
  const attributes = new Map<string, string>();
  let cursor = 0;
  ATTRIBUTE_PATTERN.lastIndex = 0;

  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    const index = match.index ?? 0;
    if (source.slice(cursor, index).trim()) {
      return null;
    }
    const name = match[1];
    if (!name || !ALLOWED_ATTRIBUTES.has(name) || attributes.has(name)) {
      return null;
    }
    attributes.set(name, decodeXmlAttribute(match[2] ?? ""));
    cursor = index + match[0].length;
  }

  if (source.slice(cursor).trim()) {
    return null;
  }
  return attributes;
}

function parseCheckpoint(
  attributes: Map<string, string>,
  body: string,
): ParsedSubagentCheckpoint | null {
  const checkpointId = attributes.get("checkpoint_id")?.trim() ?? "";
  const childThreadId = attributes.get("child_thread_id")?.trim() ?? "";
  const childName = attributes.get("child_name")?.trim() ?? "";
  const priority = attributes.get("priority");
  const sequenceText = attributes.get("sequence") ?? "";
  const sequence = Number(sequenceText);
  const textLengthValue = attributes.get("text_length");
  const textLength = textLengthValue === undefined ? null : Number(textLengthValue);
  const text = body.trim();
  if (
    !checkpointId ||
    !childThreadId ||
    !text ||
    text.length > SUBAGENT_CHECKPOINT_MAX_TEXT_LENGTH ||
    (priority !== "normal" && priority !== "final") ||
    !/^[1-9]\d*$/.test(sequenceText) ||
    !Number.isSafeInteger(sequence) ||
    (textLengthValue !== undefined &&
      (!/^[1-9]\d*$/.test(textLengthValue) ||
        !Number.isSafeInteger(textLength) ||
        textLength !== body.length))
  ) {
    return null;
  }
  const expectedKind = priority === "final" ? "final" : "progress";
  if (
    !checkpointId.startsWith(`${childThreadId}:`) ||
    !checkpointId.endsWith(`:${expectedKind}`)
  ) {
    return null;
  }

  return {
    checkpointId,
    childThreadId,
    ...(childName ? { childName } : {}),
    priority,
    sequence,
    text,
  };
}

function parseRemainder(source: string, cursor: number): ParsedSubagentCheckpoint[] | null {
  if (cursor === source.length) {
    return [];
  }
  const separatorLength = source.startsWith("\r\n\r\n", cursor)
    ? 4
    : source.startsWith("\n\n", cursor)
      ? 2
      : 0;
  if (!separatorLength) {
    return null;
  }
  return parseEnvelopeAt(source, cursor + separatorLength);
}

function parseEnvelopeAt(
  source: string,
  cursor: number,
): ParsedSubagentCheckpoint[] | null {
  const openingPattern = /<subagent_checkpoint ([^>\r\n]+)>\r?\n/y;
  openingPattern.lastIndex = cursor;
  const opening = openingPattern.exec(source);
  if (!opening || opening.index !== cursor) {
    return null;
  }
  const attributes = parseAttributes(opening[1] ?? "");
  if (!attributes) {
    return null;
  }
  const bodyStart = openingPattern.lastIndex;
  const declaredLengthText = attributes.get("text_length");

  if (declaredLengthText !== undefined) {
    const declaredLength = Number(declaredLengthText);
    if (!/^[1-9]\d*$/.test(declaredLengthText) || !Number.isSafeInteger(declaredLength)) {
      return null;
    }
    const bodyEnd = bodyStart + declaredLength;
    const lineBreakLength = source.startsWith("\r\n", bodyEnd)
      ? 2
      : source.startsWith("\n", bodyEnd)
        ? 1
        : 0;
    const closingStart = bodyEnd + lineBreakLength;
    if (!lineBreakLength || !source.startsWith(CLOSING_TAG, closingStart)) {
      return null;
    }
    const checkpoint = parseCheckpoint(attributes, source.slice(bodyStart, bodyEnd));
    if (!checkpoint) {
      return null;
    }
    const remainder = parseRemainder(source, closingStart + CLOSING_TAG.length);
    return remainder ? [checkpoint, ...remainder] : null;
  }

  let closingStart = source.indexOf(CLOSING_TAG, bodyStart);
  while (closingStart >= 0) {
    const lineBreakLength =
      closingStart >= 2 && source.slice(closingStart - 2, closingStart) === "\r\n"
        ? 2
        : closingStart >= 1 && source[closingStart - 1] === "\n"
          ? 1
          : 0;
    if (lineBreakLength) {
      const checkpoint = parseCheckpoint(
        attributes,
        source.slice(bodyStart, closingStart - lineBreakLength),
      );
      if (checkpoint) {
        const remainder = parseRemainder(source, closingStart + CLOSING_TAG.length);
        if (remainder) {
          return [checkpoint, ...remainder];
        }
      }
    }
    closingStart = source.indexOf(CLOSING_TAG, closingStart + CLOSING_TAG.length);
  }
  return null;
}

export function parseSubagentCheckpointEnvelopes(
  text: string,
): ParsedSubagentCheckpoint[] | null {
  const source = text.trim();
  if (!source.startsWith("<subagent_checkpoint ")) {
    return null;
  }
  return parseEnvelopeAt(source, 0);
}

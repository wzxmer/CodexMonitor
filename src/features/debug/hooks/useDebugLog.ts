import { useCallback, useMemo, useRef, useState } from "react";
import type { DebugEntry } from "../../../types";

const MAX_DEBUG_ENTRIES = 200;
export const MAX_DEBUG_PAYLOAD_CHARS = 8_000;
export const MAX_DEBUG_TOTAL_CHARS = 200_000;
const MAX_DEBUG_DEPTH = 5;
const MAX_DEBUG_OBJECT_KEYS = 24;
const MAX_DEBUG_ARRAY_ITEMS = 5;
const MAX_DEBUG_STRING_CHARS = 1_000;
const MAX_DEBUG_ID_CHARS = 256;
const MAX_DEBUG_LABEL_CHARS = 512;
const TRUNCATED_MARKER = "[truncated]";

type DebugRecord = {
  entry: DebugEntry;
  size: number;
};

function truncateString(value: string, maxChars = MAX_DEBUG_STRING_CHARS) {
  if (value.length <= maxChars) {
    return value;
  }
  const suffix = `... ${TRUNCATED_MARKER}`;
  return `${value.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

function compactPayloadValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") {
    return truncateString(value);
  }
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      _type: value.name,
      message: truncateString(value.message),
      stack: value.stack ? truncateString(value.stack) : undefined,
    };
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  if (depth >= MAX_DEBUG_DEPTH) {
    return {
      _type: Array.isArray(value) ? "array" : "object",
      ...(Array.isArray(value) ? { count: value.length } : {}),
      _truncated: "max-depth",
    };
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return {
        _type: "array",
        count: value.length,
        sample: value
          .slice(0, MAX_DEBUG_ARRAY_ITEMS)
          .map((item) => compactPayloadValue(item, depth + 1, seen)),
        ...(value.length > MAX_DEBUG_ARRAY_ITEMS
          ? { _truncated: "max-items" }
          : {}),
      };
    }

    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue);
    const summarized: Record<string, unknown> = {};
    keys.slice(0, MAX_DEBUG_OBJECT_KEYS).forEach((key) => {
      summarized[key] = compactPayloadValue(objectValue[key], depth + 1, seen);
    });
    if (keys.length > MAX_DEBUG_OBJECT_KEYS) {
      summarized._truncatedKeys = keys.length - MAX_DEBUG_OBJECT_KEYS;
    }
    return summarized;
  } finally {
    seen.delete(value);
  }
}

export function summarizeDebugPayload(payload: unknown): unknown {
  const compact = compactPayloadValue(payload, 0, new WeakSet<object>());
  if (compact === undefined || typeof compact === "string") {
    return compact;
  }
  const serialized = JSON.stringify(compact);
  if (serialized.length <= MAX_DEBUG_PAYLOAD_CHARS) {
    return compact;
  }
  return truncateString(serialized, MAX_DEBUG_PAYLOAD_CHARS);
}

function getEntrySize(entry: DebugEntry) {
  return JSON.stringify(entry).length;
}

export function useDebugLog() {
  const [debugOpen, setDebugOpenState] = useState(false);
  const [debugRecords, setDebugRecords] = useState<DebugRecord[]>([]);
  const [hasDebugAlerts, setHasDebugAlerts] = useState(false);
  const [debugPinned, setDebugPinned] = useState(false);
  const debugOpenRef = useRef(debugOpen);
  debugOpenRef.current = debugOpen;

  const isAlertEntry = useCallback((entry: DebugEntry) => {
    if (entry.source === "error" || entry.source === "stderr") {
      return true;
    }
    const label = entry.label.toLowerCase();
    if (label.includes("warn") || label.includes("warning")) {
      return true;
    }
    if (typeof entry.payload === "string") {
      const payload = entry.payload.toLowerCase();
      return payload.includes("warn") || payload.includes("warning");
    }
    return false;
  }, []);

  const addDebugEntry = useCallback(
    (entry: DebugEntry) => {
      const isAlert = isAlertEntry(entry);
      if (!debugOpenRef.current && !isAlert) {
        return;
      }
      if (isAlert) {
        setHasDebugAlerts(true);
      }
      const compactEntry = {
        ...entry,
        id: truncateString(entry.id, MAX_DEBUG_ID_CHARS),
        label: truncateString(entry.label, MAX_DEBUG_LABEL_CHARS),
        payload: summarizeDebugPayload(entry.payload),
      };
      const nextRecord = { entry: compactEntry, size: getEntrySize(compactEntry) };
      setDebugRecords((previous) => {
        const next = [...previous, nextRecord].slice(-MAX_DEBUG_ENTRIES);
        let totalChars = next.reduce((total, record) => total + record.size, 0);
        while (next.length > 1 && totalChars > MAX_DEBUG_TOTAL_CHARS) {
          totalChars -= next.shift()?.size ?? 0;
        }
        return next;
      });
    },
    [isAlertEntry],
  );

  const debugEntries = useMemo(
    () => debugRecords.map((record) => record.entry),
    [debugRecords],
  );

  const handleCopyDebug = useCallback(async () => {
    const text = debugEntries
      .map((entry) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        const payload =
          entry.payload !== undefined
            ? typeof entry.payload === "string"
              ? entry.payload
              : JSON.stringify(entry.payload, null, 2)
            : "";
        return [entry.source.toUpperCase(), timestamp, entry.label, payload]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  }, [debugEntries]);

  const clearDebugEntries = useCallback(() => {
    setDebugRecords([]);
    setHasDebugAlerts(false);
  }, []);

  const setDebugOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setDebugOpenState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (resolved) {
          setDebugPinned(true);
        }
        return resolved;
      });
    },
    [],
  );

  const showDebugButton = hasDebugAlerts || debugOpen || debugPinned;

  return {
    debugOpen,
    setDebugOpen,
    debugEntries,
    hasDebugAlerts,
    showDebugButton,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
  };
}

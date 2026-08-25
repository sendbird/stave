import {
  DEFAULT_LENS_SESSION_ID,
  type BrowserConsoleArgument,
  type BrowserConsoleEntry,
  type BrowserConsoleObjectProperty,
  type BrowserNetworkBody,
  type BrowserNetworkEntry,
  type BrowserNetworkTiming,
  type BrowserStackTrace,
  type LensAnnotation,
  type LensBounds,
  type LensDownloadEntry,
} from "@/lib/lens/lens.types";
import {
  formatLensNetworkBytes,
  formatLensNetworkStatus,
} from "@/lib/lens/lens-network";

export const LENS_LOG_LIMIT = 200;

export type LensPanelTab = "preview" | "console" | "network";
export type ConsoleLevelFilter = "all" | BrowserConsoleEntry["level"];

export const CONSOLE_LEVEL_FILTERS: ConsoleLevelFilter[] = [
  "all",
  "error",
  "warn",
  "info",
  "log",
  "debug",
];

export function appendLimited<T>(entries: T[], entry: T): T[] {
  return [...entries, entry].slice(-LENS_LOG_LIMIT);
}

export function upsertConsoleEntriesLimited(
  entries: BrowserConsoleEntry[],
  incoming: BrowserConsoleEntry[],
): BrowserConsoleEntry[] {
  const byEntryId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    byEntryId.set(entry.id, entry);
  }
  return [...byEntryId.values()].slice(-LENS_LOG_LIMIT);
}

export function upsertNetworkEntriesLimited(
  entries: BrowserNetworkEntry[],
  incoming: BrowserNetworkEntry[],
): BrowserNetworkEntry[] {
  const byEntryId = new Map(entries.map((entry) => [entry.entryId, entry]));
  for (const entry of incoming) {
    byEntryId.set(entry.entryId, entry);
  }
  return [...byEntryId.values()].slice(-LENS_LOG_LIMIT);
}

export function matchesSession(
  payload: { workspaceId: string; lensSessionId?: string },
  workspaceId: string,
  lensSessionId: string,
): boolean {
  return (
    payload.workspaceId === workspaceId &&
    (payload.lensSessionId ?? DEFAULT_LENS_SESSION_ID) === lensSessionId
  );
}

export function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "-";
  }
  if (value < 1) {
    return "<1 ms";
  }
  if (value < 1_000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1_000).toFixed(2)} s`;
}

export function formatNetworkHeaders(
  headers: BrowserNetworkEntry["requestHeaders"],
): string {
  if (!headers || Object.keys(headers).length === 0) {
    return "No captured headers.";
  }
  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, values]) => values.map((value) => `${name}: ${value}`))
    .join("\n");
}

export function getConsoleLevelClass(level: BrowserConsoleEntry["level"]) {
  switch (level) {
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "warn":
      return "border-warning/30 bg-warning/10 text-warning";
    case "info":
      return "border-primary/30 bg-primary/10 text-primary";
    case "debug":
      return "border-muted-foreground/30 bg-muted/50 text-muted-foreground";
    default:
      return "border-border bg-muted/60 text-foreground";
  }
}

export function getNetworkStatusClass(entry: BrowserNetworkEntry) {
  if (entry.state === "pending") {
    return "text-muted-foreground";
  }
  if (entry.state === "failed") {
    return "text-destructive";
  }
  const status = entry.status;
  if (!status) {
    return "text-muted-foreground";
  }
  if (status >= 500) {
    return "text-destructive";
  }
  if (status >= 400) {
    return "text-warning";
  }
  if (status >= 300) {
    return "text-primary";
  }
  return "text-success";
}

export function formatNetworkRowStatus(entry: BrowserNetworkEntry): string {
  if (entry.state === "pending") {
    return "Pending";
  }
  if (entry.state === "failed") {
    return entry.status ? String(entry.status) : "Failed";
  }
  return entry.status ? String(entry.status) : "Done";
}

export function formatConsoleEntries(entries: BrowserConsoleEntry[]): string {
  return entries
    .map((entry) => {
      const source = entry.source ? ` ${entry.source}` : "";
      return `[${entry.timestamp}] ${entry.level.toUpperCase()}${source} ${entry.text}`;
    })
    .join("\n");
}

export function formatNetworkEntries(entries: BrowserNetworkEntry[]): string {
  return entries
    .map((entry) => {
      const status = entry.status ?? "-";
      const type = entry.resourceType ?? entry.mimeType ?? "-";
      const duration = formatDuration(entry.durationMs);
      const error = entry.error ? ` ${entry.error}` : "";
      return `[${entry.timestamp}] ${entry.method} ${status} ${type} ${duration} ${entry.url}${error}`;
    })
    .join("\n");
}

export function formatNetworkEntryDetails(entry: BrowserNetworkEntry): string {
  return [
    `Request URL: ${entry.url}`,
    `Method: ${entry.method}`,
    `Status: ${formatLensNetworkStatus(entry)}`,
    `Resource type: ${entry.resourceType ?? "-"}`,
    `MIME type: ${entry.mimeType ?? "-"}`,
    `Started: ${entry.startedAt ?? "-"}`,
    `Completed: ${entry.timestamp}`,
    `Duration: ${formatDuration(entry.durationMs)}`,
    `Transferred: ${formatLensNetworkBytes(entry.responseSize)}`,
    `Cache: ${entry.fromCache ? "Yes" : "No"}`,
    entry.referrer ? `Referrer: ${entry.referrer}` : "",
    entry.error ? `Failure: ${entry.error}` : "",
    "",
    "Request headers",
    formatNetworkHeaders(entry.requestHeaders),
    "",
    "Response headers",
    formatNetworkHeaders(entry.responseHeaders),
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n");
}

export type ConsoleInspectableValue =
  BrowserConsoleArgument | BrowserConsoleObjectProperty;

export function formatConsoleInspectableValue(
  value: ConsoleInspectableValue,
): string {
  if ("description" in value && value.description) {
    return value.description;
  }
  if ("unserializableValue" in value && value.unserializableValue) {
    return value.unserializableValue;
  }
  if (value.value !== undefined) {
    return typeof value.value === "string"
      ? value.value
      : JSON.stringify(value.value);
  }
  if (value.preview?.description) {
    return value.preview.description;
  }
  return value.subtype ?? value.type;
}

export function flattenStackTrace(
  stackTrace: BrowserStackTrace | undefined,
): Array<{
  frame: BrowserStackTrace["callFrames"][number];
  depth: number;
  description?: string;
}> {
  const frames: Array<{
    frame: BrowserStackTrace["callFrames"][number];
    depth: number;
    description?: string;
  }> = [];
  let current = stackTrace;
  let depth = 0;
  while (current) {
    for (const frame of current.callFrames) {
      frames.push({ frame, depth, description: current.description });
    }
    current = current.parent;
    depth += 1;
  }
  return frames;
}

export function formatNetworkBodyContent(body: BrowserNetworkBody): string {
  if (!body.content) {
    return "";
  }
  if (body.kind !== "json") {
    return body.content;
  }
  try {
    return JSON.stringify(JSON.parse(body.content), null, 2);
  } catch {
    return body.content;
  }
}

export type NetworkTimingPhase = {
  label: string;
  start: number;
  end: number;
};

export function getNetworkTimingPhases(
  timing: BrowserNetworkTiming | undefined,
  durationMs: number | undefined,
): NetworkTimingPhase[] {
  if (!timing) {
    return [];
  }
  const phases: Array<[string, number | undefined, number | undefined]> = [
    ["Proxy", timing.proxyStart, timing.proxyEnd],
    ["DNS", timing.dnsStart, timing.dnsEnd],
    ["Connect", timing.connectStart, timing.connectEnd],
    ["SSL", timing.sslStart, timing.sslEnd],
    ["Worker", timing.workerStart, timing.workerRespondWithSettled],
    ["Send", timing.sendStart, timing.sendEnd],
    ["Waiting", timing.sendEnd, timing.receiveHeadersStart],
    ["Headers", timing.receiveHeadersStart, timing.receiveHeadersEnd],
  ];
  const total =
    typeof durationMs === "number" && Number.isFinite(durationMs)
      ? durationMs
      : undefined;
  if (
    total !== undefined &&
    timing.receiveHeadersEnd !== undefined &&
    timing.receiveHeadersEnd >= 0 &&
    total >= timing.receiveHeadersEnd
  ) {
    phases.push(["Download", timing.receiveHeadersEnd, total]);
  }
  return phases.flatMap(([label, start, end]) =>
    start !== undefined && end !== undefined && start >= 0 && end >= start
      ? [{ label, start, end }]
      : [],
  );
}

export function areLensBoundsEqual(
  left: LensBounds | null,
  right: LensBounds | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function mergeDownloadEntry(
  entries: LensDownloadEntry[],
  entry: LensDownloadEntry,
): LensDownloadEntry[] {
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  const next =
    index >= 0
      ? entries.map((candidate, candidateIndex) =>
          candidateIndex === index ? entry : candidate,
        )
      : [...entries, entry];
  return next.slice(-20);
}

export function mergeAnnotationEntry(
  annotations: LensAnnotation[],
  annotation: LensAnnotation,
): LensAnnotation[] {
  const index = annotations.findIndex(
    (candidate) => candidate.id === annotation.id,
  );
  if (index >= 0) {
    return annotations.map((candidate, candidateIndex) =>
      candidateIndex === index ? annotation : candidate,
    );
  }
  return [...annotations, annotation].sort(
    (left, right) => left.pin - right.pin,
  );
}

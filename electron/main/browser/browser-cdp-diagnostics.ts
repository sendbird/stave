import { randomUUID } from "node:crypto";
import type {
  BrowserConsoleArgument,
  BrowserConsoleEntry,
  BrowserConsoleEntryDetail,
  BrowserConsoleObjectPreview,
  BrowserConsoleObjectProperties,
  BrowserNetworkBody,
  BrowserNetworkEntry,
  BrowserNetworkEntryDetail,
  BrowserNetworkHeaders,
  BrowserNetworkInitiator,
  BrowserNetworkRedirect,
  BrowserNetworkTiming,
  BrowserStackTrace,
  LensDiagnosticsCaptureState,
} from "../../../src/lib/lens/lens.types";
import {
  isLensTextMimeType,
  isLensSensitiveFieldName,
  MAX_LENS_NETWORK_BODY_BYTES,
  sanitizeLensNetworkBody,
  sanitizeLensNetworkHeaders,
  sanitizeLensNetworkUrl,
} from "../../../src/lib/lens/lens-network";
import { normalizeLensHostEntry } from "../../../src/lib/lens/lens-security";
import type { LensConsoleRateLimitDecision } from "../../../src/lib/lens/lens-console";
import type { LensRateLimitDecision } from "../../../src/lib/lens/lens-rate-limit";
import {
  detachCdpController,
  disposeCdpController,
  sendCdpCommand,
  sendCdpCommandIfAttached,
  subscribeCdpDetach,
  subscribeCdpMessages,
} from "./browser-cdp-controller";
import {
  subscribeLensCdpPolicy,
  type LensCdpPolicyConfig,
} from "./browser-cdp-policy";

const MAX_CONSOLE_DETAILS = 200;
const MAX_NETWORK_DETAILS = 200;
const MAX_REMOTE_OBJECT_HANDLES = 100;
const REMOTE_OBJECT_HANDLE_TTL_MS = 2 * 60_000;
const MAX_STACK_DEPTH = 8;
const MAX_STACK_FRAMES = 100;
const MAX_CONSOLE_ARGUMENTS = 20;
const MAX_OBJECT_PROPERTIES = 100;
const MAX_TEXT_VALUE_LENGTH = 8_192;
const MAX_PENDING_NETWORK_REQUESTS = 500;
const MAX_BODY_STORE_BYTES = 8 * 1_024 * 1_024;
const MAX_ACTIVE_DIAGNOSTICS_CAPTURES = 4;
const MAX_CONCURRENT_RESPONSE_BODY_LOADS = 4;

type JsonRecord = Record<string, unknown>;

interface RemoteObjectHandle {
  entryId: string;
  objectId: string;
  expiresAt: number;
}

interface ExecutionContextDetail {
  id: number;
  name?: string;
  origin?: string;
  frameId?: string;
  isDefault?: boolean;
}

interface PendingResponseExtraInfo {
  headers?: BrowserNetworkHeaders;
  status?: number;
}

interface PendingNetworkRequest {
  entryId: string;
  requestId: string;
  hop: number;
  url: string;
  method: string;
  resourceType?: BrowserNetworkEntry["resourceType"];
  requestTimestamp: number;
  wallTime?: number;
  requestHeaders?: BrowserNetworkHeaders;
  responseHeaders?: BrowserNetworkHeaders;
  referrer?: string;
  initiator?: BrowserNetworkInitiator;
  priority?: string;
  redirects: BrowserNetworkRedirect[];
  status?: number;
  statusText?: string;
  mimeType?: string;
  responseTimestamp?: number;
  responseSize?: number;
  fromCache?: boolean;
  fromServiceWorker?: boolean;
  protocol?: string;
  remoteAddress?: string;
  connectionId?: number;
  connectionReused?: boolean;
  timing?: BrowserNetworkTiming;
  requestBody?: BrowserNetworkBody;
  responseBody?: BrowserNetworkBody;
  error?: string;
  requestExtraApplied?: boolean;
  responseExtraApplied?: boolean;
}

interface DiagnosticsCapture {
  webContentsId: number;
  workspaceId: string;
  lensSessionId: string;
  host: string;
  enabled: boolean;
  generation: number;
  onConsoleEntry: (entry: BrowserConsoleEntry) => void;
  acceptConsoleEntry?: () => LensConsoleRateLimitDecision;
  acceptNetworkRequest?: () => LensRateLimitDecision;
  onNetworkEntry: (entry: BrowserNetworkEntry) => void;
  shouldIgnoreConsoleText?: (text: string) => boolean;
  unsubscribeMessage: () => void;
  unsubscribeDetach: () => void;
  pendingNetwork: Map<string, PendingNetworkRequest>;
  pendingRequestExtraInfo: Map<string, BrowserNetworkHeaders[]>;
  pendingResponseExtraInfo: Map<string, PendingResponseExtraInfo[]>;
  requestExtraTargets: Map<string, PendingNetworkRequest[]>;
  responseExtraTargets: Map<string, PendingNetworkRequest[]>;
  consoleDetails: Map<string, BrowserConsoleEntryDetail>;
  networkDetails: Map<string, BrowserNetworkEntryDetail>;
  objectHandles: Map<string, RemoteObjectHandle>;
  objectHandlePruneTimer: ReturnType<typeof setTimeout> | null;
  bodyStore: BoundedBodyStore;
  recentConsole: Map<string, number>;
  executionContexts: Map<number, ExecutionContextDetail>;
  activeResponseBodyLoads: number;
}

class BoundedBodyStore {
  private readonly bodies = new Map<string, BrowserNetworkBody>();
  private totalBytes = 0;

  set(key: string, body: BrowserNetworkBody) {
    this.delete(key);
    this.bodies.set(key, body);
    this.totalBytes += body.capturedBytes;
    while (this.totalBytes > MAX_BODY_STORE_BYTES && this.bodies.size > 0) {
      const oldest = this.bodies.keys().next().value;
      if (!oldest) break;
      this.delete(oldest);
    }
  }

  get(key: string) {
    const body = this.bodies.get(key);
    if (!body) return undefined;
    this.bodies.delete(key);
    this.bodies.set(key, body);
    return body;
  }

  delete(key: string) {
    const existing = this.bodies.get(key);
    if (!existing) return;
    this.totalBytes -= existing.capturedBytes;
    this.bodies.delete(key);
  }

  deleteEntry(entryId: string) {
    this.delete(bodyKey(entryId, "request"));
    this.delete(bodyKey(entryId, "response"));
  }

  clear() {
    this.bodies.clear();
    this.totalBytes = 0;
  }
}

const captures = new Map<number, DiagnosticsCapture>();

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function truncateText(value: string | undefined, max = MAX_TEXT_VALUE_LENGTH) {
  if (!value) return value;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sanitizeDiagnosticLocation(value: string | undefined) {
  if (!value) return value;
  return /^[a-z][a-z\d+.-]*:/i.test(value)
    ? truncateText(sanitizeLensNetworkUrl(value))
    : truncateText(value);
}

function toIsoFromEpochMilliseconds(value: number | undefined) {
  const date = value === undefined ? new Date() : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function completionTimestamp(
  request: PendingNetworkRequest,
  completedTimestamp: number,
) {
  if (request.wallTime !== undefined) {
    return toIsoFromEpochMilliseconds(
      (request.wallTime +
        Math.max(0, completedTimestamp - request.requestTimestamp)) *
        1_000,
    );
  }
  return new Date().toISOString();
}

function mapResourceType(
  value: string | undefined,
): BrowserNetworkEntry["resourceType"] {
  const normalized = value?.toLowerCase();
  const mapping: Record<string, BrowserNetworkEntry["resourceType"]> = {
    document: "mainFrame",
    stylesheet: "stylesheet",
    image: "image",
    media: "media",
    font: "font",
    script: "script",
    xhr: "xhr",
    fetch: "xhr",
    ping: "ping",
    cspviolationreport: "cspReport",
    websocket: "webSocket",
  };
  return (normalized && mapping[normalized]) || "other";
}

function mapStackTrace(
  value: unknown,
  depth = 0,
): BrowserStackTrace | undefined {
  const trace = asRecord(value);
  if (!trace || depth >= MAX_STACK_DEPTH) return undefined;
  const callFrames = asArray(trace.callFrames)
    .slice(0, MAX_STACK_FRAMES)
    .map(asRecord)
    .filter((frame): frame is JsonRecord => Boolean(frame))
    .map((frame) => ({
      functionName: truncateText(asString(frame.functionName)) ?? "(anonymous)",
      url: sanitizeDiagnosticLocation(asString(frame.url)) ?? "",
      lineNumber: (asNumber(frame.lineNumber) ?? 0) + 1,
      columnNumber: (asNumber(frame.columnNumber) ?? 0) + 1,
      scriptId: asString(frame.scriptId),
    }));
  const parent = mapStackTrace(trace.parent, depth + 1);
  if (callFrames.length === 0 && !parent) return undefined;
  return {
    description: truncateText(asString(trace.description)),
    callFrames,
    parent,
  };
}

function mapObjectPreview(
  value: unknown,
  depth = 0,
): BrowserConsoleObjectPreview | undefined {
  const preview = asRecord(value);
  if (!preview || depth >= 3) return undefined;
  const properties = asArray(preview.properties)
    .slice(0, MAX_OBJECT_PROPERTIES)
    .map(asRecord)
    .filter((property): property is JsonRecord => Boolean(property))
    .map((property) => {
      const name = truncateText(asString(property.name)) ?? "";
      const sensitive = isLensSensitiveFieldName(name);
      return {
        name,
        type: asString(property.type) ?? "unknown",
        subtype: asString(property.subtype),
        value: sensitive
          ? "[redacted]"
          : truncateText(asString(property.value)),
        preview: sensitive
          ? undefined
          : mapObjectPreview(property.valuePreview, depth + 1),
      };
    });
  return {
    description: truncateText(asString(preview.description)),
    overflow: asBoolean(preview.overflow) ?? false,
    properties,
  };
}

function primitiveRemoteValue(value: unknown) {
  return value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined;
}

function releaseObject(objectId: string, webContentsId: number) {
  void sendCdpCommandIfAttached(webContentsId, "Runtime.releaseObject", {
    objectId,
  }).catch(() => undefined);
}

function releaseDescriptorRemoteObjects(
  descriptor: JsonRecord,
  webContentsId: number,
  includeValue: boolean,
) {
  const fields = includeValue
    ? (["value", "get", "set"] as const)
    : (["get", "set"] as const);
  const objectIds = new Set<string>();
  for (const field of fields) {
    const objectId = asString(asRecord(descriptor[field])?.objectId);
    if (objectId) objectIds.add(objectId);
  }
  for (const objectId of objectIds) {
    releaseObject(objectId, webContentsId);
  }
}

function clearObjectHandlePruneTimer(capture: DiagnosticsCapture) {
  if (capture.objectHandlePruneTimer) {
    clearTimeout(capture.objectHandlePruneTimer);
    capture.objectHandlePruneTimer = null;
  }
}

function scheduleObjectHandlePrune(capture: DiagnosticsCapture) {
  clearObjectHandlePruneTimer(capture);
  let nextExpiry = Number.POSITIVE_INFINITY;
  for (const remote of capture.objectHandles.values()) {
    nextExpiry = Math.min(nextExpiry, remote.expiresAt);
  }
  if (!Number.isFinite(nextExpiry)) return;
  capture.objectHandlePruneTimer = setTimeout(
    () => {
      capture.objectHandlePruneTimer = null;
      pruneObjectHandles(capture);
    },
    Math.max(0, nextExpiry - Date.now()),
  );
  capture.objectHandlePruneTimer.unref?.();
}

function pruneObjectHandles(capture: DiagnosticsCapture) {
  const now = Date.now();
  for (const [handle, remote] of capture.objectHandles) {
    if (remote.expiresAt > now) continue;
    capture.objectHandles.delete(handle);
    releaseObject(remote.objectId, capture.webContentsId);
  }
  while (capture.objectHandles.size > MAX_REMOTE_OBJECT_HANDLES) {
    const oldest = capture.objectHandles.entries().next().value as
      [string, RemoteObjectHandle] | undefined;
    if (!oldest) break;
    capture.objectHandles.delete(oldest[0]);
    releaseObject(oldest[1].objectId, capture.webContentsId);
  }
  scheduleObjectHandlePrune(capture);
}

function registerObjectHandle(
  capture: DiagnosticsCapture,
  entryId: string,
  objectId: string | undefined,
) {
  if (!objectId) return undefined;
  const handle = randomUUID();
  capture.objectHandles.set(handle, {
    entryId,
    objectId,
    expiresAt: Date.now() + REMOTE_OBJECT_HANDLE_TTL_MS,
  });
  pruneObjectHandles(capture);
  return handle;
}

function toConsoleArgument(
  capture: DiagnosticsCapture,
  entryId: string,
  value: unknown,
): BrowserConsoleArgument {
  const remote = asRecord(value) ?? {};
  const type = asString(remote.type) ?? "unknown";
  const primitive = primitiveRemoteValue(remote.value);
  return {
    type,
    subtype: asString(remote.subtype),
    description: truncateText(asString(remote.description)),
    value: typeof primitive === "string" ? truncateText(primitive) : primitive,
    unserializableValue: truncateText(asString(remote.unserializableValue)),
    preview: mapObjectPreview(remote.preview),
    objectHandle: registerObjectHandle(
      capture,
      entryId,
      asString(remote.objectId),
    ),
  };
}

function consoleArgumentText(argument: BrowserConsoleArgument) {
  if (argument.value !== undefined) {
    return typeof argument.value === "string"
      ? argument.value
      : String(argument.value);
  }
  return (
    argument.unserializableValue ??
    argument.description ??
    argument.preview?.description ??
    argument.type
  );
}

function rememberBounded<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  limit: number,
  onEvict?: (key: K, value: V) => void,
) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.entries().next().value as [K, V] | undefined;
    if (!oldest) break;
    map.delete(oldest[0]);
    onEvict?.(oldest[0], oldest[1]);
  }
}

function releaseEntryHandles(capture: DiagnosticsCapture, entryId: string) {
  for (const [handle, remote] of capture.objectHandles) {
    if (remote.entryId !== entryId) continue;
    capture.objectHandles.delete(handle);
    releaseObject(remote.objectId, capture.webContentsId);
  }
  scheduleObjectHandlePrune(capture);
}

function isDuplicateConsole(
  capture: DiagnosticsCapture,
  entry: BrowserConsoleEntry,
) {
  const key = `${entry.level}\u0000${entry.text}\u0000${entry.source ?? ""}\u0000${entry.lineNumber ?? ""}`;
  const now = Date.parse(entry.timestamp);
  const previous = capture.recentConsole.get(key);
  capture.recentConsole.set(key, now);
  if (capture.recentConsole.size > 100) {
    const oldest = capture.recentConsole.keys().next().value;
    if (oldest) capture.recentConsole.delete(oldest);
  }
  return previous !== undefined && Math.abs(now - previous) < 250;
}

function emitConsoleEntry(args: {
  capture: DiagnosticsCapture;
  level: BrowserConsoleEntry["level"];
  timestamp?: number;
  executionContextId?: number;
  remoteArguments?: unknown[];
  text?: string;
  stackTrace?: unknown;
  source?: string;
  lineNumber?: number;
  columnNumber?: number;
}) {
  const rateLimit = args.capture.acceptConsoleEntry?.();
  if (rateLimit && !rateLimit.accepted) {
    stopCaptureForConsoleOverload(args.capture);
    return;
  }
  if (rateLimit && rateLimit.droppedCount > 0) {
    args.capture.onConsoleEntry({
      id: randomUUID(),
      level: "warn",
      text: `Lens console dropped ${rateLimit.droppedCount} excessive page log entries.`,
      timestamp: new Date().toISOString(),
      source: "lens",
      captureSource: "cdp",
    });
  }

  const entryId = randomUUID();
  const remoteArguments = (args.remoteArguments ?? [])
    .slice(0, MAX_CONSOLE_ARGUMENTS)
    .map((argument) => toConsoleArgument(args.capture, entryId, argument));
  for (const argument of (args.remoteArguments ?? []).slice(
    MAX_CONSOLE_ARGUMENTS,
  )) {
    const objectId = asString(asRecord(argument)?.objectId);
    if (objectId) releaseObject(objectId, args.capture.webContentsId);
  }
  const stackTrace = mapStackTrace(args.stackTrace);
  const firstFrame = stackTrace?.callFrames[0];
  const text =
    args.text ?? remoteArguments.map(consoleArgumentText).join(" ") ?? "";
  if (args.capture.shouldIgnoreConsoleText?.(text)) {
    releaseEntryHandles(args.capture, entryId);
    return;
  }
  const entry: BrowserConsoleEntry = {
    id: entryId,
    level: args.level,
    text: truncateText(text, 32_768) ?? "",
    timestamp: toIsoFromEpochMilliseconds(args.timestamp),
    source:
      sanitizeDiagnosticLocation(args.source) ??
      sanitizeDiagnosticLocation(firstFrame?.url),
    lineNumber: args.lineNumber ?? firstFrame?.lineNumber,
    columnNumber: args.columnNumber ?? firstFrame?.columnNumber,
    executionContextId: args.executionContextId,
    argumentCount: remoteArguments.length,
    hasObjectArguments: remoteArguments.some((argument) =>
      Boolean(argument.objectHandle || argument.preview),
    ),
    hasStackTrace: Boolean(stackTrace),
    captureSource: "cdp",
  };
  if (isDuplicateConsole(args.capture, entry)) {
    releaseEntryHandles(args.capture, entryId);
    return;
  }
  rememberBounded(
    args.capture.consoleDetails,
    entryId,
    {
      entryId,
      executionContextId: args.executionContextId,
      executionContext:
        args.executionContextId === undefined
          ? undefined
          : args.capture.executionContexts.get(args.executionContextId),
      arguments: remoteArguments,
      stackTrace,
    },
    MAX_CONSOLE_DETAILS,
    (evictedEntryId) => releaseEntryHandles(args.capture, evictedEntryId),
  );
  args.capture.onConsoleEntry(entry);
}

function mapConsoleLevel(
  value: string | undefined,
): BrowserConsoleEntry["level"] {
  if (value === "warning") return "warn";
  if (
    value === "error" ||
    value === "debug" ||
    value === "info" ||
    value === "log"
  ) {
    return value;
  }
  return "log";
}

function headerValue(headers: BrowserNetworkHeaders | undefined, name: string) {
  if (!headers) return undefined;
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1]?.[0];
}

function mapInitiator(value: unknown): BrowserNetworkInitiator | undefined {
  const initiator = asRecord(value);
  if (!initiator) return undefined;
  return {
    type: asString(initiator.type) ?? "other",
    url: sanitizeDiagnosticLocation(asString(initiator.url)),
    lineNumber:
      asNumber(initiator.lineNumber) === undefined
        ? undefined
        : (asNumber(initiator.lineNumber) ?? 0) + 1,
    columnNumber:
      asNumber(initiator.columnNumber) === undefined
        ? undefined
        : (asNumber(initiator.columnNumber) ?? 0) + 1,
    stack: mapStackTrace(initiator.stack),
  };
}

function mapResponseHeaders(value: unknown) {
  return sanitizeLensNetworkHeaders(
    asRecord(value) as
      Record<string, string | string[] | number | boolean> | undefined,
  );
}

function mapResourceTiming(
  value: unknown,
  request: PendingNetworkRequest,
): BrowserNetworkTiming {
  const timing = asRecord(value) ?? {};
  const result: BrowserNetworkTiming = {
    requestTimestamp: request.requestTimestamp,
    wallTime: request.wallTime,
    responseTimestamp: request.responseTimestamp,
  };
  for (const key of [
    "requestTime",
    "proxyStart",
    "proxyEnd",
    "dnsStart",
    "dnsEnd",
    "connectStart",
    "connectEnd",
    "sslStart",
    "sslEnd",
    "workerStart",
    "workerReady",
    "workerFetchStart",
    "workerRespondWithSettled",
    "sendStart",
    "sendEnd",
    "pushStart",
    "pushEnd",
    "receiveHeadersStart",
    "receiveHeadersEnd",
  ] as const) {
    const number = asNumber(timing[key]);
    if (number !== undefined) result[key] = number;
  }
  return result;
}

function bodyKey(entryId: string, kind: "request" | "response") {
  return `${entryId}\u0000${kind}`;
}

function bodyMetadata(body: BrowserNetworkBody | undefined) {
  if (!body) return undefined;
  const { content: _content, ...metadata } = body;
  return metadata;
}

function decodeBase64BodyPreview(value: string) {
  const encodedLimit = Math.ceil(MAX_LENS_NETWORK_BODY_BYTES / 3) * 4 + 4;
  const sourceBytes = Math.max(
    0,
    Math.floor((value.length * 3) / 4) -
      (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0),
  );
  const content = Buffer.from(value.slice(0, encodedLimit), "base64")
    .subarray(0, MAX_LENS_NETWORK_BODY_BYTES)
    .toString("utf8");
  return {
    content,
    sourceBytes,
    truncated: sourceBytes > MAX_LENS_NETWORK_BODY_BYTES,
  };
}

function networkSummary(
  request: PendingNetworkRequest,
  completedTimestamp = request.responseTimestamp ?? request.requestTimestamp,
): BrowserNetworkEntry {
  const durationMs = Math.max(
    0,
    Math.round((completedTimestamp - request.requestTimestamp) * 100_000) / 100,
  );
  return {
    entryId: request.entryId,
    requestId: request.requestId,
    state: request.error
      ? "failed"
      : request.responseBody
        ? "complete"
        : "pending",
    url: request.url,
    method: request.method,
    status: request.status,
    statusText: request.statusText,
    resourceType: request.resourceType,
    mimeType: request.mimeType,
    responseSize: request.responseSize,
    referrer: request.referrer,
    startedAt: toIsoFromEpochMilliseconds(
      request.wallTime === undefined ? undefined : request.wallTime * 1_000,
    ),
    durationMs,
    fromCache: request.fromCache,
    error: request.error,
    hasRequestBody: Boolean(request.requestBody),
    hasResponseBody: Boolean(request.responseBody),
    detailAvailable: true,
    captureSource: "cdp",
    completedAt:
      request.error || request.responseBody
        ? completionTimestamp(request, completedTimestamp)
        : undefined,
    timestamp: completionTimestamp(request, completedTimestamp),
  };
}

function syncNetworkDetail(
  capture: DiagnosticsCapture,
  request: PendingNetworkRequest,
) {
  const detail: BrowserNetworkEntryDetail = {
    entryId: request.entryId,
    requestId: request.requestId,
    requestHeaders: request.requestHeaders,
    responseHeaders: request.responseHeaders,
    initiator: request.initiator,
    timing: request.timing,
    redirects: request.redirects,
    protocol: request.protocol,
    remoteAddress: request.remoteAddress,
    connectionId: request.connectionId,
    connectionReused: request.connectionReused,
    priority: request.priority,
    fromServiceWorker: request.fromServiceWorker,
    requestBody: bodyMetadata(request.requestBody),
    responseBody: bodyMetadata(request.responseBody),
  };
  rememberBounded(
    capture.networkDetails,
    request.entryId,
    detail,
    MAX_NETWORK_DETAILS,
    (entryId) => capture.bodyStore.deleteEntry(entryId),
  );
}

function rememberPending(
  capture: DiagnosticsCapture,
  request: PendingNetworkRequest,
) {
  capture.pendingNetwork.set(request.requestId, request);
  while (capture.pendingNetwork.size > MAX_PENDING_NETWORK_REQUESTS) {
    const oldest = capture.pendingNetwork.keys().next().value;
    if (!oldest) break;
    capture.pendingNetwork.delete(oldest);
  }
}

function enqueueByRequestId<T>(
  map: Map<string, T[]>,
  requestId: string,
  value: T,
) {
  const queue = map.get(requestId) ?? [];
  queue.push(value);
  if (queue.length > 16) queue.shift();
  rememberBounded(map, requestId, queue, MAX_PENDING_NETWORK_REQUESTS);
}

function dequeueByRequestId<T>(map: Map<string, T[]>, requestId: string) {
  const queue = map.get(requestId);
  const value = queue?.shift();
  if (!queue || queue.length === 0) {
    map.delete(requestId);
  }
  return value;
}

function applyRequestExtra(
  capture: DiagnosticsCapture,
  request: PendingNetworkRequest,
  headers: BrowserNetworkHeaders | undefined,
) {
  request.requestExtraApplied = true;
  request.requestHeaders = headers;
  request.referrer =
    sanitizeDiagnosticLocation(headerValue(headers, "referer")) ??
    request.referrer;
  syncNetworkDetail(capture, request);
  capture.onNetworkEntry(networkSummary(request));
}

function applyResponseExtra(
  capture: DiagnosticsCapture,
  request: PendingNetworkRequest,
  extra: PendingResponseExtraInfo,
) {
  request.responseExtraApplied = true;
  request.responseHeaders = extra.headers ?? request.responseHeaders;
  request.status = extra.status ?? request.status;
  syncNetworkDetail(capture, request);
  capture.onNetworkEntry(networkSummary(request));
}

function removeQueuedTarget<T>(
  map: Map<string, T[]>,
  requestId: string,
  target: T,
) {
  const queue = map.get(requestId);
  if (!queue) return;
  const remaining = queue.filter((entry) => entry !== target);
  if (remaining.length === 0) {
    map.delete(requestId);
    return;
  }
  map.set(requestId, remaining);
}

function retireNetworkRequest(
  capture: DiagnosticsCapture,
  request: PendingNetworkRequest,
  terminal: boolean,
) {
  removeQueuedTarget(capture.requestExtraTargets, request.requestId, request);
  removeQueuedTarget(capture.responseExtraTargets, request.requestId, request);
  if (capture.pendingNetwork.get(request.requestId) === request) {
    capture.pendingNetwork.delete(request.requestId);
  }
  if (terminal) {
    capture.pendingRequestExtraInfo.delete(request.requestId);
    capture.pendingResponseExtraInfo.delete(request.requestId);
  }
  request.requestBody = bodyMetadata(request.requestBody);
  request.responseBody = bodyMetadata(request.responseBody);
}

async function loadRequestPostData(
  capture: DiagnosticsCapture,
  request: PendingNetworkRequest,
  generation: number,
) {
  try {
    const result = asRecord(
      await sendCdpCommand(
        capture.webContentsId,
        "Network.getRequestPostData",
        { requestId: request.requestId },
      ),
    );
    const postData = asString(result?.postData);
    if (
      postData === undefined ||
      !capture.enabled ||
      capture.generation !== generation ||
      captures.get(capture.webContentsId) !== capture ||
      capture.pendingNetwork.get(request.requestId) !== request
    ) {
      return;
    }
    const requestBody = sanitizeLensNetworkBody({
      content: postData,
      mimeType: headerValue(request.requestHeaders, "content-type"),
    });
    capture.bodyStore.set(bodyKey(request.entryId, "request"), requestBody);
    request.requestBody = bodyMetadata(requestBody);
    syncNetworkDetail(capture, request);
    capture.onNetworkEntry(networkSummary(request));
  } catch {
    // Chromium omits post data for streams, uploads, and evicted requests.
  }
}

function requestWillBeSent(capture: DiagnosticsCapture, params: JsonRecord) {
  const requestId = asString(params.requestId);
  const rawRequest = asRecord(params.request);
  if (!requestId || !rawRequest) return;
  const existing = capture.pendingNetwork.get(requestId);
  const redirectResponse = asRecord(params.redirectResponse);
  const redirects = [...(existing?.redirects ?? [])];
  if (redirectResponse && existing) {
    const expectsRedirectExtra =
      asBoolean(params.redirectHasExtraInfo) === true;
    const redirectExtra = expectsRedirectExtra
      ? dequeueByRequestId(capture.pendingResponseExtraInfo, requestId)
      : undefined;
    const redirect: BrowserNetworkRedirect = {
      url: existing.url,
      status:
        redirectExtra?.status ??
        (existing.responseExtraApplied ? existing.status : undefined) ??
        asNumber(redirectResponse.status) ??
        0,
      statusText: asString(redirectResponse.statusText),
      timestamp: asNumber(params.timestamp) ?? existing.requestTimestamp,
      responseHeaders:
        redirectExtra?.headers ??
        (existing.responseExtraApplied
          ? existing.responseHeaders
          : undefined) ??
        mapResponseHeaders(redirectResponse.headers),
    };
    redirects.push(redirect);
    existing.status = redirect.status;
    existing.statusText = redirect.statusText;
    existing.responseHeaders =
      redirect.responseHeaders ?? existing.responseHeaders;
    existing.responseExtraApplied =
      Boolean(redirectExtra) || existing.responseExtraApplied;
    existing.responseTimestamp = redirect.timestamp;
    existing.responseBody = sanitizeLensNetworkBody({
      mimeType: asString(redirectResponse.mimeType),
      unavailableReason: "Redirect responses do not retain a body preview.",
    });
    capture.bodyStore.set(
      bodyKey(existing.entryId, "response"),
      existing.responseBody,
    );
    syncNetworkDetail(capture, existing);
    capture.onNetworkEntry(networkSummary(existing, redirect.timestamp));
    const awaitsRedirectExtra =
      expectsRedirectExtra && !redirectExtra && !existing.responseExtraApplied;
    const awaitsRequestExtra = !existing.requestExtraApplied;
    retireNetworkRequest(capture, existing, false);
    if (awaitsRequestExtra || awaitsRedirectExtra) {
      const extraTarget = {
        ...existing,
        redirects: [...existing.redirects],
        requestBody: bodyMetadata(existing.requestBody),
        responseBody: bodyMetadata(existing.responseBody),
      };
      if (awaitsRequestExtra) {
        enqueueByRequestId(capture.requestExtraTargets, requestId, extraTarget);
      }
      if (awaitsRedirectExtra) {
        enqueueByRequestId(
          capture.responseExtraTargets,
          requestId,
          extraTarget,
        );
      }
    }
  }

  const rateLimit = capture.acceptNetworkRequest?.();
  if (rateLimit && !rateLimit.accepted) {
    stopCaptureForNetworkOverload(capture);
    return;
  }
  if (rateLimit && rateLimit.droppedCount > 0) {
    capture.onConsoleEntry({
      id: randomUUID(),
      level: "warn",
      text: `Lens network dropped ${rateLimit.droppedCount} excessive requests.`,
      timestamp: new Date().toISOString(),
      source: "lens",
      captureSource: "cdp",
    });
  }

  const requestHeaders = mapResponseHeaders(rawRequest.headers);
  const hasQueuedRequestExtra =
    (capture.pendingRequestExtraInfo.get(requestId)?.length ?? 0) > 0;
  const extraRequestHeaders =
    dequeueByRequestId(capture.pendingRequestExtraInfo, requestId) ??
    requestHeaders;
  const mimeType = headerValue(extraRequestHeaders, "content-type");
  const postData = asString(rawRequest.postData);
  const hop = existing ? existing.hop + 1 : 0;
  const request: PendingNetworkRequest = {
    entryId: `${requestId}:${hop}`,
    requestId,
    hop,
    url: sanitizeLensNetworkUrl(asString(rawRequest.url) ?? ""),
    method: asString(rawRequest.method) ?? "GET",
    resourceType: mapResourceType(asString(params.type)),
    requestTimestamp: asNumber(params.timestamp) ?? 0,
    wallTime: asNumber(params.wallTime),
    requestHeaders: extraRequestHeaders,
    referrer: sanitizeDiagnosticLocation(
      headerValue(extraRequestHeaders, "referer") ??
        headerValue(requestHeaders, "referer"),
    ),
    initiator: mapInitiator(params.initiator),
    priority: asString(rawRequest.initialPriority),
    redirects,
    requestExtraApplied: hasQueuedRequestExtra,
  };
  if (postData !== undefined) {
    const requestBody = sanitizeLensNetworkBody({
      content: postData,
      mimeType,
    });
    capture.bodyStore.set(bodyKey(request.entryId, "request"), requestBody);
    request.requestBody = bodyMetadata(requestBody);
  }
  rememberPending(capture, request);
  if (!hasQueuedRequestExtra) {
    enqueueByRequestId(capture.requestExtraTargets, requestId, request);
  }
  syncNetworkDetail(capture, request);
  capture.onNetworkEntry(networkSummary(request));
  if (postData === undefined && asBoolean(rawRequest.hasPostData) === true) {
    void loadRequestPostData(capture, request, capture.generation);
  }
}

function requestWillBeSentExtraInfo(
  capture: DiagnosticsCapture,
  params: JsonRecord,
) {
  const requestId = asString(params.requestId);
  if (!requestId) return;
  const headers = mapResponseHeaders(params.headers);
  if (!headers) return;
  const request = dequeueByRequestId(capture.requestExtraTargets, requestId);
  if (!request) {
    enqueueByRequestId(capture.pendingRequestExtraInfo, requestId, headers);
    return;
  }
  applyRequestExtra(capture, request, headers);
}

function responseReceived(capture: DiagnosticsCapture, params: JsonRecord) {
  const request = capture.pendingNetwork.get(asString(params.requestId) ?? "");
  const response = asRecord(params.response);
  if (!request || !response) return;
  request.status = asNumber(response.status);
  request.statusText = asString(response.statusText);
  request.mimeType = asString(response.mimeType);
  request.responseHeaders = mapResponseHeaders(response.headers);
  request.responseTimestamp = asNumber(params.timestamp);
  request.fromCache =
    asBoolean(response.fromDiskCache) === true ||
    asBoolean(response.fromPrefetchCache) === true;
  request.fromServiceWorker = asBoolean(response.fromServiceWorker);
  request.protocol = asString(response.protocol);
  const remoteIp = asString(response.remoteIPAddress);
  const remotePort = asNumber(response.remotePort);
  request.remoteAddress = remoteIp
    ? `${remoteIp}${remotePort === undefined ? "" : `:${remotePort}`}`
    : undefined;
  request.connectionId = asNumber(response.connectionId);
  request.connectionReused = asBoolean(response.connectionReused);
  request.timing = mapResourceTiming(response.timing, request);
  const extra = dequeueByRequestId(
    capture.pendingResponseExtraInfo,
    request.requestId,
  );
  if (extra) {
    request.responseExtraApplied = true;
    request.responseHeaders = extra.headers ?? request.responseHeaders;
    request.status = extra.status ?? request.status;
  } else if (asBoolean(params.hasExtraInfo) !== false) {
    enqueueByRequestId(
      capture.responseExtraTargets,
      request.requestId,
      request,
    );
  }
  syncNetworkDetail(capture, request);
  capture.onNetworkEntry(
    networkSummary(
      request,
      request.responseTimestamp ?? request.requestTimestamp,
    ),
  );
}

function responseReceivedExtraInfo(
  capture: DiagnosticsCapture,
  params: JsonRecord,
) {
  const requestId = asString(params.requestId);
  if (!requestId) return;
  const extra = {
    headers: mapResponseHeaders(params.headers),
    status: asNumber(params.statusCode),
  };
  const request = dequeueByRequestId(capture.responseExtraTargets, requestId);
  if (!request) {
    enqueueByRequestId(capture.pendingResponseExtraInfo, requestId, extra);
    return;
  }
  applyResponseExtra(capture, request, extra);
}

async function loadingFinished(
  capture: DiagnosticsCapture,
  params: JsonRecord,
) {
  const requestId = asString(params.requestId);
  const request = capture.pendingNetwork.get(requestId ?? "");
  if (!requestId || !request) return;
  const finishedTimestamp =
    asNumber(params.timestamp) ?? request.responseTimestamp ?? 0;
  const generation = capture.generation;
  request.responseSize = asNumber(params.encodedDataLength);
  if (request.timing) request.timing.finishedTimestamp = finishedTimestamp;
  if (capture.activeResponseBodyLoads >= MAX_CONCURRENT_RESPONSE_BODY_LOADS) {
    const responseBody = sanitizeLensNetworkBody({
      mimeType: request.mimeType,
      size: request.responseSize,
      unavailableReason:
        "Response body preview was skipped while diagnostics were busy.",
    });
    capture.bodyStore.set(bodyKey(request.entryId, "response"), responseBody);
    request.responseBody = bodyMetadata(responseBody);
    syncNetworkDetail(capture, request);
    capture.onNetworkEntry(networkSummary(request, finishedTimestamp));
    retireNetworkRequest(capture, request, true);
    return;
  }
  capture.activeResponseBodyLoads += 1;
  let responseBody: BrowserNetworkBody;

  try {
    const response = asRecord(
      await sendCdpCommand(capture.webContentsId, "Network.getResponseBody", {
        requestId,
      }),
    );
    if (
      !capture.enabled ||
      capture.generation !== generation ||
      captures.get(capture.webContentsId) !== capture ||
      capture.pendingNetwork.get(requestId) !== request
    ) {
      return;
    }
    const body = asString(response?.body);
    const base64Encoded = asBoolean(response?.base64Encoded) === true;
    if (body !== undefined && isLensTextMimeType(request.mimeType)) {
      const decoded = base64Encoded ? decodeBase64BodyPreview(body) : undefined;
      const content = decoded?.content ?? body;
      responseBody = sanitizeLensNetworkBody({
        content,
        mimeType: request.mimeType,
        size: request.responseSize ?? decoded?.sourceBytes,
        maxBytes: MAX_LENS_NETWORK_BODY_BYTES,
        sourceTruncated: decoded?.truncated,
      });
    } else {
      responseBody = sanitizeLensNetworkBody({
        mimeType: request.mimeType,
        size: request.responseSize,
      });
    }
  } catch {
    if (
      !capture.enabled ||
      capture.generation !== generation ||
      captures.get(capture.webContentsId) !== capture ||
      capture.pendingNetwork.get(requestId) !== request
    ) {
      return;
    }
    responseBody = sanitizeLensNetworkBody({
      mimeType: request.mimeType,
      size: request.responseSize,
      unavailableReason:
        "Chromium no longer has the response body in its diagnostics buffer.",
    });
  } finally {
    capture.activeResponseBodyLoads = Math.max(
      0,
      capture.activeResponseBodyLoads - 1,
    );
  }
  capture.bodyStore.set(bodyKey(request.entryId, "response"), responseBody);
  request.responseBody = bodyMetadata(responseBody);
  syncNetworkDetail(capture, request);
  capture.onNetworkEntry(networkSummary(request, finishedTimestamp));
  retireNetworkRequest(capture, request, true);
}

function loadingFailed(capture: DiagnosticsCapture, params: JsonRecord) {
  const requestId = asString(params.requestId);
  const request = capture.pendingNetwork.get(requestId ?? "");
  if (!requestId || !request) return;
  const finishedTimestamp =
    asNumber(params.timestamp) ?? request.responseTimestamp ?? 0;
  request.error =
    asString(params.errorText) ??
    (asBoolean(params.canceled) ? "Request canceled" : "Request failed");
  if (request.timing) request.timing.finishedTimestamp = finishedTimestamp;
  syncNetworkDetail(capture, request);
  capture.onNetworkEntry(networkSummary(request, finishedTimestamp));
  retireNetworkRequest(capture, request, true);
}

function handleCdpMessage(
  capture: DiagnosticsCapture,
  method: string,
  params: JsonRecord,
) {
  if (!capture.enabled) return;
  if (method === "Runtime.executionContextCreated") {
    const context = asRecord(params.context);
    const id = asNumber(context?.id);
    if (context && id !== undefined) {
      const auxData = asRecord(context.auxData);
      capture.executionContexts.set(id, {
        id,
        name: truncateText(asString(context.name)),
        origin: sanitizeDiagnosticLocation(asString(context.origin)),
        frameId: asString(auxData?.frameId),
        isDefault: asBoolean(auxData?.isDefault),
      });
    }
    return;
  }
  if (method === "Runtime.executionContextDestroyed") {
    const id = asNumber(params.executionContextId);
    if (id !== undefined) capture.executionContexts.delete(id);
    return;
  }
  if (method === "Runtime.executionContextsCleared") {
    capture.executionContexts.clear();
    return;
  }
  if (method === "Runtime.consoleAPICalled") {
    emitConsoleEntry({
      capture,
      level: mapConsoleLevel(asString(params.type)),
      timestamp: asNumber(params.timestamp),
      executionContextId: asNumber(params.executionContextId),
      remoteArguments: asArray(params.args),
      stackTrace: params.stackTrace,
    });
    return;
  }
  if (method === "Runtime.exceptionThrown") {
    const details = asRecord(params.exceptionDetails) ?? {};
    emitConsoleEntry({
      capture,
      level: "error",
      timestamp: asNumber(params.timestamp),
      executionContextId: asNumber(details.executionContextId),
      remoteArguments: details.exception ? [details.exception] : [],
      text: asString(details.text),
      stackTrace: details.stackTrace,
      source: asString(details.url),
      lineNumber:
        asNumber(details.lineNumber) === undefined
          ? undefined
          : (asNumber(details.lineNumber) ?? 0) + 1,
      columnNumber:
        asNumber(details.columnNumber) === undefined
          ? undefined
          : (asNumber(details.columnNumber) ?? 0) + 1,
    });
    return;
  }
  if (method === "Log.entryAdded") {
    const entry = asRecord(params.entry) ?? {};
    emitConsoleEntry({
      capture,
      level: mapConsoleLevel(asString(entry.level)),
      timestamp: asNumber(entry.timestamp),
      text: asString(entry.text),
      source: asString(entry.url),
      lineNumber:
        asNumber(entry.lineNumber) === undefined
          ? undefined
          : (asNumber(entry.lineNumber) ?? 0) + 1,
      stackTrace: entry.stackTrace,
    });
    return;
  }
  if (method === "Network.requestWillBeSent") {
    requestWillBeSent(capture, params);
  } else if (method === "Network.requestWillBeSentExtraInfo") {
    requestWillBeSentExtraInfo(capture, params);
  } else if (method === "Network.responseReceived") {
    responseReceived(capture, params);
  } else if (method === "Network.responseReceivedExtraInfo") {
    responseReceivedExtraInfo(capture, params);
  } else if (method === "Network.loadingFinished") {
    void loadingFinished(capture, params);
  } else if (method === "Network.loadingFailed") {
    loadingFailed(capture, params);
  }
}

function releaseAllHandles(capture: DiagnosticsCapture) {
  clearObjectHandlePruneTimer(capture);
  for (const remote of capture.objectHandles.values()) {
    releaseObject(remote.objectId, capture.webContentsId);
  }
  capture.objectHandles.clear();
}

function clearCaptureData(
  capture: DiagnosticsCapture,
  kind?: "console" | "network",
  releaseRemoteObjects = true,
) {
  if (!kind || kind === "console") {
    if (releaseRemoteObjects) {
      releaseAllHandles(capture);
    } else {
      clearObjectHandlePruneTimer(capture);
      capture.objectHandles.clear();
    }
    capture.consoleDetails.clear();
    capture.recentConsole.clear();
  }
  if (!kind || kind === "network") {
    capture.pendingNetwork.clear();
    capture.pendingRequestExtraInfo.clear();
    capture.pendingResponseExtraInfo.clear();
    capture.requestExtraTargets.clear();
    capture.responseExtraTargets.clear();
    capture.networkDetails.clear();
    capture.bodyStore.clear();
  }
  if (!kind) {
    capture.executionContexts.clear();
  }
}

function archiveCaptureData(
  capture: DiagnosticsCapture,
  releaseRemoteObjects = true,
) {
  if (releaseRemoteObjects) {
    releaseAllHandles(capture);
  } else {
    clearObjectHandlePruneTimer(capture);
    capture.objectHandles.clear();
  }
  for (const [entryId, detail] of capture.consoleDetails) {
    capture.consoleDetails.set(entryId, {
      ...detail,
      arguments: detail.arguments.map((argument) => ({
        ...argument,
        objectHandle: undefined,
      })),
    });
  }
  capture.pendingNetwork.clear();
  capture.pendingRequestExtraInfo.clear();
  capture.pendingResponseExtraInfo.clear();
  capture.requestExtraTargets.clear();
  capture.responseExtraTargets.clear();
  capture.recentConsole.clear();
  capture.executionContexts.clear();
}

function stopCaptureForConsoleOverload(capture: DiagnosticsCapture): void {
  if (!capture.enabled || captures.get(capture.webContentsId) !== capture) {
    return;
  }

  capture.enabled = false;
  capture.generation += 1;
  capture.unsubscribeMessage();
  capture.unsubscribeDetach();
  // One CDP command clears the target's retained console objects without an
  // unbounded releaseObject command per dropped event. Strip local handles so
  // preserved details never point at objects invalidated by that clear.
  archiveCaptureData(capture, false);
  void sendCdpCommandIfAttached(
    capture.webContentsId,
    "Runtime.discardConsoleEntries",
  ).catch(() => undefined);
  // Let the discard command release its native lease before detaching. The
  // capture is already disabled, so waiting does not admit more diagnostics.
  detachCdpController(capture.webContentsId);
  const message =
    "Lens full diagnostics stopped because the page emitted excessive console logs.";
  try {
    capture.onConsoleEntry({
      id: randomUUID(),
      level: "warn",
      text: message,
      timestamp: new Date().toISOString(),
      source: "lens",
      captureSource: "cdp",
      diagnosticsCaptureState: { enabled: false, message },
    });
  } catch {
    // Cleanup above must remain authoritative if a consumer is already gone.
  }
}

function stopCaptureForNetworkOverload(capture: DiagnosticsCapture): void {
  if (!capture.enabled || captures.get(capture.webContentsId) !== capture) {
    return;
  }

  capture.enabled = false;
  capture.generation += 1;
  capture.unsubscribeMessage();
  capture.unsubscribeDetach();
  archiveCaptureData(capture);
  detachCdpController(capture.webContentsId);
  const message =
    "Lens full diagnostics stopped because the page emitted excessive network traffic.";
  try {
    capture.onConsoleEntry({
      id: randomUUID(),
      level: "warn",
      text: message,
      timestamp: new Date().toISOString(),
      source: "lens",
      captureSource: "cdp",
      diagnosticsCaptureState: { enabled: false, message },
    });
  } catch {
    // Cleanup above must remain authoritative if a consumer is already gone.
  }
}

export async function startLensCdpDiagnostics(args: {
  webContentsId: number;
  workspaceId: string;
  lensSessionId: string;
  url: string;
  onConsoleEntry: (entry: BrowserConsoleEntry) => void;
  acceptConsoleEntry?: () => LensConsoleRateLimitDecision;
  acceptNetworkRequest?: () => LensRateLimitDecision;
  onNetworkEntry: (entry: BrowserNetworkEntry) => void;
  shouldIgnoreConsoleText?: (text: string) => boolean;
}): Promise<LensDiagnosticsCaptureState> {
  const current = captures.get(args.webContentsId);
  if (current?.enabled) {
    return { enabled: true, host: current.host };
  }
  if (
    [...captures.values()].filter((capture) => capture.enabled).length >=
    MAX_ACTIVE_DIAGNOSTICS_CAPTURES
  ) {
    return {
      enabled: false,
      message:
        "Full diagnostics is already active in too many Lens sessions. Stop one and try again.",
    };
  }
  let host: string;
  try {
    const parsed = new URL(args.url);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname
    ) {
      return { enabled: false, message: "Open an HTTP(S) page first." };
    }
    host = normalizeLensHostEntry(parsed.hostname) ?? "";
    if (!host) {
      return { enabled: false, message: "Open an HTTP(S) page first." };
    }
  } catch {
    return { enabled: false, message: "Open an HTTP(S) page first." };
  }

  if (current) {
    stopLensCdpDiagnostics(args.webContentsId);
  }

  const capture = {} as DiagnosticsCapture;
  capture.webContentsId = args.webContentsId;
  capture.workspaceId = args.workspaceId;
  capture.lensSessionId = args.lensSessionId;
  capture.host = host;
  capture.enabled = false;
  capture.generation = 0;
  capture.onConsoleEntry = args.onConsoleEntry;
  capture.acceptConsoleEntry = args.acceptConsoleEntry;
  capture.acceptNetworkRequest = args.acceptNetworkRequest;
  capture.onNetworkEntry = args.onNetworkEntry;
  capture.shouldIgnoreConsoleText = args.shouldIgnoreConsoleText;
  capture.pendingNetwork = new Map();
  capture.pendingRequestExtraInfo = new Map();
  capture.pendingResponseExtraInfo = new Map();
  capture.requestExtraTargets = new Map();
  capture.responseExtraTargets = new Map();
  capture.consoleDetails = new Map();
  capture.networkDetails = new Map();
  capture.objectHandles = new Map();
  capture.objectHandlePruneTimer = null;
  capture.bodyStore = new BoundedBodyStore();
  capture.recentConsole = new Map();
  capture.executionContexts = new Map();
  capture.activeResponseBodyLoads = 0;
  capture.unsubscribeMessage = subscribeCdpMessages(
    args.webContentsId,
    (method, params) => handleCdpMessage(capture, method, params),
  );
  capture.unsubscribeDetach = subscribeCdpDetach(
    args.webContentsId,
    (reason) => {
      capture.enabled = false;
      clearCaptureData(capture);
      captures.delete(args.webContentsId);
      capture.unsubscribeMessage();
      capture.unsubscribeDetach();
      capture.host = "";
      capture.recentConsole.set(`detached:${reason}`, Date.now());
    },
  );
  captures.set(args.webContentsId, capture);

  try {
    // Runtime.enable may synchronously publish existing execution contexts.
    // Accept domain events during setup so their context/stack metadata is not
    // lost before the enable promises settle.
    capture.enabled = true;
    await Promise.all([
      sendCdpCommand(args.webContentsId, "Runtime.enable"),
      sendCdpCommand(args.webContentsId, "Log.enable"),
      sendCdpCommand(args.webContentsId, "Network.enable", {
        maxTotalBufferSize: 20 * 1_024 * 1_024,
        maxResourceBufferSize: 2 * 1_024 * 1_024,
        maxPostDataSize: MAX_LENS_NETWORK_BODY_BYTES,
      }),
    ]);
    if (captures.get(args.webContentsId) !== capture || !capture.enabled) {
      return {
        enabled: false,
        message: "Lens browser session closed while diagnostics were starting.",
      };
    }
    capture.enabled = true;
    return { enabled: true, host };
  } catch (error) {
    if (captures.get(args.webContentsId) === capture) {
      stopLensCdpDiagnostics(args.webContentsId, true);
    } else {
      capture.enabled = false;
      capture.unsubscribeMessage();
      capture.unsubscribeDetach();
      clearCaptureData(capture, undefined, false);
    }
    return {
      enabled: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function stopLensCdpDiagnostics(
  webContentsId: number,
  detach = false,
  preserveDetails = false,
): LensDiagnosticsCaptureState {
  const capture = captures.get(webContentsId);
  if (capture) {
    capture.enabled = false;
    capture.generation += 1;
    capture.unsubscribeMessage();
    capture.unsubscribeDetach();
    if (preserveDetails) {
      archiveCaptureData(capture);
    } else {
      clearCaptureData(capture);
      captures.delete(webContentsId);
    }
  }
  if (detach) detachCdpController(webContentsId);
  return { enabled: false };
}

/**
 * Dispose capture state for a WebContents that is about to be destroyed.
 * Remote object handles die with the target, so issuing Runtime.releaseObject
 * here only creates CDP work that races with WebContents teardown.
 */
export async function disposeLensCdpDiagnostics(
  webContentsId: number,
): Promise<"drained" | "timed-out"> {
  const capture = captures.get(webContentsId);
  if (capture) {
    capture.enabled = false;
    capture.generation += 1;
    capture.unsubscribeMessage();
    capture.unsubscribeDetach();
    clearCaptureData(capture, undefined, false);
    captures.delete(webContentsId);
  }
  return disposeCdpController(webContentsId);
}

export function getLensCdpDiagnosticsState(
  webContentsId: number,
): LensDiagnosticsCaptureState {
  const capture = captures.get(webContentsId);
  return capture?.enabled
    ? { enabled: true, host: capture.host }
    : { enabled: false };
}

export function enforceLensCdpDiagnosticsPolicy(args: LensCdpPolicyConfig) {
  const now = Date.now();
  for (const capture of [...captures.values()]) {
    const persistedApproval = args.cdpApprovedHosts.some(
      (entry) => capture.host === entry || capture.host.endsWith(`.${entry}`),
    );
    const transientApproval = args.transientCdpApprovals.some(
      (approval) =>
        approval.workspaceId === capture.workspaceId &&
        approval.expiresAt > now &&
        (capture.host === approval.host ||
          capture.host.endsWith(`.${approval.host}`)),
    );
    const approved =
      args.developerModeCdp && (persistedApproval || transientApproval);
    if (!approved) {
      stopLensCdpDiagnostics(capture.webContentsId, true);
    }
  }
}

subscribeLensCdpPolicy(enforceLensCdpDiagnosticsPolicy);

export function handleLensCdpDiagnosticsNavigation(
  webContentsId: number,
  nextUrl: string,
) {
  const capture = captures.get(webContentsId);
  if (!capture?.enabled) return;
  let nextHost = "";
  try {
    nextHost = normalizeLensHostEntry(new URL(nextUrl).hostname) ?? "";
  } catch {
    stopLensCdpDiagnostics(webContentsId, true);
    return;
  }
  if (nextHost !== capture.host) {
    stopLensCdpDiagnostics(webContentsId, true);
    return;
  }
  capture.generation += 1;
  clearCaptureData(capture);
}

export function handleLensCdpDiagnosticsNavigationStart(
  webContentsId: number,
  nextUrl: string,
) {
  const capture = captures.get(webContentsId);
  if (!capture) return;
  if (!capture.enabled) {
    clearCaptureData(capture);
    captures.delete(webContentsId);
    return;
  }
  try {
    const parsed = new URL(nextUrl);
    const nextHost = normalizeLensHostEntry(parsed.hostname);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !nextHost ||
      nextHost !== capture.host
    ) {
      stopLensCdpDiagnostics(webContentsId, true);
    }
  } catch {
    stopLensCdpDiagnostics(webContentsId, true);
  }
}

export function clearLensCdpDiagnostics(
  webContentsId: number,
  kind: "console" | "network",
) {
  const capture = captures.get(webContentsId);
  if (capture) clearCaptureData(capture, kind);
}

export function getLensConsoleEntryDetail(
  webContentsId: number,
  entryId: string,
) {
  return captures.get(webContentsId)?.consoleDetails.get(entryId);
}

export async function getLensConsoleObjectProperties(args: {
  webContentsId: number;
  entryId: string;
  objectHandle: string;
  limit: number;
}): Promise<BrowserConsoleObjectProperties | undefined> {
  const capture = captures.get(args.webContentsId);
  const remote = capture?.objectHandles.get(args.objectHandle);
  if (!capture?.enabled || !remote || remote.entryId !== args.entryId) {
    return undefined;
  }
  if (remote.expiresAt <= Date.now()) {
    capture.objectHandles.delete(args.objectHandle);
    releaseObject(remote.objectId, args.webContentsId);
    scheduleObjectHandlePrune(capture);
    return undefined;
  }
  remote.expiresAt = Date.now() + REMOTE_OBJECT_HANDLE_TTL_MS;
  scheduleObjectHandlePrune(capture);
  const generation = capture.generation;
  const result = asRecord(
    await sendCdpCommand(args.webContentsId, "Runtime.getProperties", {
      objectId: remote.objectId,
      ownProperties: true,
      generatePreview: true,
      nonIndexedPropertiesOnly: false,
    }),
  );
  const descriptors = asArray(result?.result);
  if (
    !capture.enabled ||
    capture.generation !== generation ||
    captures.get(args.webContentsId) !== capture ||
    capture.objectHandles.get(args.objectHandle) !== remote
  ) {
    for (const descriptor of descriptors) {
      const record = asRecord(descriptor);
      if (record) {
        releaseDescriptorRemoteObjects(record, args.webContentsId, true);
      }
    }
    return undefined;
  }
  const propertyLimit = Math.min(args.limit, MAX_OBJECT_PROPERTIES);
  const properties = descriptors
    .slice(0, propertyLimit)
    .map(asRecord)
    .filter((descriptor): descriptor is JsonRecord => Boolean(descriptor))
    .map((descriptor) => {
      const name = truncateText(asString(descriptor.name)) ?? "";
      const sensitive = isLensSensitiveFieldName(name);
      releaseDescriptorRemoteObjects(descriptor, args.webContentsId, sensitive);
      const remoteValue =
        descriptor.value && !sensitive
          ? toConsoleArgument(capture, args.entryId, descriptor.value)
          : undefined;
      return {
        name,
        type: remoteValue?.type ?? "accessor",
        subtype: remoteValue?.subtype,
        value: sensitive
          ? "[redacted]"
          : remoteValue === undefined
            ? descriptor.get
              ? "[Getter]"
              : undefined
            : consoleArgumentText(remoteValue),
        preview: remoteValue?.preview,
        objectHandle: remoteValue?.objectHandle,
      };
    });
  for (const descriptor of descriptors.slice(propertyLimit)) {
    const record = asRecord(descriptor);
    if (record) {
      releaseDescriptorRemoteObjects(record, args.webContentsId, true);
    }
  }
  return {
    entryId: args.entryId,
    objectHandle: args.objectHandle,
    properties,
    overflow: descriptors.length > properties.length,
  };
}

export function getLensNetworkEntryDetail(
  webContentsId: number,
  entryId: string,
) {
  return captures.get(webContentsId)?.networkDetails.get(entryId);
}

export function getLensNetworkBody(
  webContentsId: number,
  entryId: string,
  kind: "request" | "response",
) {
  return captures.get(webContentsId)?.bodyStore.get(bodyKey(entryId, kind));
}

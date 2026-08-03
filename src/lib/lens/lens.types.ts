// ---------------------------------------------------------------------------
// Browser feature – shared types (renderer + main via IPC)
// ---------------------------------------------------------------------------

/**
 * Session id used when a caller does not pass an explicit lensSessionId.
 * Every legacy (workspace-only) lens API call transparently targets this
 * session, preserving the historical one-view-per-workspace behavior.
 */
export const DEFAULT_LENS_SESSION_ID = "default";

export interface BrowserNavigationState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  faviconUrl?: string;
}

export interface BrowserNavigationEventPayload {
  workspaceId: string;
  /** Absent only in payloads from pre-multi-session builds; treat as "default". */
  lensSessionId?: string;
  state: BrowserNavigationState;
}

/**
 * Flattened per-session state snapshot emitted on every navigation, load,
 * title, or favicon change (`lens:state-changed`). Tab chips should prefer
 * this over `lens:navigation-event`.
 */
export interface LensStateChangedPayload {
  workspaceId: string;
  lensSessionId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  faviconUrl?: string;
}

/** Summary of one live lens session (renderer + MCP share this registry). */
export interface LensSessionDescriptor {
  workspaceId: string;
  lensSessionId: string;
  url: string;
  title: string;
  isLoading: boolean;
  managedByMcp: boolean;
  sessionScope: LensSessionScope;
}

/**
 * How hidden MCP-owned Lens sessions should enter the workspace UI when an
 * agent starts visual inspection or page interaction.
 */
export type LensAgentPresentationMode =
  | "split-right"
  | "background-tab"
  | "agent-decides";

export type LensAgentActivityKind = "visual" | "interaction";

/**
 * Main-to-renderer request to reveal the same session an agent was using
 * hidden. An absent requestKind is treated as an explicit request for
 * compatibility with payloads from older builds.
 */
export interface LensSessionPresentationRequestPayload {
  workspaceId: string;
  lensSessionId: string;
  reason?: string;
  requestKind?: "explicit" | "agent-activity";
  activityKind?: LensAgentActivityKind;
  toolName?: string;
}

export interface ElementPickerResult {
  selector: string;
  tagName: string;
  id: string;
  classList: string[];
  boundingBox: { x: number; y: number; width: number; height: number };
  computedStyles: Record<string, string>;
  outerHTML: string;
  textContent: string;
  /** React fiber _debugSource — present only when extraction is enabled. */
  debugSource?: ElementPickerDebugSource;
  /** Parent-to-leaf React component names captured from the fiber chain. */
  componentNameChain?: string[];
  /** Main-normalized identity for the document that produced this evidence. */
  page: LensPageIdentity;
  /** Bounded element and surrounding context. */
  anchor: LensAnnotationAnchor;
  /** Page-derived fields are evidence, never provider instructions. */
  trust: LensPageEvidenceTrust;
}

export interface BrowserStackFrame {
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  scriptId?: string;
}

export interface BrowserStackTrace {
  description?: string;
  callFrames: BrowserStackFrame[];
  parent?: BrowserStackTrace;
}

export interface BrowserConsoleObjectProperty {
  name: string;
  type: string;
  subtype?: string;
  value?: string;
  preview?: BrowserConsoleObjectPreview;
  /** Opaque handle for expanding a nested value without exposing CDP ids. */
  objectHandle?: string;
}

export interface BrowserConsoleObjectPreview {
  description?: string;
  overflow: boolean;
  properties: BrowserConsoleObjectProperty[];
}

export interface BrowserConsoleArgument {
  type: string;
  subtype?: string;
  description?: string;
  value?: string | number | boolean | null;
  unserializableValue?: string;
  preview?: BrowserConsoleObjectPreview;
  /** Opaque, short-lived handle resolved only by Electron main. */
  objectHandle?: string;
}

export interface BrowserConsoleEntry {
  id: string;
  level: "log" | "warn" | "error" | "info" | "debug";
  text: string;
  timestamp: string;
  source?: string;
  lineNumber?: number;
  columnNumber?: number;
  executionContextId?: number;
  argumentCount?: number;
  hasObjectArguments?: boolean;
  hasStackTrace?: boolean;
  captureSource?: "cdp" | "electron";
  /**
   * Optional live diagnostics transition carried on the existing console event.
   */
  diagnosticsCaptureState?: LensDiagnosticsCaptureState;
}

export interface BrowserConsoleEntryDetail {
  entryId: string;
  executionContextId?: number;
  executionContext?: {
    id: number;
    name?: string;
    origin?: string;
    frameId?: string;
    isDefault?: boolean;
  };
  arguments: BrowserConsoleArgument[];
  stackTrace?: BrowserStackTrace;
}

export interface BrowserConsoleObjectProperties {
  entryId: string;
  objectHandle: string;
  properties: BrowserConsoleObjectProperty[];
  overflow: boolean;
}

export interface BrowserConsoleEventPayload {
  workspaceId: string;
  /** Absent only in payloads from pre-multi-session builds; treat as "default". */
  lensSessionId?: string;
  entry: BrowserConsoleEntry;
}

export type BrowserNetworkHeaders = Record<string, string[]>;

export interface BrowserNetworkBody {
  kind: "json" | "form" | "text" | "binary" | "unavailable";
  mimeType?: string;
  content?: string;
  size?: number;
  capturedBytes: number;
  truncated: boolean;
  redacted: boolean;
  unavailableReason?: string;
}

export interface BrowserNetworkInitiator {
  type: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stack?: BrowserStackTrace;
}

/**
 * Raw CDP monotonic timestamps and request-relative phase offsets. Phase
 * values use milliseconds and preserve -1 when Chromium reports a phase as
 * unavailable.
 */
export interface BrowserNetworkTiming {
  requestTimestamp: number;
  wallTime?: number;
  responseTimestamp?: number;
  finishedTimestamp?: number;
  requestTime?: number;
  proxyStart?: number;
  proxyEnd?: number;
  dnsStart?: number;
  dnsEnd?: number;
  connectStart?: number;
  connectEnd?: number;
  sslStart?: number;
  sslEnd?: number;
  workerStart?: number;
  workerReady?: number;
  workerFetchStart?: number;
  workerRespondWithSettled?: number;
  sendStart?: number;
  sendEnd?: number;
  pushStart?: number;
  pushEnd?: number;
  receiveHeadersStart?: number;
  receiveHeadersEnd?: number;
}

export interface BrowserNetworkRedirect {
  url: string;
  status: number;
  statusText?: string;
  timestamp: number;
  responseHeaders?: BrowserNetworkHeaders;
}

/**
 * Memory-only, bounded diagnostic data captured from CDP. Bodies are capped
 * and sensitive fields are redacted before this contract crosses IPC.
 * Electron webRequest remains the metadata-only fallback when CDP is absent.
 */
export interface BrowserNetworkEntry {
  entryId: string;
  requestId: string;
  state: "pending" | "complete" | "failed";
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  resourceType?:
    | "mainFrame"
    | "subFrame"
    | "stylesheet"
    | "script"
    | "image"
    | "font"
    | "object"
    | "xhr"
    | "ping"
    | "cspReport"
    | "media"
    | "webSocket"
    | "other";
  mimeType?: string;
  responseSize?: number;
  referrer?: string;
  startedAt?: string;
  durationMs?: number;
  fromCache?: boolean;
  error?: string;
  requestHeaders?: BrowserNetworkHeaders;
  responseHeaders?: BrowserNetworkHeaders;
  hasRequestBody?: boolean;
  hasResponseBody?: boolean;
  detailAvailable?: boolean;
  captureSource?: "cdp" | "webRequest";
  completedAt?: string;
  timestamp: string;
}

export interface BrowserNetworkEntryDetail {
  entryId: string;
  requestId: string;
  requestHeaders?: BrowserNetworkHeaders;
  responseHeaders?: BrowserNetworkHeaders;
  initiator?: BrowserNetworkInitiator;
  timing?: BrowserNetworkTiming;
  redirects?: BrowserNetworkRedirect[];
  protocol?: string;
  remoteAddress?: string;
  connectionId?: number;
  connectionReused?: boolean;
  priority?: string;
  fromServiceWorker?: boolean;
  requestBody?: Omit<BrowserNetworkBody, "content">;
  responseBody?: Omit<BrowserNetworkBody, "content">;
}

export interface LensDiagnosticsCaptureState {
  enabled: boolean;
  host?: string;
  message?: string;
}

export interface BrowserNetworkEventPayload {
  workspaceId: string;
  /** Absent only in payloads from pre-multi-session builds; treat as "default". */
  lensSessionId?: string;
  entry: BrowserNetworkEntry;
}

export interface BrowserScreenshotOptions {
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
}

// ---------------------------------------------------------------------------
// WebContentsView bounds
// ---------------------------------------------------------------------------

export interface LensBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Source code mapping (React fiber _debugSource)
// ---------------------------------------------------------------------------

export interface ElementPickerDebugSource {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface LensSourceMappingConfig {
  /** AI uses class names, text, ID to grep source files. */
  heuristic: boolean;
  /** Extract _debugSource from React fiber internals (dev builds only). */
  reactDebugSource: boolean;
}

// ---------------------------------------------------------------------------
// Annotations (Codex-style element/area comments)
// ---------------------------------------------------------------------------

export interface LensRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LensStyleEdit {
  /** camelCase CSS property (matches ElementPickerResult.computedStyles keys). */
  property: string;
  /** Value captured at selection time. */
  before: string;
  /** Current live value applied to the element. */
  after: string;
}

export const LENS_FEEDBACK_INTENTS = [
  "fix",
  "change",
  "question",
  "approve",
] as const;
export type LensFeedbackIntent = (typeof LENS_FEEDBACK_INTENTS)[number];
export const LENS_FEEDBACK_PRIORITIES = ["low", "medium", "high"] as const;
export type LensFeedbackPriority = (typeof LENS_FEEDBACK_PRIORITIES)[number];
export type LensPageEvidenceTrust = "untrusted-page-evidence";

export interface LensViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface LensScrollPosition {
  x: number;
  y: number;
}

export interface LensPageIdentity {
  /** Main-normalized URL with credentials, query, and hash removed. */
  url: string;
  title: string;
  viewport: LensViewport;
  scroll: LensScrollPosition;
  /** Main-issued identity rotated for every top-level document navigation. */
  documentId: string;
}

export interface LensElementIdentity {
  tagName: string;
  id?: string;
  classList: string[];
}

export interface LensElementContextHint {
  selector?: string;
  tagName: string;
  elementId?: string;
  accessibleName?: string;
  role?: string;
  text?: string;
}

export type LensNearbyElementRelation =
  | "parent"
  | "previous"
  | "next"
  | "child"
  | "within";

export interface LensNearbyElementHint extends LensElementContextHint {
  relation: LensNearbyElementRelation;
}

export interface LensAnnotationAnchor {
  selector?: string;
  bounds: LensRect;
  element?: LensElementIdentity;
  accessibleName?: string;
  role?: string;
  /** Allowlisted attributes only; secret-like values are redacted in main. */
  attributes: Record<string, string>;
  ancestors: LensElementContextHint[];
  nearby: LensNearbyElementHint[];
  computedStyles: Record<string, string>;
  outerHTML?: string;
  textContent?: string;
  debugSource?: ElementPickerDebugSource;
  componentNameChain?: string[];
}

export interface LensAnnotationEvidence {
  screenshot: {
    kind: "clipped";
    bounds: LensRect;
  };
  styleEdits: LensStyleEdit[];
}

export interface LensAnnotationFeedback {
  comment: string;
  intent: LensFeedbackIntent;
  priority: LensFeedbackPriority;
}

export interface LensVisualReviewEnvelope {
  version: 1;
  page: LensPageIdentity;
  anchor: LensAnnotationAnchor;
  evidence: LensAnnotationEvidence;
  feedback: LensAnnotationFeedback;
  trust: LensPageEvidenceTrust;
}

// ---------------------------------------------------------------------------
// Box model inspection (Figma/DevTools-style padding / border / margin)
// ---------------------------------------------------------------------------

/** Per-side CSS-pixel values for one box-model ring. */
export interface LensBoxEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LensBoxModel {
  selector: string;
  tagName: string;
  id: string;
  classList: string[];
  /** Viewport-relative border-box rect (matches getBoundingClientRect). */
  rect: LensRect;
  /** Content-box size in CSS pixels. */
  content: { width: number; height: number };
  padding: LensBoxEdges;
  border: LensBoxEdges;
  margin: LensBoxEdges;
  /** Resolved box-sizing (content-box | border-box). */
  boxSizing: string;
}

/** Gap measurement between two elements' nearest facing edges. */
export interface LensMeasurement {
  /** Horizontal gap in CSS px; 0 when the boxes overlap on the X axis. */
  horizontal: number;
  /** Vertical gap in CSS px; 0 when the boxes overlap on the Y axis. */
  vertical: number;
  /** True when the two boxes overlap horizontally. */
  overlapX: boolean;
  /** True when the two boxes overlap vertically. */
  overlapY: boolean;
}

export interface LensAnnotation {
  /** Stable id generated in-page. */
  id: string;
  kind: "element" | "area";
  /** 1-based display index assigned by the in-page registry. */
  pin: number;
  /** Viewport-relative CSS-pixel rect (element boundingBox or drawn area). */
  rect: LensRect;
  comment: string;
  /** ISO timestamp set in-page when the annotation is created. */
  createdAt: string;
  // -- element-kind fields (undefined for area annotations) --
  selector?: string;
  tagName?: string;
  /** Element id attribute. Named to avoid clashing with annotation id. */
  elementId?: string;
  classList?: string[];
  computedStyles?: Record<string, string>;
  outerHTML?: string;
  textContent?: string;
  debugSource?: ElementPickerDebugSource;
  componentNameChain?: string[];
  /** Live style edits applied to this element. */
  styleEdits?: LensStyleEdit[];
  /** Runtime-validated visual review context normalized in Electron main. */
  review: LensVisualReviewEnvelope;
}

export type LensAnnotationEventType =
  "add" | "update" | "remove" | "clear" | "submit";

export interface LensAnnotationEventPayload {
  workspaceId: string;
  /** Absent only in payloads from pre-multi-session builds; treat as "default". */
  lensSessionId?: string;
  /** Main-issued identity of the page document that produced this event. */
  documentId?: string;
  type: LensAnnotationEventType;
  /** Present for add/update/remove. */
  annotation?: LensAnnotation;
  /** Present for submit: the full batch the user chose to send. */
  annotations?: LensAnnotation[];
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

export type LensDownloadState =
  "progressing" | "completed" | "cancelled" | "interrupted";

export interface LensDownloadEntry {
  id: string;
  url: string;
  filename: string;
  /** Absolute path under userData/lens-downloads/<workspaceId>/. */
  savePath: string;
  mimeType?: string;
  totalBytes?: number;
  receivedBytes?: number;
  state: LensDownloadState;
  startedAt: string;
  completedAt?: string;
}

export interface LensDownloadEventPayload {
  workspaceId: string;
  /** Absent only in payloads from pre-multi-session builds; treat as "default". */
  lensSessionId?: string;
  entry: LensDownloadEntry;
}

// ---------------------------------------------------------------------------
// Session profiles
// ---------------------------------------------------------------------------

export type LensSessionScope = "project" | "workspace";

export interface LensSessionProfileArgs {
  workspaceId: string;
  sessionScope?: LensSessionScope;
  /** Stable project/repository identity. Main hashes this before using it in a partition name. */
  projectKey?: string | null;
}

// ---------------------------------------------------------------------------
// Security configuration (renderer settings pushed to main)
// ---------------------------------------------------------------------------

export interface LensSecurityConfig {
  /** Hosts always allowed. Empty = no allowlist restriction. */
  allowedHosts: string[];
  /** Hosts always blocked (wins over the allowlist). */
  blockedHosts: string[];
  /** Master switch for CDP-backed Lens operations. */
  developerModeCdp: boolean;
  /** Hosts approved for CDP access (per-host opt-in). */
  cdpApprovedHosts: string[];
}

export interface LensCdpApprovalRequestPayload {
  workspaceId: string;
  /**
   * Lens session that triggered the CDP request. Optional for back-compat
   * with older payloads; absent means the default session ("default").
   */
  lensSessionId?: string;
  requestId: string;
  url: string;
  host: string;
  reason: string;
  /** Epoch milliseconds when main will stop accepting this response. */
  expiresAt?: number;
}

export interface LensCdpApprovalResponse {
  requestId: string;
  approved: boolean;
  remember?: boolean;
}

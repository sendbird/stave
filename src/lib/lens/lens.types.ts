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
 * Main-to-renderer request to reveal the same session an agent was using
 * hidden. Routine inspection should not emit this request.
 */
export interface LensSessionPresentationRequestPayload {
  workspaceId: string;
  lensSessionId: string;
  reason?: string;
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
}

export interface BrowserConsoleEntry {
  level: "log" | "warn" | "error" | "info" | "debug";
  text: string;
  timestamp: string;
  source?: string;
  lineNumber?: number;
}

export interface BrowserConsoleEventPayload {
  workspaceId: string;
  /** Absent only in payloads from pre-multi-session builds; treat as "default". */
  lensSessionId?: string;
  entry: BrowserConsoleEntry;
}

export interface BrowserNetworkEntry {
  requestId: string;
  url: string;
  method: string;
  status?: number;
  mimeType?: string;
  responseSize?: number;
  timestamp: string;
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
}

export type LensAnnotationEventType =
  "add" | "update" | "remove" | "clear" | "submit";

export interface LensAnnotationEventPayload {
  workspaceId: string;
  /** Absent only in payloads from pre-multi-session builds; treat as "default". */
  lensSessionId?: string;
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

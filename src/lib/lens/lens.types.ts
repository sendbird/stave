// ---------------------------------------------------------------------------
// Browser feature – shared types (renderer + main via IPC)
// ---------------------------------------------------------------------------

export interface BrowserNavigationState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

export interface BrowserNavigationEventPayload {
  workspaceId: string;
  state: BrowserNavigationState;
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

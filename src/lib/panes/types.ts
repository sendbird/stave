/**
 * Universal pane/tab model shared by the Dockview-based workspace pane host.
 *
 * Every piece of center content (task chat, CLI session, compare run, lens
 * browser, terminal, editor file) is a "surface" hosted inside a Dockview
 * panel. Panel ids are deterministic encodings of the surface identity so
 * that serialized layouts, tab metadata, and store collections can reference
 * the same key without extra bookkeeping.
 */

export const PANE_SURFACE_KINDS = [
  "task",
  "cli-session",
  "compare-run",
  "lens",
  "terminal",
  "editor",
] as const;

export type PaneSurfaceKind = (typeof PANE_SURFACE_KINDS)[number];

export type PaneSurfaceDescriptor =
  | { kind: "task"; taskId: string }
  | { kind: "cli-session"; cliSessionTabId: string }
  | { kind: "compare-run"; compareRunId: string }
  | { kind: "lens"; lensSessionId: string }
  | { kind: "terminal"; terminalTabId: string }
  | { kind: "editor"; editorTabId: string };

/** Per-tab user customization, persisted per workspace keyed by panel id. */
export interface PaneTabMeta {
  customTitle?: string;
  customIcon?: string;
  pinned?: boolean;
}

/** A lens (browser preview) tab instance owned by a workspace. */
export interface WorkspaceLensTab {
  id: string;
  createdAt: number;
}

/**
 * Serialized Dockview layout as produced by `DockviewApi.toJSON()`. Kept
 * opaque on purpose — the pane host validates it before `fromJSON` and falls
 * back to a synthesized layout when it does not match the surface registry.
 */
export type PaneDockLayout = Record<string, unknown>;

const PANEL_ID_PREFIX_BY_KIND: Record<PaneSurfaceKind, string> = {
  task: "task",
  "cli-session": "cli",
  "compare-run": "compare",
  lens: "lens",
  terminal: "term",
  editor: "editor",
};

const KIND_BY_PANEL_ID_PREFIX: Record<string, PaneSurfaceKind> =
  Object.fromEntries(
    Object.entries(PANEL_ID_PREFIX_BY_KIND).map(([kind, prefix]) => [
      prefix,
      kind as PaneSurfaceKind,
    ]),
  );

export function getPaneSurfaceEntityId(surface: PaneSurfaceDescriptor): string {
  switch (surface.kind) {
    case "task":
      return surface.taskId;
    case "cli-session":
      return surface.cliSessionTabId;
    case "compare-run":
      return surface.compareRunId;
    case "lens":
      return surface.lensSessionId;
    case "terminal":
      return surface.terminalTabId;
    case "editor":
      return surface.editorTabId;
  }
}

export function buildPanePanelId(surface: PaneSurfaceDescriptor): string {
  return `${PANEL_ID_PREFIX_BY_KIND[surface.kind]}:${getPaneSurfaceEntityId(surface)}`;
}

/**
 * Parse a panel id back into a surface descriptor. Entity ids may themselves
 * contain ":" (editor tab ids like "file:/path"), so only the first separator
 * is significant.
 */
export function parsePanePanelId(
  panelId: string,
): PaneSurfaceDescriptor | null {
  const separatorIndex = panelId.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const prefix = panelId.slice(0, separatorIndex);
  const entityId = panelId.slice(separatorIndex + 1);
  const kind = KIND_BY_PANEL_ID_PREFIX[prefix];
  if (!kind || !entityId) {
    return null;
  }
  switch (kind) {
    case "task":
      return { kind, taskId: entityId };
    case "cli-session":
      return { kind, cliSessionTabId: entityId };
    case "compare-run":
      return { kind, compareRunId: entityId };
    case "lens":
      return { kind, lensSessionId: entityId };
    case "terminal":
      return { kind, terminalTabId: entityId };
    case "editor":
      return { kind, editorTabId: entityId };
  }
}

export function isPaneSurfaceKind(value: unknown): value is PaneSurfaceKind {
  return PANE_SURFACE_KINDS.includes(value as PaneSurfaceKind);
}

export function paneSurfaceEquals(
  a: PaneSurfaceDescriptor | null | undefined,
  b: PaneSurfaceDescriptor | null | undefined,
): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.kind === b.kind && getPaneSurfaceEntityId(a) === getPaneSurfaceEntityId(b);
}

export function normalizePaneTabMeta(value: unknown): Record<string, PaneTabMeta> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, PaneTabMeta> = {};
  for (const [panelId, rawMeta] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!parsePanePanelId(panelId) || !rawMeta || typeof rawMeta !== "object") {
      continue;
    }
    const meta = rawMeta as Record<string, unknown>;
    const normalized: PaneTabMeta = {};
    if (typeof meta.customTitle === "string" && meta.customTitle.trim()) {
      normalized.customTitle = meta.customTitle;
    }
    if (typeof meta.customIcon === "string" && meta.customIcon.trim()) {
      normalized.customIcon = meta.customIcon;
    }
    if (meta.pinned === true) {
      normalized.pinned = true;
    }
    if (Object.keys(normalized).length > 0) {
      result[panelId] = normalized;
    }
  }
  return result;
}

export function normalizeLensTabs(value: unknown): WorkspaceLensTab[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: WorkspaceLensTab[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const tab = raw as Record<string, unknown>;
    if (typeof tab.id !== "string" || !tab.id.trim() || seen.has(tab.id)) {
      continue;
    }
    seen.add(tab.id);
    result.push({
      id: tab.id,
      createdAt: typeof tab.createdAt === "number" ? tab.createdAt : 0,
    });
  }
  return result;
}

export function normalizePaneDockLayout(value: unknown): PaneDockLayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as PaneDockLayout;
}

export function normalizeOpenTaskTabIds(
  value: unknown,
  validTaskIds: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || seen.has(raw) || !validTaskIds.has(raw)) {
      continue;
    }
    seen.add(raw);
    result.push(raw);
  }
  return result;
}

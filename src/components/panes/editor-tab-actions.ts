import { i18n } from "@/i18n";
import { recordClosedPaneTab } from "@/components/panes/closed-tab-history";
import { copyTextToClipboard } from "@/lib/clipboard";
import { resolvePathBaseName } from "@/lib/path-utils";
import { buildPanePanelId } from "@/lib/panes/types";
import { useAppStore } from "@/store/app.store";
import type { EditorTab } from "@/types/chat";

/**
 * Reusable editor-tab actions shared by the editor surface toolbar and the
 * universal pane tab context menu (wave 3). These replace the per-tab context
 * menu that used to live in the editor-main tab strip: Close Others / Close to
 * the Right / Close Saved / Close All plus the Copy Path variants.
 *
 * Everything is store-driven: closing tabs here removes the entries from
 * `editorTabs`, and the pane host reconciler tears down the Dockview panels.
 */

export type EditorBulkCloseKind = "others" | "right" | "saved" | "all";

export interface EditorBulkClosePlan {
  kind: EditorBulkCloseKind;
  tabIds: string[];
  dirtyTabIds: string[];
  /** Confirm-dialog copy, mirroring the legacy editor tab strip. */
  title: string;
  description: string;
}

const BULK_CLOSE_COPY: Record<
  EditorBulkCloseKind,
  { title: string; description: string }
> = {
  others: {
    get title() { return i18n.t("panes:editorTabActions.closeOtherTabs"); },
    get description() { return i18n.t("panes:editorTabActions.closeAllEditorTabsExceptThisTab"); },
  },
  right: {
    get title() { return i18n.t("panes:editorTabActions.closeTabsToTheRight"); },
    get description() { return i18n.t("panes:editorTabActions.closeAllEditorTabsToTheRight"); },
  },
  saved: {
    get title() { return i18n.t("panes:editorTabActions.closeSavedTabs"); },
    get description() { return i18n.t("panes:editorTabActions.closeAllSavedEditorTabs"); },
  },
  all: {
    get title() { return i18n.t("panes:editorTabActions.closeAllTabs"); },
    get description() { return i18n.t("panes:editorTabActions.closeAllOpenEditorTabs"); },
  },
};

/**
 * Resolve which editor tabs a bulk-close gesture affects. Returns null when
 * the gesture is a no-op. Callers should confirm with the user when
 * `dirtyTabIds` is non-empty before calling `closeEditorTabs`.
 */
export function buildEditorBulkClosePlan(args: {
  editorTabs: EditorTab[];
  anchorTabId: string;
  kind: EditorBulkCloseKind;
  pinnedTabIds?: readonly string[];
}): EditorBulkClosePlan | null {
  const { editorTabs, anchorTabId, kind } = args;
  const pinnedTabIds = new Set(args.pinnedTabIds ?? []);
  let targetTabs: EditorTab[];
  switch (kind) {
    case "others":
      targetTabs = editorTabs.filter(
        (tab) => tab.id !== anchorTabId && !pinnedTabIds.has(tab.id),
      );
      break;
    case "right": {
      const anchorIndex = editorTabs.findIndex((tab) => tab.id === anchorTabId);
      targetTabs =
        anchorIndex >= 0
          ? editorTabs
              .slice(anchorIndex + 1)
              .filter((tab) => !pinnedTabIds.has(tab.id))
          : [];
      break;
    }
    case "saved":
      targetTabs = editorTabs.filter(
        (tab) => !tab.isDirty && !pinnedTabIds.has(tab.id),
      );
      break;
    case "all":
      targetTabs = editorTabs.filter((tab) => !pinnedTabIds.has(tab.id));
      break;
  }
  if (targetTabs.length === 0) {
    return null;
  }
  const dirtyTabIds = targetTabs
    .filter((tab) => tab.isDirty)
    .map((tab) => tab.id);
  const copy = BULK_CLOSE_COPY[kind];
  return {
    kind,
    tabIds: targetTabs.map((tab) => tab.id),
    dirtyTabIds,
    title: copy.title,
    description:
      dirtyTabIds.length > 0
        ? i18n.t("panes:editorTabActions.unsavedTabSWillAlsoBeClosed", { value1: copy.description, value2: dirtyTabIds.length })
        : copy.description,
  };
}

export function closeEditorTabs(args: { tabIds: string[] }) {
  const store = useAppStore.getState();
  for (const tabId of Array.from(new Set(args.tabIds))) {
    const panelId = buildPanePanelId({ kind: "editor", editorTabId: tabId });
    if (store.paneTabMeta[panelId]?.pinned) {
      continue;
    }
    recordClosedPaneTab({ kind: "editor", editorTabId: tabId });
    store.closeEditorTab({ tabId });
  }
}

/**
 * Close metadata for a single tab so callers can raise a dirty-close confirm
 * (the store's `closeEditorTab` discards unsaved changes without asking).
 */
export function getEditorTabCloseRequest(args: {
  editorTabs: EditorTab[];
  tabId: string;
}): { tabId: string; fileName: string; isDirty: boolean } | null {
  const tab = args.editorTabs.find((item) => item.id === args.tabId);
  if (!tab) {
    return null;
  }
  return {
    tabId: tab.id,
    fileName: resolvePathBaseName({ path: tab.filePath, fallback: tab.filePath }),
    isDirty: tab.isDirty,
  };
}

export function resolveEditorTabAbsolutePath(args: {
  filePath: string;
  workspaceRootPath: string;
}) {
  const root = args.workspaceRootPath.replace(/[\\/]+$/, "");
  if (!root) {
    return args.filePath;
  }
  return `${root}/${args.filePath.replace(/^[/\\]+/, "")}`;
}

export function buildEditorTabBreadcrumbsPath(args: { filePath: string }) {
  return args.filePath.split("/").filter(Boolean).join(" > ");
}

async function copyTextSilently(value: string) {
  if (!value) {
    return;
  }
  try {
    await copyTextToClipboard(value);
  } catch {
    // Keep silent; clipboard API can be denied based on runtime permissions.
  }
}

export async function copyEditorTabPath(args: {
  filePath: string;
  workspaceRootPath: string;
}) {
  await copyTextSilently(resolveEditorTabAbsolutePath(args));
}

export async function copyEditorTabRelativePath(args: { filePath: string }) {
  await copyTextSilently(args.filePath);
}

export async function copyEditorTabBreadcrumbsPath(args: { filePath: string }) {
  await copyTextSilently(buildEditorTabBreadcrumbsPath(args));
}

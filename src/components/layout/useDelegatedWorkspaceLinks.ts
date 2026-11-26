import { useEffect, useSyncExternalStore } from "react";
import {
  DelegatedWorkspaceLinkListSchema,
  type DelegatedWorkspaceLink,
} from "@/lib/workspace-delegation-tree";

/**
 * The sidebar's copy of the delegated workspace links (`workspace-delegation-tree.ts`),
 * read from the run ledger in main. It is read again when a delegation changes
 * phase, when workspace cleanup changes the registry, and when the sidebar's
 * workspace list changes; reads coalesce. The snapshot is replaced only when
 * its content changes, so subscribers see a stable reference.
 */
const EMPTY: readonly DelegatedWorkspaceLink[] = [];
let snapshot: readonly DelegatedWorkspaceLink[] = EMPTY;
let serialized = "[]";
let started = false;
let previewOverride = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let reading = false;
let readAgain = false;
const listeners = new Set<() => void>();

function publish(next: readonly DelegatedWorkspaceLink[]) {
  const text = JSON.stringify(next);
  if (text === serialized) return;
  serialized = text;
  snapshot = next.length === 0 ? EMPTY : next;
  for (const listener of listeners) listener();
}

async function read() {
  const list = window.api?.runs?.listDelegatedWorkspaceLinks;
  if (!list || previewOverride) return;
  if (reading) { readAgain = true; return; }
  reading = true;
  try {
    const parsed = DelegatedWorkspaceLinkListSchema.safeParse(await list());
    if (parsed.success && !previewOverride) publish(parsed.data);
  } catch (error) {
    // Keep the last known nesting; the next change reads again.
    console.warn("[sidebar] delegated workspace links are unavailable", error);
  } finally {
    reading = false;
    if (readAgain) { readAgain = false; refreshDelegatedWorkspaceLinks(); }
  }
}

/** Reads the links again shortly; repeated calls coalesce into one read. */
export function refreshDelegatedWorkspaceLinks() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; void read(); }, 150);
}

function start() {
  if (started) return;
  started = true;
  window.api?.runs?.onDelegatedTasksChanged?.(() => refreshDelegatedWorkspaceLinks());
  window.api?.workspaceCleanup?.onChanged?.(() => refreshDelegatedWorkspaceLinks());
  refreshDelegatedWorkspaceLinks();
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => snapshot;

/**
 * Current links. `workspaceKey` names the workspace list the caller shows; a
 * change in it (a workspace created or archived) reads the links again.
 */
export function useDelegatedWorkspaceLinks(workspaceKey: string): readonly DelegatedWorkspaceLink[] {
  const links = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { refreshDelegatedWorkspaceLinks(); }, [workspaceKey]);
  return links;
}

/** Dev previews and rendered tests without a main process supply their own links. */
export function setDelegatedWorkspaceLinksForPreview(links: readonly DelegatedWorkspaceLink[]) {
  previewOverride = true;
  publish(DelegatedWorkspaceLinkListSchema.parse(links));
}

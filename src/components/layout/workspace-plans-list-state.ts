/**
 * The Plans list's load state. A failed read keeps the last list it loaded and
 * never falls through to the empty state, which would read as "no plans".
 * Which of the loaded documents are drawn (recent ten, all, or a search's
 * matches) is chosen at the end of this file.
 */

import { MAX_WORKSPACE_PLANS } from "@/lib/plans";

export interface WorkspaceDocumentFilePaths {
  current: string[];
  legacy: string[];
}

export const EMPTY_FILE_PATHS: WorkspaceDocumentFilePaths = { current: [], legacy: [] };

export interface PlansListState {
  filePaths: WorkspaceDocumentFilePaths;
  loading: boolean;
  /** The last read failed; `filePaths` still holds the last successful list. */
  loadFailed: boolean;
}

export type PlansListAction =
  | { type: "load-started" }
  | { type: "load-succeeded"; filePaths: WorkspaceDocumentFilePaths }
  | { type: "load-failed" }
  | { type: "plan-removed"; filePath: string }
  | { type: "no-workspace" };

export function initialPlansListState(hasWorkspacePath: boolean): PlansListState {
  return { filePaths: EMPTY_FILE_PATHS, loading: hasWorkspacePath, loadFailed: false };
}

export function reducePlansList(
  state: PlansListState,
  action: PlansListAction,
): PlansListState {
  switch (action.type) {
    case "load-started":
      return { ...state, loading: true };
    case "load-succeeded":
      return { filePaths: action.filePaths, loading: false, loadFailed: false };
    case "load-failed":
      return { ...state, loading: false, loadFailed: true };
    case "plan-removed":
      return {
        ...state,
        filePaths: {
          current: state.filePaths.current.filter((path) => path !== action.filePath),
          legacy: state.filePaths.legacy.filter((path) => path !== action.filePath),
        },
      };
    case "no-workspace":
      return { filePaths: EMPTY_FILE_PATHS, loading: false, loadFailed: false };
  }
}

export type PlansListView = "unavailable" | "list" | "failed" | "loading" | "empty";

/**
 * Plans on screen win over everything else; a failed read outranks loading so
 * a retry does not flicker back to a spinner; the empty state needs a read
 * that succeeded.
 */
export function resolvePlansListView(args: {
  hasWorkspacePath: boolean;
  loading: boolean;
  loadFailed: boolean;
  entryCount: number;
}): PlansListView {
  if (!args.hasWorkspacePath) return "unavailable";
  if (args.entryCount > 0) return "list";
  if (args.loadFailed) return "failed";
  if (args.loading) return "loading";
  return "empty";
}

/** The fields a Plans search reads. */
export interface PlanSearchFields {
  filePath: string;
  label: string;
  taskIdPrefix: string;
}

/** What the Plans list draws from every document it holds. */
export interface PlansListRows<T> {
  rows: T[];
  /** Every document the list holds. */
  total: number;
  /** While searching, how many documents match; otherwise the rows drawn. */
  matched: number;
  searching: boolean;
  /** Documents the recent cut leaves out: 0 while searching or showing all. */
  hidden: number;
}

/**
 * Compared composed (NFC) and lower-cased: a file system can store a Korean
 * name decomposed while a typed query is composed, and the two must match.
 */
function searchForm(text: string): string {
  return text.normalize("NFC").toLocaleLowerCase();
}

function queryWords(query: string): string[] {
  return searchForm(query).trim().split(/\s+/u).filter(Boolean);
}

/** Every word appears, in any case or Unicode form, in the document's label, file name or task reference. */
function planMatchesWords(entry: PlanSearchFields, words: readonly string[]): boolean {
  const fileName = entry.filePath.slice(entry.filePath.lastIndexOf("/") + 1);
  const haystack = searchForm(`${entry.label}\n${fileName}\n${entry.taskIdPrefix}`);
  return words.every((word) => haystack.includes(word));
}

/**
 * The rows the Plans list draws from `entries` (newest first, uncut): the
 * `recentLimit` most recent by default, every one when `showAll`, and every
 * match across all of them while a query is typed.
 */
export function selectPlansListRows<T extends PlanSearchFields>(args: {
  entries: readonly T[];
  query: string;
  showAll: boolean;
  recentLimit?: number;
}): PlansListRows<T> {
  const total = args.entries.length;
  const words = queryWords(args.query);
  if (words.length > 0) {
    const rows = args.entries.filter((entry) => planMatchesWords(entry, words));
    return { rows, total, matched: rows.length, searching: true, hidden: 0 };
  }
  const rows = args.showAll ? [...args.entries] : args.entries.slice(0, args.recentLimit ?? MAX_WORKSPACE_PLANS);
  return { rows, total, matched: rows.length, searching: false, hidden: total - rows.length };
}

/**
 * The search earns its place once the recent cut hides documents, and stays
 * while a query is typed or the field has focus: a search cleared after
 * deletions left ten or fewer must not pull the field out from under the
 * keyboard. It goes once focus leaves.
 */
export function shouldOfferPlansSearch(args: { total: number; query: string; focused?: boolean; recentLimit?: number }): boolean {
  return args.total > (args.recentLimit ?? MAX_WORKSPACE_PLANS) || queryWords(args.query).length > 0 || args.focused === true;
}

/** The count line under the list: for a cut list or a search, never for ten or fewer at rest. */
export function shouldShowPlansStatus(view: PlansListRows<unknown>, recentLimit = MAX_WORKSPACE_PLANS): boolean {
  return view.searching || view.total > recentLimit;
}

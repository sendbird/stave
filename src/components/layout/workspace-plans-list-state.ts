/**
 * The Plans list's load state. A failed read keeps the last list it loaded and
 * never falls through to the empty state, which would read as "no plans".
 */

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

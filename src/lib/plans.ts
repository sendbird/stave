export const WORKSPACE_PLANS_DIRECTORY = ".stave/context/plans";
export const LEGACY_WORKSPACE_PLANS_DIRECTORY = ".stave/plans";
/** Documents listed in the Information panel, most recently updated first. */
export const MAX_WORKSPACE_PLANS = 10;

export interface WorkspacePlanEntry {
  filePath: string;
  label: string;
  /** `YYYY-MM-DDTHH-mm-ss` from a `<taskIdPrefix>_<timestamp>.md` name, else empty. */
  timestamp: string;
  taskIdPrefix: string;
}

/** Files Stave named for a task: `<taskIdPrefix>_<timestamp>.md`. */
const TASK_DOCUMENT_FILE_NAME_RE =
  /^([A-Za-z0-9-]{1,36})_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/;

export interface WorkspacePlanListEntry extends WorkspacePlanEntry {
  source: "current" | "legacy";
}

function toTimestampToken(value: Date) {
  return value.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function buildWorkspacePlanFilePath(args: {
  taskId: string;
  createdAt?: Date;
}) {
  const timestamp = toTimestampToken(args.createdAt ?? new Date());
  const shortTaskId = args.taskId.slice(0, 8);
  return `${WORKSPACE_PLANS_DIRECTORY}/${shortTaskId}_${timestamp}.md`;
}

export function parseWorkspacePlanFilePath(
  filePath: string,
): WorkspacePlanEntry {
  const fileName = filePath.split("/").pop() ?? filePath;
  const nameWithoutExt = fileName.replace(/\.md$/, "");
  const taskNamed = TASK_DOCUMENT_FILE_NAME_RE.exec(nameWithoutExt);
  if (!taskNamed) {
    // A document named for its content, such as `retry-design.md`.
    return { filePath, label: nameWithoutExt, timestamp: "", taskIdPrefix: "" };
  }
  const taskIdPrefix = taskNamed[1] ?? "";
  const timestamp = taskNamed[2] ?? "";
  const label = timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})$/, " $1:$2:$3");

  return {
    filePath,
    label,
    timestamp,
    taskIdPrefix,
  };
}

const PLAN_TODO_CHECKBOX_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/;
const PLAN_TODO_NUMBERED_RE = /^\s*\d+[.)]\s+(.+)$/;
const MAX_IMPORTED_PLAN_TODOS = 100;

/**
 * Extract actionable checklist items from a saved plan's markdown so they can
 * be promoted into trackable workspace todos. Prefers GitHub-style task-list
 * checkboxes (`- [ ]` / `- [x]`); when a plan has none, falls back to numbered
 * list items. Returns at most {@link MAX_IMPORTED_PLAN_TODOS} entries.
 */
export function extractPlanTodoItems(
  markdown: string,
): { text: string; completed: boolean }[] {
  if (!markdown) {
    return [];
  }

  const checkboxItems: { text: string; completed: boolean }[] = [];
  const numberedItems: { text: string; completed: boolean }[] = [];

  for (const line of markdown.split(/\r?\n/)) {
    const checkbox = PLAN_TODO_CHECKBOX_RE.exec(line);
    if (checkbox) {
      const text = (checkbox[2] ?? "").trim();
      if (text) {
        checkboxItems.push({
          text,
          completed: (checkbox[1] ?? "").toLowerCase() === "x",
        });
      }
      continue;
    }

    const numbered = PLAN_TODO_NUMBERED_RE.exec(line);
    if (numbered) {
      const text = (numbered[1] ?? "").trim();
      if (text) {
        numberedItems.push({ text, completed: false });
      }
    }
  }

  const items = checkboxItems.length > 0 ? checkboxItems : numberedItems;
  return items.slice(0, MAX_IMPORTED_PLAN_TODOS);
}

export function isWorkspacePlanFilePath(filePath: string) {
  const normalizedFilePath = filePath.replaceAll("\\", "/");
  if (
    !normalizedFilePath.endsWith(".md") ||
    normalizedFilePath.split("/").includes("..")
  ) {
    return false;
  }

  const directoryPath = normalizedFilePath.slice(
    0,
    normalizedFilePath.lastIndexOf("/"),
  );
  return (
    directoryPath === WORKSPACE_PLANS_DIRECTORY ||
    directoryPath === LEGACY_WORKSPACE_PLANS_DIRECTORY
  );
}

/** `2026-04-01T01-02-03` → `2026-04-01T01:02:03`, comparable with ISO times. */
function timestampToIso(timestamp: string) {
  return timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3");
}

/**
 * Newest first. A document's recorded update time wins; a task-named file
 * falls back to the time in its name; anything else sorts last by name.
 */
export function sortWorkspacePlansNewestFirst<T extends WorkspacePlanEntry>(
  entries: T[],
  updatedAtByPath: Readonly<Record<string, string>> = {},
) {
  const sortKey = (entry: T) =>
    updatedAtByPath[entry.filePath] ?? timestampToIso(entry.timestamp);
  return [...entries].sort(
    (left, right) =>
      sortKey(right).localeCompare(sortKey(left)) ||
      left.filePath.localeCompare(right.filePath),
  );
}

export function buildWorkspacePlanListEntries(args: {
  currentFilePaths?: string[];
  legacyFilePaths?: string[];
  maxEntries?: number;
  /** Recorded update time per document, from its newest revision. */
  updatedAtByPath?: Readonly<Record<string, string>>;
}) {
  const nextEntries = [
    ...(args.currentFilePaths ?? []).map((filePath) => ({
      ...parseWorkspacePlanFilePath(filePath),
      source: "current" as const,
    })),
    ...(args.legacyFilePaths ?? []).map((filePath) => ({
      ...parseWorkspacePlanFilePath(filePath),
      source: "legacy" as const,
    })),
  ];

  const dedupedEntries = new Map<string, WorkspacePlanListEntry>();
  nextEntries.forEach((entry) => {
    dedupedEntries.set(entry.filePath, entry);
  });

  return sortWorkspacePlansNewestFirst(
    [...dedupedEntries.values()],
    args.updatedAtByPath,
  ).slice(
    0,
    args.maxEntries ?? MAX_WORKSPACE_PLANS,
  );
}

export async function persistWorkspacePlanFile(args: {
  rootPath: string;
  taskId: string;
  planText: string;
}): Promise<string | null> {
  const filePath = buildWorkspacePlanFilePath({ taskId: args.taskId });
  try {
    const createResult = await window.api?.fs?.createDirectory?.({
      rootPath: args.rootPath,
      directoryPath: WORKSPACE_PLANS_DIRECTORY,
    });
    // `fs:create-directory` IPC returns `{ ok: false, alreadyExists: true }`
    // when the directory is already present — treat that as success. Any
    // other `ok: false` is a real failure and must not be silently papered
    // over the way the previous version did.
    if (
      createResult &&
      createResult.ok === false &&
      !("alreadyExists" in createResult && createResult.alreadyExists === true)
    ) {
      // eslint-disable-next-line no-console
      console.warn("[plans] createDirectory failed while persisting plan", {
        filePath,
        stderr: createResult.stderr,
      });
      return null;
    }
    const writeResult = await window.api?.fs?.writeFile?.({
      rootPath: args.rootPath,
      filePath,
      content: args.planText,
    });
    if (writeResult && writeResult.ok === false) {
      // eslint-disable-next-line no-console
      console.warn("[plans] writeFile failed while persisting plan", {
        filePath,
        stderr: writeResult.stderr,
      });
      return null;
    }
    return filePath;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[plans] IPC threw while persisting plan", {
      filePath,
      error,
    });
    return null;
  }
}

export async function deleteWorkspacePlanFile(args: {
  rootPath: string;
  filePath: string;
}): Promise<boolean> {
  if (!isWorkspacePlanFilePath(args.filePath)) {
    return false;
  }

  const deleteFile = window.api?.fs?.deleteFile;
  if (!deleteFile) {
    return false;
  }

  try {
    const result = await deleteFile({
      rootPath: args.rootPath,
      filePath: args.filePath,
    });
    return result.ok;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[plans] IPC threw while deleting plan", {
      filePath: args.filePath,
      error,
    });
    return false;
  }
}

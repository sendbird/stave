import { normalizePlanText } from "@/lib/plan-text";

export const WORKSPACE_PLANS_DIRECTORY = ".stave/context/plans";
export const LEGACY_WORKSPACE_PLANS_DIRECTORY = ".stave/plans";
export const MAX_WORKSPACE_PLANS = 5;

export interface WorkspacePlanEntry {
  filePath: string;
  label: string;
  timestamp: string;
  taskIdPrefix: string;
}

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

export function parseWorkspacePlanFilePath(filePath: string): WorkspacePlanEntry {
  const fileName = filePath.split("/").pop() ?? filePath;
  const nameWithoutExt = fileName.replace(/\.md$/, "");
  const [taskIdPrefix = "", ...timestampParts] = nameWithoutExt.split("_");
  const timestamp = timestampParts.join("_");
  const label = timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})$/, " $1:$2:$3") || nameWithoutExt;

  return {
    filePath,
    label,
    timestamp,
    taskIdPrefix,
  };
}

export function isWorkspacePlanFilePath(filePath: string) {
  return filePath.endsWith(".md")
    && (
      filePath.startsWith(`${WORKSPACE_PLANS_DIRECTORY}/`)
      || filePath.startsWith(`${LEGACY_WORKSPACE_PLANS_DIRECTORY}/`)
    );
}

export function sortWorkspacePlansNewestFirst<T extends WorkspacePlanEntry>(entries: T[]) {
  return [...entries].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function buildWorkspacePlanListEntries(args: {
  currentFilePaths?: string[];
  legacyFilePaths?: string[];
  maxEntries?: number;
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

  return sortWorkspacePlansNewestFirst([...dedupedEntries.values()]).slice(
    0,
    args.maxEntries ?? MAX_WORKSPACE_PLANS,
  );
}

export const normalizeWorkspacePlanText = normalizePlanText;

export function resolveWorkspacePlanPersistenceText(args: {
  planText?: string | null;
  lastPersistedPlanText?: string | null;
}) {
  const normalizedPlanText = normalizeWorkspacePlanText(args.planText ?? "");
  if (!normalizedPlanText.trim()) {
    return null;
  }
  return normalizedPlanText === (args.lastPersistedPlanText ?? null)
    ? null
    : normalizedPlanText;
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
      createResult
      && createResult.ok === false
      && !(
        "alreadyExists" in createResult
        && createResult.alreadyExists === true
      )
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "[plans] createDirectory failed while persisting plan",
        { filePath, stderr: createResult.stderr },
      );
      return null;
    }
    const writeResult = await window.api?.fs?.writeFile?.({
      rootPath: args.rootPath,
      filePath,
      content: normalizePlanText(args.planText),
    });
    if (writeResult && writeResult.ok === false) {
      // eslint-disable-next-line no-console
      console.warn(
        "[plans] writeFile failed while persisting plan",
        { filePath, stderr: writeResult.stderr },
      );
      return null;
    }
    return filePath;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[plans] IPC threw while persisting plan", { filePath, error });
    return null;
  }
}

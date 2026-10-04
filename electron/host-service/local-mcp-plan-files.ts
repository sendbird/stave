/**
 * `stave_write_plan_file`: writes one markdown plan into the workspace's plan
 * store, `<workspace>/.stave/context/plans/<name>.md`, and nowhere else.
 *
 * It is the one write a read-only turn may make on disk (see
 * `READ_ONLY_STAVE_METADATA_TOOLS`): the plan store is Stave's own record of
 * the work, ignored by git and listed in the Information panel. A provider's
 * read-only sandbox blocks its own file tools, so the write goes through the
 * host, which checks the name and keeps the target inside the workspace.
 *
 * Used by: `electron/host-service.ts` (`write-workspace-plan-file`).
 */
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_PLANS_DIRECTORY } from "../../src/lib/plans";

/** A plain file name: no directories, no leading dot, markdown only. */
const PLAN_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.md$/;
export const PLAN_FILE_MAX_CHARS = 200_000;

export interface WriteWorkspacePlanFileResult {
  workspaceId: string;
  /** Relative to the workspace root, e.g. `.stave/context/plans/<name>.md`. */
  filePath: string;
  bytes: number;
  replaced: boolean;
}

export function isValidPlanFileName(fileName: string): boolean {
  return PLAN_FILE_NAME_PATTERN.test(fileName) && !fileName.includes("..");
}

async function exists(target: string) {
  try {
    return await lstat(target);
  } catch {
    return null;
  }
}

export function createWorkspacePlanFileWriter(deps: {
  resolveWorkspacePath: (workspaceId: string) => Promise<string | null>;
}) {
  return async function writeWorkspacePlanFile(args: {
    workspaceId: string;
    fileName: string;
    content: string;
  }): Promise<WriteWorkspacePlanFileResult> {
    const fileName = args.fileName.trim();
    if (!isValidPlanFileName(fileName)) {
      throw new Error(
        "Plan file name must be a plain markdown file name such as <taskIdPrefix>_<timestamp>.md.",
      );
    }
    if (!args.content.trim()) throw new Error("Plan content is required.");
    if (args.content.length > PLAN_FILE_MAX_CHARS) {
      throw new Error(`Plan content is limited to ${PLAN_FILE_MAX_CHARS} characters.`);
    }
    const workspacePath = await deps.resolveWorkspacePath(args.workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${args.workspaceId}`);

    const root = await realpath(workspacePath);
    const directory = path.join(root, WORKSPACE_PLANS_DIRECTORY);
    await mkdir(directory, { recursive: true });
    // A symlinked plan directory must not carry the write outside the workspace.
    const resolvedDirectory = await realpath(directory);
    if (resolvedDirectory !== directory) {
      throw new Error("The workspace plan directory resolves outside the workspace.");
    }
    const target = path.join(directory, fileName);
    const current = await exists(target);
    if (current && !current.isFile()) {
      throw new Error("A plan file name points at something other than a regular file.");
    }
    await writeFile(target, args.content, "utf8");
    return {
      workspaceId: args.workspaceId,
      filePath: `${WORKSPACE_PLANS_DIRECTORY}/${fileName}`,
      bytes: Buffer.byteLength(args.content, "utf8"),
      replaced: current !== null,
    };
  };
}

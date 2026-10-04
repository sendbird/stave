import type { ScriptVerification } from "../../../src/lib/agent-runs/verification-contract";
import { readWorkspaceRevision, type WorkspaceRevision } from "./workspace-revision";

/** Observe the real runner without inventing an exit status or a source revision. */
export async function observeWorkspaceScript<T>(args: {
  cwd: string;
  run: () => Promise<T>;
  readRevision?: (cwd: string) => Promise<WorkspaceRevision>;
}): Promise<{ result: T; verification: ScriptVerification }> {
  const read = args.readRevision ?? readWorkspaceRevision;
  const sourceRevision = await read(args.cwd);
  const result = await args.run();
  const completedRevision = await read(args.cwd);
  return { result, verification: { sourceRevision, completedRevision } };
}

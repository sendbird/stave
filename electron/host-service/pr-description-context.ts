import { devNull } from "node:os";
import { compactPullRequestDiff } from "../../src/lib/source-control-pr";
import { runCommandArgs } from "../main/utils/command";

const MAX_UNTRACKED_FILES_IN_PR_CONTEXT = 40;
const MAX_UNTRACKED_FILE_DIFF_CHARS = 4_000;

export async function collectUntrackedWorkingTreeDiff(args: { cwd?: string }) {
  const filesResult = await runCommandArgs({
    command: "git",
    commandArgs: ["ls-files", "--others", "--exclude-standard", "-z"],
    cwd: args.cwd,
  });
  if (!filesResult.ok) {
    return "";
  }

  const filePaths = filesResult.stdout.split("\0").filter(Boolean);
  const includedPaths = filePaths.slice(0, MAX_UNTRACKED_FILES_IN_PR_CONTEXT);
  const fileDiffs = await Promise.all(
    includedPaths.map(async (filePath) => {
      const result = await runCommandArgs({
        command: "git",
        commandArgs: ["diff", "--no-index", "--no-ext-diff", "--unified=2", "--", devNull, filePath],
        cwd: args.cwd,
      });
      if (result.code !== 0 && result.code !== 1) {
        return "";
      }
      return compactPullRequestDiff(result.stdout, MAX_UNTRACKED_FILE_DIFF_CHARS);
    }),
  );

  const omittedCount = filePaths.length - includedPaths.length;
  return [
    ...fileDiffs.filter(Boolean),
    ...(omittedCount > 0
      ? [`... [${omittedCount} additional untracked file${omittedCount === 1 ? "" : "s"} omitted from inline diff]`]
      : []),
  ].join("\n");
}

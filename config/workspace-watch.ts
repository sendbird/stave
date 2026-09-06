import path from "node:path";

/** Ignore this checkout's metadata, not source checkouts nested in an ancestor's metadata. */
export function createWorkspaceWatchIgnore(workspaceRoot: string) {
  const metadataRoot = path.resolve(workspaceRoot, ".stave");
  return (candidate: string) => {
    const relative = path.relative(
      metadataRoot,
      path.resolve(workspaceRoot, candidate),
    );
    return (
      relative === "" ||
      (relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative))
    );
  };
}

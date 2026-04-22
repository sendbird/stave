export interface SourceControlDiffPaths {
  displayPath: string;
  headPath: string;
  pathspecs: string[];
  workingTreePath: string;
}

const SCM_RENAME_DELIMITER = " -> ";

export function resolveSourceControlDiffPaths(args: { rawPath: string }): SourceControlDiffPaths {
  const displayPath = args.rawPath.trim();
  const segments = displayPath
    .split(SCM_RENAME_DELIMITER)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const headPath = segments[0] ?? displayPath;
  const workingTreePath = segments.at(-1) ?? displayPath;
  const pathspecs = Array.from(new Set([headPath, workingTreePath].filter(Boolean)));

  return {
    displayPath,
    headPath,
    pathspecs,
    workingTreePath,
  };
}

export function buildSourceControlDiffPreview(args: { stagedPatch?: string; unstagedPatch?: string }) {
  const sections = [
    args.stagedPatch ? `# Staged\n${args.stagedPatch}` : "",
    args.unstagedPatch ? `# Unstaged\n${args.unstagedPatch}` : "",
  ].filter(Boolean);

  return sections.join("\n\n") || "No diff output.";
}

export function parseUnifiedDiffToBuffers(args: { patch: string }) {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let inHunk = false;

  for (const line of args.patch.split("\n")) {
    if (
      line.startsWith("diff --git")
      || line.startsWith("index ")
      || line.startsWith("---")
      || line.startsWith("+++")
      || line.startsWith("new file mode ")
      || line.startsWith("deleted file mode ")
      || line.startsWith("old mode ")
      || line.startsWith("new mode ")
      || line.startsWith("similarity index ")
      || line.startsWith("rename from ")
      || line.startsWith("rename to ")
      || line.startsWith("copy from ")
      || line.startsWith("copy to ")
      || line.startsWith("Binary files ")
      || line.startsWith("GIT binary patch")
      || line === "# Staged"
      || line === "# Unstaged"
      || line === "No diff output."
    ) {
      inHunk = false;
      continue;
    }

    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }

    if (!inHunk || line.startsWith("\\ ")) {
      continue;
    }

    if (line.startsWith("+")) {
      newLines.push(line.slice(1));
      continue;
    }

    if (line.startsWith("-")) {
      oldLines.push(line.slice(1));
      continue;
    }

    const context = line.startsWith(" ") ? line.slice(1) : line;
    oldLines.push(context);
    newLines.push(context);
  }

  return {
    oldContent: oldLines.join("\n"),
    newContent: newLines.join("\n"),
  };
}

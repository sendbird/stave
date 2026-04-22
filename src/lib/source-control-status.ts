export interface SourceControlStatusItem {
  code: string;
  path: string;
  indexStatus?: string;
  workingTreeStatus?: string;
}

export interface SourceControlStatuses {
  indexStatus: string;
  workingTreeStatus: string;
}

export function getSourceControlStatuses(args: {
  item: Pick<SourceControlStatusItem, "code" | "indexStatus" | "workingTreeStatus">;
}): SourceControlStatuses {
  if (args.item.indexStatus?.length === 1 && args.item.workingTreeStatus?.length === 1) {
    return {
      indexStatus: args.item.indexStatus,
      workingTreeStatus: args.item.workingTreeStatus,
    };
  }

  const rawCode = args.item.code ?? "";
  if (rawCode.length >= 2) {
    return {
      indexStatus: rawCode[0] ?? " ",
      workingTreeStatus: rawCode[1] ?? " ",
    };
  }

  const normalizedCode = rawCode.trim();
  if (normalizedCode.length === 1) {
    return {
      indexStatus: " ",
      workingTreeStatus: normalizedCode,
    };
  }

  return {
    indexStatus: " ",
    workingTreeStatus: " ",
  };
}

export function getSourceControlDisplayCode(args: {
  item: Pick<SourceControlStatusItem, "code" | "indexStatus" | "workingTreeStatus">;
}) {
  const { indexStatus, workingTreeStatus } = getSourceControlStatuses({ item: args.item });
  return `${indexStatus}${workingTreeStatus}`.trim() || args.item.code.trim() || "??";
}

export function hasSourceControlStagedChanges(args: {
  item: Pick<SourceControlStatusItem, "code" | "indexStatus" | "workingTreeStatus">;
}) {
  const { indexStatus } = getSourceControlStatuses({ item: args.item });
  return indexStatus !== " " && indexStatus !== "?";
}

export function hasSourceControlUnstagedChanges(args: {
  item: Pick<SourceControlStatusItem, "code" | "indexStatus" | "workingTreeStatus">;
}) {
  const { workingTreeStatus } = getSourceControlStatuses({ item: args.item });
  return workingTreeStatus !== " " && workingTreeStatus !== "?";
}

export function isSourceControlUntracked(args: {
  item: Pick<SourceControlStatusItem, "code" | "indexStatus" | "workingTreeStatus">;
}) {
  const { indexStatus, workingTreeStatus } = getSourceControlStatuses({ item: args.item });
  return indexStatus === "?" && workingTreeStatus === "?";
}

export function hasSourceControlConflicts(args: {
  item: Pick<SourceControlStatusItem, "code" | "indexStatus" | "workingTreeStatus">;
}) {
  const { indexStatus, workingTreeStatus } = getSourceControlStatuses({ item: args.item });
  const pair = `${indexStatus}${workingTreeStatus}`;
  return indexStatus === "U" || workingTreeStatus === "U" || pair === "AA" || pair === "DD";
}

export function parseSourceControlStatusLines(args: { stdout: string }): SourceControlStatusItem[] {
  return args.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const indexStatus = line[0] ?? " ";
      const workingTreeStatus = line[1] ?? " ";
      return {
        code: `${indexStatus}${workingTreeStatus}`.trim() || "??",
        path: line.slice(3).trim(),
        indexStatus,
        workingTreeStatus,
      };
    });
}

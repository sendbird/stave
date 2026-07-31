export interface SourceControlStatusItem {
  code: string;
  /** Exact working-tree path, already unquoted and unescaped. */
  path: string;
  /** Exact original path for renamed or copied entries. */
  oldPath?: string;
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

const NUL = "\0";
const SCM_RENAME_DELIMITER = " -> ";
const STATUS_PATH_OFFSET = 3;

const GIT_PATH_ESCAPES: Record<string, string> = {
  a: "\u0007",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  '"': '"',
  "\\": "\\",
};

function findClosingQuote(args: { value: string }): number {
  for (let index = 1; index < args.value.length; index += 1) {
    const char = args.value[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === '"') {
      return index;
    }
  }
  return -1;
}

/**
 * Reverse `core.quotePath` quoting so a status path is usable as a real
 * filesystem path. Git wraps paths holding spaces, quotes, control characters,
 * or non-ASCII bytes in double quotes and escapes the bytes as C octal escapes.
 */
export function unquoteGitPath(args: { value: string }): string {
  const raw = args.value;
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) {
    return raw;
  }

  const body = raw.slice(1, -1);
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  let plainStart = 0;
  let index = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) {
      for (const byte of encoder.encode(body.slice(plainStart, end))) {
        bytes.push(byte);
      }
    }
  };

  while (index < body.length) {
    if (body[index] !== "\\") {
      index += 1;
      continue;
    }
    flushPlain(index);
    const octal = body.slice(index + 1, index + 4);
    const escape = body[index + 1] ?? "";
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      index += 4;
    } else if (GIT_PATH_ESCAPES[escape]) {
      for (const byte of encoder.encode(GIT_PATH_ESCAPES[escape])) {
        bytes.push(byte);
      }
      index += 2;
    } else {
      // Unrecognised escape: keep the backslash so the path stays lossless.
      bytes.push(0x5c);
      index += 1;
    }
    plainStart = index;
  }
  flushPlain(body.length);

  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function isRenameOrCopyStatus(status: string) {
  return status === "R" || status === "C";
}

function buildStatusItem(args: {
  indexStatus: string;
  workingTreeStatus: string;
  path: string;
  oldPath?: string;
}): SourceControlStatusItem {
  const item: SourceControlStatusItem = {
    code: `${args.indexStatus}${args.workingTreeStatus}`.trim() || "??",
    path: args.path,
    indexStatus: args.indexStatus,
    workingTreeStatus: args.workingTreeStatus,
  };
  if (args.oldPath && args.oldPath !== args.path) {
    item.oldPath = args.oldPath;
  }
  return item;
}

/** Split a quoted-or-plain `<old> -> <new>` display path without cutting inside quotes. */
function splitDisplayPaths(args: { display: string }): string[] {
  const display = args.display;
  if (display.startsWith('"')) {
    const closing = findClosingQuote({ value: display });
    const rest = closing === -1 ? "" : display.slice(closing + 1);
    if (rest.startsWith(SCM_RENAME_DELIMITER)) {
      return [
        display.slice(0, closing + 1),
        rest.slice(SCM_RENAME_DELIMITER.length),
      ];
    }
    if (closing !== -1) {
      return [display];
    }
  }
  const separator = display.indexOf(SCM_RENAME_DELIMITER);
  return separator === -1
    ? [display]
    : [
        display.slice(0, separator),
        display.slice(separator + SCM_RENAME_DELIMITER.length),
      ];
}

/** Parse `git status --porcelain=v1 -z`, where paths are emitted verbatim. */
function parseNulDelimitedStatus(args: {
  stdout: string;
}): SourceControlStatusItem[] {
  const records = args.stdout.split(NUL);
  const items: SourceControlStatusItem[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.length <= STATUS_PATH_OFFSET) {
      continue;
    }
    const indexStatus = record[0] ?? " ";
    const workingTreeStatus = record[1] ?? " ";
    let oldPath: string | undefined;
    if (
      isRenameOrCopyStatus(indexStatus)
      || isRenameOrCopyStatus(workingTreeStatus)
    ) {
      oldPath = records[index + 1];
      index += 1;
    }
    items.push(buildStatusItem({
      indexStatus,
      workingTreeStatus,
      path: record.slice(STATUS_PATH_OFFSET),
      oldPath,
    }));
  }

  return items;
}

/** Parse newline-delimited `git status --porcelain`, undoing display quoting. */
function parseNewlineDelimitedStatus(args: {
  stdout: string;
}): SourceControlStatusItem[] {
  return args.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const indexStatus = line[0] ?? " ";
      const workingTreeStatus = line[1] ?? " ";
      const display = line.slice(STATUS_PATH_OFFSET).trim();
      const segments = splitDisplayPaths({ display });
      const isRename =
        segments.length > 1
        && (isRenameOrCopyStatus(indexStatus)
          || isRenameOrCopyStatus(workingTreeStatus));
      return buildStatusItem({
        indexStatus,
        workingTreeStatus,
        path: unquoteGitPath({
          value: (isRename ? segments.at(-1) : display) ?? display,
        }),
        oldPath: isRename
          ? unquoteGitPath({ value: segments[0] ?? "" })
          : undefined,
      });
    });
}

export function parseSourceControlStatusLines(args: { stdout: string }): SourceControlStatusItem[] {
  return args.stdout.includes(NUL)
    ? parseNulDelimitedStatus({ stdout: args.stdout })
    : parseNewlineDelimitedStatus({ stdout: args.stdout });
}

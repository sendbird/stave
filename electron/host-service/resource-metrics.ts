import { execFile } from "node:child_process";

export type HostServiceChildKind =
  | "provider"
  | "pty"
  | "language-server"
  | "other";

export interface HostServiceChildProcessMetric {
  pid: number;
  parentPid: number;
  rssBytes: number;
  kind: HostServiceChildKind;
}

export interface HostServiceResourceMetrics {
  pid: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  terminalSessions: number;
  ptyPids: number[];
  childProcesses: HostServiceChildProcessMetric[];
}

interface ProcessTableRow {
  pid: number;
  parentPid: number;
  rssBytes: number;
  command: string;
}

/** Parse the portable columns requested from `ps`; malformed rows are ignored. */
export function parseProcessTable(output: string): ProcessTableRow[] {
  const rows: ProcessTableRow[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s*(.*)$/);
    if (!match) {
      continue;
    }
    rows.push({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      rssBytes: Number(match[3]) * 1024,
      command: match[4] ?? "",
    });
  }
  return rows;
}

function isDescendantOf(args: {
  row: ProcessTableRow;
  rootPid: number;
  rowByPid: Map<number, ProcessTableRow>;
}): boolean {
  const visited = new Set<number>();
  let parentPid = args.row.parentPid;
  while (parentPid > 0 && !visited.has(parentPid)) {
    if (parentPid === args.rootPid) {
      return true;
    }
    visited.add(parentPid);
    parentPid = args.rowByPid.get(parentPid)?.parentPid ?? 0;
  }
  return false;
}

function belongsToPty(args: {
  row: ProcessTableRow;
  ptyPids: Set<number>;
  rowByPid: Map<number, ProcessTableRow>;
}): boolean {
  const visited = new Set<number>();
  let pid = args.row.pid;
  while (pid > 0 && !visited.has(pid)) {
    if (args.ptyPids.has(pid)) {
      return true;
    }
    visited.add(pid);
    pid = args.rowByPid.get(pid)?.parentPid ?? 0;
  }
  return false;
}

function belongsToCommandFamily(args: {
  row: ProcessTableRow;
  rowByPid: Map<number, ProcessTableRow>;
  pattern: RegExp;
}): boolean {
  const visited = new Set<number>();
  let row: ProcessTableRow | undefined = args.row;
  while (row && !visited.has(row.pid)) {
    if (args.pattern.test(row.command.toLowerCase())) {
      return true;
    }
    visited.add(row.pid);
    row = args.rowByPid.get(row.parentPid);
  }
  return false;
}

function classifyChildProcess(args: {
  row: ProcessTableRow;
  ptyPids: Set<number>;
  rowByPid: Map<number, ProcessTableRow>;
}): HostServiceChildKind {
  if (belongsToPty(args)) {
    return "pty";
  }
  if (
    belongsToCommandFamily({
      ...args,
      pattern: /\b(claude|codex|kiro-cli|cursor-agent)\b/,
    })
  ) {
    return "provider";
  }
  if (
    belongsToCommandFamily({
      ...args,
      pattern: /\b(tsserver|typescript-language-server|eslint|language-server)\b/,
    })
  ) {
    return "language-server";
  }
  return "other";
}

export function selectDescendantProcessMetrics(args: {
  rows: ProcessTableRow[];
  rootPid: number;
  ptyPids: number[];
  excludedPids?: number[];
}): HostServiceChildProcessMetric[] {
  const rowByPid = new Map(args.rows.map((row) => [row.pid, row]));
  const ptyPids = new Set(args.ptyPids);
  const excludedPids = new Set(args.excludedPids ?? []);
  return args.rows
    .filter(
      (row) =>
        !excludedPids.has(row.pid) &&
        isDescendantOf({ row, rootPid: args.rootPid, rowByPid }),
    )
    .map((row) => ({
      pid: row.pid,
      parentPid: row.parentPid,
      rssBytes: row.rssBytes,
      kind: classifyChildProcess({ row, ptyPids, rowByPid }),
    }));
}

async function readProcessTable(): Promise<{
  rows: ProcessTableRow[];
  collectorPid: number | null;
}> {
  if (process.platform === "win32") {
    return { rows: [], collectorPid: null };
  }
  return new Promise((resolve) => {
    const child = execFile(
      "ps",
      ["-axo", "pid=,ppid=,rss=,command="],
      { maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        resolve({
          rows: error ? [] : parseProcessTable(stdout),
          collectorPid: child.pid ?? null,
        });
      },
    );
    child.on("error", () => {
      resolve({ rows: [], collectorPid: child.pid ?? null });
    });
  });
}

export async function readHostServiceResourceMetrics(args: {
  ptyPids: number[];
}): Promise<HostServiceResourceMetrics> {
  const memory = process.memoryUsage();
  const processTable = await readProcessTable();
  const childProcesses = selectDescendantProcessMetrics({
    rows: processTable.rows,
    rootPid: process.pid,
    ptyPids: args.ptyPids,
    excludedPids:
      processTable.collectorPid === null ? [] : [processTable.collectorPid],
  });
  return {
    pid: process.pid,
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
    },
    terminalSessions: args.ptyPids.length,
    ptyPids: args.ptyPids,
    childProcesses,
  };
}

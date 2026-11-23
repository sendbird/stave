import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import type {
  WorkspaceListeningPort,
  WorkspaceListeningPortsResult,
} from "../../src/lib/workspace-scripts/listening-ports";

type Listener = Omit<WorkspaceListeningPort, "attribution">;
type ProcessParents = ReadonlyMap<number, number>;

function lsofFields(output: string) {
  // -F0 terminates fields with NUL and records with a newline. A cwd or
  // process name can itself contain a newline, so don't split on lines.
  return output.split("\0").map((field) => field.replace(/^\n/, ""));
}

export function parseListeningSockets(output: string): Listener[] {
  let pid = 0;
  let processName = "";
  let socketType = "";
  const listeners: Listener[] = [];

  for (const field of lsofFields(output)) {
    const value = field.slice(1);
    switch (field[0]) {
      case "p":
        pid = /^\d+$/.test(value) ? Number(value) : 0;
        processName = "";
        socketType = "";
        break;
      case "c":
        processName = value;
        break;
      case "f":
        socketType = "";
        break;
      case "t":
        socketType = value;
        break;
      case "n": {
        const separator = value.lastIndexOf(":");
        if (!pid || !processName || separator < 0) break;
        if (socketType !== "IPv4" && socketType !== "IPv6") break;
        const portText = value.slice(separator + 1);
        const port = Number(portText);
        const bind = value.slice(0, separator).replace(/^\[(.*)\]$/, "$1");
        const host = bind === "*" ? (socketType === "IPv6" ? "::" : "0.0.0.0") : bind;
        if (isIP(host) && /^\d+$/.test(portText) && port > 0 && port <= 65535) {
          listeners.push({ pid, processName, host, port });
        }
        break;
      }
    }
  }
  return listeners;
}

function parseProcessCwds(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid = 0;
  let isCwd = false;
  for (const field of lsofFields(output)) {
    if (field.startsWith("p")) {
      pid = Number(field.slice(1));
      isCwd = false;
    } else if (field.startsWith("f")) {
      isCwd = field === "fcwd";
    } else if (pid > 0 && isCwd && field.startsWith("n/")) {
      cwds.set(pid, field.slice(1));
    }
  }
  return cwds;
}

function* lineage(pid: number, parents: ProcessParents) {
  const visited = new Set<number>();
  // Stop before init. Its cwd is shared by otherwise unrelated processes.
  while (pid > 1 && !visited.has(pid)) {
    visited.add(pid);
    yield pid;
    pid = parents.get(pid) ?? 0;
  }
}

function containsPath(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function attributeWorkspacePorts(args: {
  listeners: readonly Listener[];
  parents: ProcessParents;
  cwds: ReadonlyMap<number, string>;
  owners: ReadonlyMap<number, ReadonlySet<string>>;
  workspaceId: string;
  workspacePath: string;
  knownPaths: readonly string[];
}): WorkspaceListeningPort[] {
  const roots = [...new Set([args.workspacePath, ...args.knownPaths])].sort(
    (a, b) => b.length - a.length,
  );
  const ports = new Map<string, WorkspaceListeningPort>();
  for (const listener of args.listeners) {
    const ancestors = [...lineage(listener.pid, args.parents)];
    const owner = ancestors.map((pid) => args.owners.get(pid)).find((ids) => ids?.size);
    let attribution: WorkspaceListeningPort["attribution"];
    if (owner) {
      if (owner.size !== 1 || !owner.has(args.workspaceId)) continue;
      attribution = "owned";
    } else {
      // The closest cwd in any registered workspace wins. For a nested
      // checkout the most specific root wins before considering ancestors.
      const root = ancestors
        .map((pid) => args.cwds.get(pid))
        .filter((cwd) => cwd !== undefined)
        .map((cwd) => roots.find((candidate) => containsPath(candidate, cwd)))
        .find((candidate) => candidate !== undefined);
      if (root !== args.workspacePath) continue;
      attribution = "inferred";
    }

    const { host, pid, port } = listener;
    const loopback = host === "127.0.0.1" || host === "::1";
    const key = `${pid}/${port}/${loopback ? "loopback" : host}`;
    // IPv4 and IPv6 loopback sockets from the same process are one endpoint.
    if (!ports.has(key) || host === "127.0.0.1") {
      ports.set(key, { ...listener, attribution });
    }
  }
  return [...ports.values()].sort((a, b) => a.port - b.port || a.host.localeCompare(b.host) || a.pid - b.pid);
}

const MAX_CWD_PIDS = 2_048;

function probe(command: string, args: string[], allowNoMatch = false): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, args, {
      encoding: "utf8",
      timeout: 1_500,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    }, (error, stdout) => {
      // lsof also exits 1 when a process exits during a multi-PID query.
      resolve(!error || (allowNoMatch && error.code === 1) ? stdout : null);
    });
  });
}

async function scanListeners(platform: NodeJS.Platform) {
  if (platform !== "darwin" && platform !== "linux") return null;
  const lsof = platform === "darwin" ? "/usr/sbin/lsof" : "lsof";
  const [sockets, processTable] = await Promise.all([
    probe(lsof, ["-nP", "-iTCP", "-sTCP:LISTEN", "-F0pcftn"], true),
    probe(platform === "darwin" ? "/bin/ps" : "ps", ["-axo", "pid=,ppid="]),
  ]);
  if (sockets === null || processTable === null) return null;
  const listeners = parseListeningSockets(sockets);
  const parents = new Map<number, number>();
  for (const line of processTable.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (match) parents.set(Number(match[1]), Number(match[2]));
  }

  const pids = new Set<number>();
  for (const listener of listeners) {
    for (const pid of lineage(listener.pid, parents)) {
      pids.add(pid);
      if (pids.size > MAX_CWD_PIDS) return null;
    }
  }
  const cwdFields = pids.size
    ? await probe(lsof, ["-nP", "-a", "-d", "cwd", "-F0pfn", "-p", [...pids].join(",")], true)
    : "";
  if (cwdFields === null) return null;
  return { listeners, parents, cwds: parseProcessCwds(cwdFields) };
}

let inFlight: ReturnType<typeof scanListeners> | undefined;

export async function discoverWorkspaceListeningPorts(args: {
  workspaceId: string;
  workspacePath: string;
  knownPaths: readonly string[];
  readOwners: () => ReadonlyMap<number, ReadonlySet<string>>;
}): Promise<WorkspaceListeningPortsResult> {
  // Separate windows can ask for different workspaces while sharing one OS scan.
  inFlight ??= scanListeners(process.platform).finally(() => { inFlight = undefined; });
  const [scan, workspacePath, knownPaths] = await Promise.all([
    inFlight,
    realpath(args.workspacePath).catch(() => null),
    Promise.all([...new Set(args.knownPaths)].map((root) => realpath(root).catch(() => null))),
  ]);
  if (!scan || !workspacePath) return { status: "unavailable" };
  return {
    status: "available",
    ports: attributeWorkspacePorts({
      ...scan,
      workspaceId: args.workspaceId,
      workspacePath,
      knownPaths: knownPaths.filter((root) => root !== null),
      owners: args.readOwners(),
    }),
  };
}

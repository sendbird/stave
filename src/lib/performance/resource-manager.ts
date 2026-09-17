export interface ResourceProcess {
  pid: number;
  label: string;
  rssBytes: number;
  cpu: number | null;
  owners?: Array<{
    workspaceId: string;
    taskId?: string;
    taskTitle?: string;
    active: boolean;
  }>;
}

export function formatResourceBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Host metrics can overlap Electron's process list; count each PID once. */
export function uniqueResourceProcesses(
  processes: readonly ResourceProcess[],
): ResourceProcess[] {
  return [
    ...new Map(processes.map((process) => [process.pid, process])).values(),
  ];
}

export function resourcePageLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return (
      `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}` ||
      parsed.protocol
    );
  } catch {
    return "Lens page";
  }
}

/** Current workspace, or any workspace with attributed RSS or a Lens page. */
export function shouldShowResourceWorkspace(args: {
  workspaceId: string;
  activeWorkspaceId?: string;
  processes: readonly ResourceProcess[];
  lensWorkspaceIds: readonly string[];
}): boolean {
  if (args.workspaceId === args.activeWorkspaceId) return true;
  if (args.lensWorkspaceIds.includes(args.workspaceId)) return true;
  return args.processes.some(
    (process) =>
      process.rssBytes > 0 &&
      process.owners?.some((owner) => owner.workspaceId === args.workspaceId),
  );
}

export interface FootprintProcess {
  pid: number;
  role: string;
  memory: { workingSetSizeKB: number };
}

/**
 * Whole-app memory footprint in KB.
 *
 * Working-set (RSS) counts pages the allocator has already released but the
 * kernel has not reclaimed, so after a burst it reads far above what the app
 * actually costs. Where a private footprint is available — main and the host
 * renderer report one — it is substituted for that process's working set.
 */
export function appFootprintKB(args: {
  processes: readonly FootprintProcess[];
  /** Host service and its descendants, which Electron's list does not cover. */
  hostProcesses?: readonly { pid: number; rssBytes: number }[];
  mainPrivateBytes: number | null;
  hostRendererPrivateBytes: number | null;
}): number {
  const electron = args.processes.reduce((sum, process) => {
    if (process.role === "main" && args.mainPrivateBytes !== null) {
      return sum + args.mainPrivateBytes / 1024;
    }
    if (
      process.role === "host-renderer" &&
      args.hostRendererPrivateBytes !== null
    ) {
      return sum + args.hostRendererPrivateBytes / 1024;
    }
    return sum + process.memory.workingSetSizeKB;
  }, 0);
  const counted = new Set(args.processes.map((process) => process.pid));
  return (args.hostProcesses ?? []).reduce((sum, process) => {
    if (counted.has(process.pid)) return sum;
    counted.add(process.pid);
    return sum + process.rssBytes / 1024;
  }, electron);
}

/** Host service tree as pid/RSS pairs, deduped, for footprint and counts. */
export function hostServiceProcesses(
  hostService: {
    pid: number;
    memory: { rss: number };
    childProcesses: ReadonlyArray<{ pid: number; rssBytes: number }>;
  } | null,
): Array<{ pid: number; rssBytes: number }> {
  if (!hostService) return [];
  const byPid = new Map<number, number>([
    [hostService.pid, hostService.memory.rss],
  ]);
  for (const child of hostService.childProcesses) {
    if (!byPid.has(child.pid)) byPid.set(child.pid, child.rssBytes);
  }
  return [...byPid].map(([pid, rssBytes]) => ({ pid, rssBytes }));
}

/** Whole-app RSS uses the same PID set as the footprint. */
export function appWorkingSetKB(args: {
  processes: readonly FootprintProcess[];
  hostProcesses?: readonly { pid: number; rssBytes: number }[];
}): number {
  return appFootprintKB({
    ...args,
    mainPrivateBytes: null,
    hostRendererPrivateBytes: null,
  });
}

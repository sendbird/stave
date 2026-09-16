export interface ResourceProcess {
  pid: number;
  label: string;
  rssBytes: number;
  cpu: number | null;
  owners?: Array<{ workspaceId: string; taskId?: string; taskTitle?: string; active: boolean }>;
}

export function formatResourceBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Host metrics can overlap Electron's process list; count each PID once. */
export function uniqueResourceProcesses(processes: readonly ResourceProcess[]): ResourceProcess[] {
  return [...new Map(processes.map((process) => [process.pid, process])).values()];
}

export function resourcePageLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}` || parsed.protocol;
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

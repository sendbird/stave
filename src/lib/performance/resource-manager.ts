export interface ResourceProcess {
  pid: number;
  label: string;
  rssBytes: number;
  cpu: number | null;
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

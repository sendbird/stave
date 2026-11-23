export interface WorkspaceListeningPort {
  pid: number;
  processName: string;
  host: string;
  port: number;
  attribution: "owned" | "inferred";
}

export type WorkspaceListeningPortsResult =
  | { status: "available"; ports: WorkspaceListeningPort[] }
  | { status: "unavailable" };

export function formatListeningAddress(host: string, port: number): string {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

export function listeningPortUrl({ host, port }: WorkspaceListeningPort): string | null {
  const address = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  const url = `http://${formatListeningAddress(address, port)}`;
  // Chromium URLs cannot represent an IPv6 zone identifier.
  return URL.canParse(url) ? url : null;
}

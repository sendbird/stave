import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";

export const CONNECTED_TOOL_IDS = [
  "slack",
  "atlassian",
  "figma",
  "github",
] as const;

export type ConnectedToolId = (typeof CONNECTED_TOOL_IDS)[number];

export type ConnectedToolState =
  | "ready"
  | "needs-auth"
  | "disabled"
  | "error"
  | "unsupported"
  | "unknown";

export interface ConnectedToolStatusEntry {
  id: ConnectedToolId;
  label: string;
  state: ConnectedToolState;
  available: boolean;
  detail: string;
}

export interface ConnectedToolStatusRequest {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
  toolIds?: ConnectedToolId[];
}

export interface ConnectedToolStatusResponse {
  ok: boolean;
  providerId: ProviderId;
  detail: string;
  tools: ConnectedToolStatusEntry[];
}

export function getConnectedToolLabel(toolId: ConnectedToolId) {
  switch (toolId) {
    case "slack":
      return "Slack";
    case "atlassian":
      return "Atlassian (Jira/Confluence)";
    case "figma":
      return "Figma";
    case "github":
      return "GitHub";
  }
}

export function normalizeConnectedToolIds(toolIds?: readonly ConnectedToolId[]) {
  if (!toolIds || toolIds.length === 0) {
    return [...CONNECTED_TOOL_IDS];
  }

  return toolIds.filter((toolId, index, entries) => entries.indexOf(toolId) === index);
}

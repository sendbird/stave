import type { ProviderId } from "@/lib/providers/provider.types";
import type { ConnectedToolId, ConnectedToolStatusEntry } from "@/lib/providers/connected-tool-status";

const CONNECTED_TOOL_PATTERNS: Record<ConnectedToolId, readonly RegExp[]> = {
  slack: [
    /\bslack\b/i,
    /slack\.com/i,
  ],
  atlassian: [
    /\bjira\b/i,
    /\bconfluence\b/i,
    /\batlassian\b/i,
    /atlassian\.net/i,
  ],
  figma: [
    /\bfigma\b/i,
    /figma\.com/i,
  ],
  github: [
    /\bgithub\b/i,
    /github\.com/i,
    /\bpull request\b/i,
  ],
};

function getProviderLabel(providerId: ProviderId) {
  switch (providerId) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "stave":
    default:
      return "Stave Auto";
  }
}

function summarizeToolFailure(entry: ConnectedToolStatusEntry) {
  if (entry.detail.trim()) {
    return `${entry.label}: ${entry.detail.trim()}`;
  }

  switch (entry.state) {
    case "needs-auth":
      return `${entry.label}: authentication is required.`;
    case "disabled":
      return `${entry.label}: the integration is disabled.`;
    case "unsupported":
      return `${entry.label}: this provider cannot preflight that integration.`;
    case "error":
      return `${entry.label}: the integration health check failed.`;
    default:
      return `${entry.label}: unavailable.`;
  }
}

export function resolveRequestedStaveMuseConnectedTools(args: {
  input: string;
}): ConnectedToolId[] {
  const input = args.input.trim();
  if (!input) {
    return [];
  }

  return (Object.keys(CONNECTED_TOOL_PATTERNS) as ConnectedToolId[])
    .filter((toolId) => CONNECTED_TOOL_PATTERNS[toolId].some((pattern) => pattern.test(input)));
}

export function buildStaveMuseProviderUnavailableMessage(args: {
  providerId: ProviderId;
  detail: string;
}) {
  const providerLabel = getProviderLabel(args.providerId);
  const detail = args.detail.trim();
  return detail
    ? `${providerLabel} is unavailable for this Muse turn.\n${detail}`
    : `${providerLabel} is unavailable for this Muse turn.`;
}

export function buildStaveMuseConnectedToolPreflightMessage(args: {
  providerId: ProviderId;
  blockingTools: ConnectedToolStatusEntry[];
}) {
  const providerLabel = getProviderLabel(args.providerId);
  const lines = args.blockingTools.map((entry) => `- ${summarizeToolFailure(entry)}`);
  const actionHint = args.providerId === "stave"
    ? "Switch Muse to Claude Code or Codex for connected-tool workflows."
    : "Reconnect or enable the integration, then retry.";

  return [
    `${providerLabel} can't start this Muse connected-tool workflow yet.`,
    ...lines,
    actionHint,
  ].join("\n");
}

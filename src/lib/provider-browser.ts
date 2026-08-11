import type { NormalizedProviderEvent, ProviderId } from "./providers/provider.types";

export type ProviderBrowserConnectionStatus =
  | "connecting"
  | "connected"
  | "failed";

export interface WorkspaceConnectedBrowserTab {
  providerId: ProviderId;
  status: ProviderBrowserConnectionStatus;
  requestedAt: string;
  lastUpdatedAt: string;
}

export type ProviderBrowserConnectionEvent = Extract<
  NormalizedProviderEvent,
  { type: "browser_connection" }
>;

const WEB_REFERENCE_PATTERN =
  /(^|[^A-Za-z0-9_@-])@web(?![A-Za-z0-9_-])/i;
const CLAUDE_CHROME_TOOL_PREFIX = "mcp__claude-in-chrome__";
const CODEX_BROWSER_SELECTION_PATTERN =
  /\b(?:globalThis\.)?(?:agent\.)?browsers\.(?:get|getDefault|getForUrl)\s*\(/;

export function promptRequestsProviderBrowser(prompt: string) {
  return WEB_REFERENCE_PATTERN.test(prompt);
}

export function shouldActivateProviderBrowser(args: {
  prompt: string;
  secondaryReadOnly: boolean;
  unattendedAutomation: boolean;
  planMode: boolean;
}) {
  return (
    !args.secondaryReadOnly &&
    !args.unattendedAutomation &&
    !args.planMode &&
    promptRequestsProviderBrowser(args.prompt)
  );
}

export function isClaudeChromeToolName(toolName: string) {
  return toolName.trim().toLowerCase().startsWith(CLAUDE_CHROME_TOOL_PREFIX);
}

export function isCodexBrowserSelectionTool(args: {
  server?: string;
  tool?: string;
  input: string;
}) {
  const server = args.server?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const tool = args.tool?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    server === "noderepl" &&
    tool === "js" &&
    CODEX_BROWSER_SELECTION_PATTERN.test(args.input)
  );
}

export function createProviderBrowserConnectionTracker(args: {
  providerId: ProviderId;
  requested: boolean;
  available?: boolean;
}) {
  let status: ProviderBrowserConnectionStatus | null = args.requested
    ? args.available === false
      ? "failed"
      : "connecting"
    : null;
  const setStatus = (
    nextStatus: ProviderBrowserConnectionStatus,
  ): ProviderBrowserConnectionEvent => {
    status = nextStatus;
    return {
      type: "browser_connection",
      providerId: args.providerId,
      status: nextStatus,
      at: Date.now(),
    };
  };

  return {
    emitInitial(emit: (event: ProviderBrowserConnectionEvent) => void) {
      if (status) {
        emit(setStatus(status));
      }
    },
    settle(emit: (event: ProviderBrowserConnectionEvent) => void) {
      if (status === "connecting") {
        emit(setStatus("failed"));
      }
    },
    observeCodexMcpCall(call: {
      server?: string;
      tool?: string;
      input: string;
      failed: boolean;
    }) {
      if (
        !args.requested ||
        !isCodexBrowserSelectionTool({
          server: call.server,
          tool: call.tool,
          input: call.input,
        })
      ) {
        return null;
      }
      return setStatus(call.failed ? "failed" : "connected");
    },
  };
}

export function applyProviderBrowserConnectionEvents(args: {
  current?: WorkspaceConnectedBrowserTab | null;
  events: NormalizedProviderEvent[];
}): WorkspaceConnectedBrowserTab | null | undefined {
  let current = args.current;
  for (const event of args.events) {
    if (event.type !== "browser_connection") {
      continue;
    }
    const at = new Date(event.at).toISOString();
    const sameProvider = current?.providerId === event.providerId;
    current = {
      providerId: event.providerId,
      status: event.status,
      requestedAt: sameProvider && current ? current.requestedAt : at,
      lastUpdatedAt: at,
    };
  }
  return current;
}

import type {
  ManagedExecutionProviderId,
  NormalizedProviderEvent,
  ProviderId,
} from "./providers/provider.types";

export type ProviderBrowserConnectionStatus =
  | "connecting"
  | "connected"
  | "failed";

export interface WorkspaceConnectedBrowserTab {
  providerId: ManagedExecutionProviderId;
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

/**
 * Hosts whose pages are useless to a token-less fetch: the HTML that comes back
 * is an app shell or a bot check, never the content the prompt is about. The
 * page body lives behind the signed-in session that only the user's own browser
 * holds, so `@web` is the sole path to it.
 *
 * Kept deliberately short. Every entry here is a host that Stave will arm the
 * provider browser for without the user typing `@web`, which is a real
 * escalation of what a prompt can do — see `shouldActivateProviderBrowser`.
 */
export const PROVIDER_BROWSER_AUTO_ARM_DEFAULT_DOMAINS = [
  "claude.ai",
  "claudeusercontent.com",
] as const;

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]}]+/gi;

/**
 * Parses the user's extra auto-arm domain list. Accepts whitespace- or
 * comma-separated entries and tolerates the shapes people actually paste:
 * `https://wiki.corp.example/`, `*.corp.example`, `wiki.corp.example`.
 *
 * A bare `*` (or any entry still holding one after the leading `*.` is
 * stripped) is dropped rather than expanded — a wildcard that matched every
 * host would silently arm the browser on every prompt containing a URL.
 */
export function parseProviderBrowserDomains(
  raw: string | null | undefined,
): string[] {
  if (!raw) {
    return [];
  }
  const parsed = raw
    .split(/[\s,]+/)
    .map((entry) =>
      entry
        .trim()
        .toLowerCase()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
        .replace(/^\*\./, "")
        .replace(/[/?#].*$/, "")
        .replace(/:\d+$/, "")
        .replace(/\.$/, ""),
    )
    .filter((entry) => entry.length > 0 && !entry.includes("*"));
  return Array.from(new Set(parsed));
}

function hostMatchesDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Extracts the hostnames of every absolute http(s) URL mentioned in a prompt. */
export function extractPromptUrlHosts(prompt: string): string[] {
  const matches = prompt.match(URL_PATTERN);
  if (!matches) {
    return [];
  }
  const hosts: string[] = [];
  for (const match of matches) {
    // Trailing punctuation is far more often sentence grammar than part of the
    // URL, and a stray `.` or `,` makes `new URL` keep it inside the host.
    const cleaned = match.replace(/[.,;:!?]+$/, "");
    try {
      const host = new URL(cleaned).hostname.toLowerCase().replace(/\.$/, "");
      if (host) {
        hosts.push(host);
      }
    } catch {
      continue;
    }
  }
  return hosts;
}

export function promptTargetsProviderBrowserDomain(args: {
  prompt: string;
  domains: readonly string[];
}) {
  if (args.domains.length === 0) {
    return false;
  }
  const hosts = extractPromptUrlHosts(args.prompt);
  return hosts.some((host) =>
    args.domains.some((domain) => hostMatchesDomain(host, domain)),
  );
}

export function promptRequestsProviderBrowser(prompt: string) {
  return WEB_REFERENCE_PATTERN.test(prompt);
}

/**
 * Decides whether this turn starts with the provider's native browser attached.
 *
 * Explicit `@web` is still the primary path. `autoFallbackEnabled` is the
 * opt-in setting that additionally arms the browser when the prompt points at a
 * host known to be unreadable without a signed-in session, so the turn does not
 * have to fail once before the user can get an answer. The three hard blocks
 * come first and are never overridden: unattended, plan-mode, and secondary
 * read-only runs have no user present to answer the extension's site-access
 * prompt.
 */
export function shouldActivateProviderBrowser(args: {
  prompt: string;
  secondaryReadOnly: boolean;
  unattendedAutomation: boolean;
  planMode: boolean;
  autoFallbackEnabled?: boolean;
  autoFallbackDomains?: readonly string[];
}) {
  if (args.secondaryReadOnly || args.unattendedAutomation || args.planMode) {
    return false;
  }
  if (promptRequestsProviderBrowser(args.prompt)) {
    return true;
  }
  if (!args.autoFallbackEnabled) {
    return false;
  }
  return promptTargetsProviderBrowserDomain({
    prompt: args.prompt,
    domains: [
      ...PROVIDER_BROWSER_AUTO_ARM_DEFAULT_DOMAINS,
      ...(args.autoFallbackDomains ?? []),
    ],
  });
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
  providerId: ManagedExecutionProviderId;
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

/**
 * Tool names that fetch a URL over plain HTTP with no browser session behind
 * them. These are the calls whose failures the auto-fallback watches.
 */
const PLAIN_WEB_FETCH_TOOL_NAMES = new Set(["webfetch", "web_fetch", "fetch"]);

export function isPlainWebFetchToolName(toolName: string) {
  return PLAIN_WEB_FETCH_TOOL_NAMES.has(
    toolName.trim().toLowerCase().replace(/[\s-]+/g, "_"),
  );
}

/**
 * Signals that a fetch was refused for *who you are*, not for what you asked —
 * an auth wall or a bot check that a signed-in browser would clear. These are
 * unambiguous wherever they appear in the body.
 *
 * Deliberately conservative: every pattern here can trigger an extra provider
 * turn, so a generic "Forbidden" or a bare 404 is not enough. A page that
 * merely renders empty without JavaScript (a client-rendered app shell) is not
 * detectable from the response text at all and is intentionally not guessed at
 * — that case is what the domain auto-arm list exists to cover up front.
 */
const AUTH_WALL_HARD_PATTERNS: readonly RegExp[] = [
  /\bstatus(?:\s*code)?\D{0,4}\b40[13]\b/i,
  /\b40[13]\s+(?:Forbidden|Unauthorized)\b/i,
  /\bJust a moment\b[\s\S]{0,200}?\b(?:cf-|cloudflare|Enable JavaScript and cookies)/i,
  /Attention Required!\s*\|\s*Cloudflare/i,
  /\bcf-mitigated\b/i,
  /\bEnable JavaScript and cookies to continue\b/i,
];

/**
 * Prose that means "you are not signed in" on a stub page, and means nothing on
 * a page that merely documents signing in. Only trusted for a short body: a
 * real wall returns a near-empty interstitial, while an article that discusses
 * login is long. Without this length rule, fetching an auth API's own docs
 * would spend a turn retrying a page that was never blocked.
 */
const AUTH_WALL_SOFT_PATTERNS: readonly RegExp[] = [
  /\b(?:sign|log)\s?in to (?:continue|view|access|read)\b/i,
  /\byou (?:need to|must) (?:log|sign)\s?in\b/i,
  /\b(?:authentication|authorization|login) (?:is )?required\b/i,
];

const AUTH_WALL_SOFT_MAX_LENGTH = 2000;

export function isProviderBrowserAuthWallOutput(output: string) {
  if (!output.trim()) {
    return false;
  }
  if (AUTH_WALL_HARD_PATTERNS.some((pattern) => pattern.test(output))) {
    return true;
  }
  return (
    output.length <= AUTH_WALL_SOFT_MAX_LENGTH &&
    AUTH_WALL_SOFT_PATTERNS.some((pattern) => pattern.test(output))
  );
}

export function resolveWebFetchToolUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const url = (parsed as { url?: unknown }).url;
      if (typeof url === "string" && url.trim()) {
        return url.trim();
      }
    }
  } catch {
    // Not JSON — fall through to a plain scan.
  }
  const match = trimmed.match(URL_PATTERN);
  return match?.[0] ?? null;
}

/**
 * The prompt Stave sends to retry a turn with the provider browser attached.
 *
 * It must contain `@web`, because that token is the single source of truth for
 * `shouldActivateProviderBrowser` — and that is also what stops the retry from
 * looping: a turn whose own prompt already asked for the browser never
 * qualifies for another automatic fallback.
 */
export function buildProviderBrowserFallbackPrompt(args: {
  urls: readonly string[];
}) {
  const unique = Array.from(
    new Set(args.urls.map((url) => url.trim()).filter(Boolean)),
  ).slice(0, 5);
  const target =
    unique.length > 0
      ? `\n\nBlocked while fetching:\n${unique.map((url) => `- ${url}`).join("\n")}`
      : "";
  return (
    "@web The previous turn's plain web fetch was blocked by a login wall or a " +
    "bot check, so the page body never arrived. Retry that read through the " +
    "provider-native browser using the already signed-in session, then continue " +
    "the work the previous turn was doing. If the browser cannot reach it " +
    "either, say so plainly and stop — do not fall back to plain fetching again." +
    target
  );
}

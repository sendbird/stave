import type {
  NormalizedProviderEvent,
  ProviderRuntimeOptions,
} from "../lib/providers/provider.types";
import type { AppSettings } from "./app-settings";
import type { WorkspaceSessionState } from "./workspace-session-state";
import {
  buildProviderBrowserFallbackPrompt,
  isPlainWebFetchToolName,
  isProviderBrowserAuthWallOutput,
  promptRequestsProviderBrowser,
  resolveWebFetchToolUrl,
} from "../lib/provider-browser";

/**
 * Watches a turn's event stream for a plain web fetch that came back as a login
 * wall or a bot check.
 *
 * It has to be a tracker rather than a pure scan of the final batch because a
 * turn's events reach the store in rAF-throttled batches: the blocked fetch is
 * usually flushed long before the `done` that ends the turn, so by the time the
 * completion branch runs, the evidence is several batches in the past. One
 * tracker per turn accumulates across every flush.
 *
 * Correlating the URL costs a map because the two halves arrive apart — the
 * `tool` event carries the input (and therefore the URL) while the `tool_result`
 * carries the body that reveals the wall. Providers that deliver both on the
 * `tool` event itself are handled too, so this works for Codex as well as Claude.
 */
export function createWebFetchAuthWallTracker(context: {
  /** The completed turn's own prompt — the loop breaker reads it. */
  prompt: string;
  turnOrigin: "conversation" | "utility";
  runtimeOptions: ProviderRuntimeOptions;
}) {
  const urlByToolUseId = new Map<string, string | null>();
  const blockedUrls = new Set<string>();
  let detected = false;

  const record = (url: string | null | undefined) => {
    detected = true;
    if (url) {
      blockedUrls.add(url);
    }
  };

  return {
    observe(events: readonly NormalizedProviderEvent[]) {
      for (const event of events) {
        if (event.type === "tool") {
          if (!isPlainWebFetchToolName(event.toolName)) {
            continue;
          }
          const url = resolveWebFetchToolUrl(event.input);
          if (event.toolUseId) {
            // A tool event can repeat as its state advances; the later one has
            // the fuller input, so overwrite rather than keeping the first.
            urlByToolUseId.set(event.toolUseId, url);
          }
          if (event.output && isProviderBrowserAuthWallOutput(event.output)) {
            record(url);
          }
          continue;
        }
        if (event.type === "tool_result") {
          if (!urlByToolUseId.has(event.tool_use_id)) {
            continue;
          }
          if (!isProviderBrowserAuthWallOutput(event.output)) {
            continue;
          }
          record(urlByToolUseId.get(event.tool_use_id));
        }
      }
    },
    get detected() {
      return detected;
    },
    blockedUrls() {
      return Array.from(blockedUrls);
    },
    context,
  };
}

export type WebFetchAuthWallTracker = ReturnType<
  typeof createWebFetchAuthWallTracker
>;

/**
 * Guards the one automatic `@web` retry Stave will spend on a blocked fetch.
 *
 * The loop breaker is deliberately not a counter: the retry prompt itself
 * contains `@web`, so `originalPromptRequestedBrowser` is true on the retry's
 * own completion and a second fallback can never be queued. That also covers
 * the case worth refusing anyway — if the browser was already attached and the
 * fetch still hit a wall, attaching it again changes nothing.
 */
export function shouldStartProviderBrowserFallbackTurn(args: {
  detected: boolean;
  autoFallbackEnabled: boolean;
  /** True when the completed turn's prompt already asked for the browser. */
  originalPromptRequestedBrowser: boolean;
  /** Only the task's own dialogue retries; compare arms and kickoffs do not. */
  conversationTurn: boolean;
  planMode: boolean;
  turnAborted: boolean;
  /** The user's own queued follow-up always wins over a synthesized one. */
  hasQueuedUserTurn: boolean;
}) {
  return (
    args.detected &&
    args.autoFallbackEnabled &&
    args.conversationTurn &&
    !args.originalPromptRequestedBrowser &&
    !args.planMode &&
    !args.turnAborted &&
    !args.hasQueuedUserTurn
  );
}

interface ProviderBrowserFallbackStoreSnapshot {
  settings: Pick<AppSettings, "providerBrowserAutoFallback">;
  sendUserMessage: (args: {
    taskId: string;
    content: string;
    turnOrigin: "conversation" | "utility";
    preservePromptDraft?: boolean;
  }) => Promise<unknown>;
}

/**
 * Turn-completion entry point: decides on the one automatic `@web` retry and
 * sends it. Lives here rather than in the store so `app.store.ts` carries only
 * the call, per the repo's line-count ratchet on that file.
 */
export function maybeStartProviderBrowserFallbackTurn<
  TState extends ProviderBrowserFallbackStoreSnapshot,
>(
  getState: () => TState,
  args: {
    taskId: string;
    events: readonly NormalizedProviderEvent[];
    tracker: WebFetchAuthWallTracker;
    session: WorkspaceSessionState | null | undefined;
  },
) {
  const { context } = args.tracker;
  const state = getState();
  const start = shouldStartProviderBrowserFallbackTurn({
    detected: args.tracker.detected,
    autoFallbackEnabled: state.settings.providerBrowserAutoFallback,
    originalPromptRequestedBrowser: promptRequestsProviderBrowser(
      context.prompt,
    ),
    conversationTurn: context.turnOrigin === "conversation",
    planMode:
      context.runtimeOptions.claudePermissionMode === "plan" ||
      context.runtimeOptions.codexPlanMode === true,
    turnAborted: args.events.some(
      (event) => event.type === "done" && event.stop_reason === "aborted",
    ),
    hasQueuedUserTurn:
      (args.session?.promptDraftByTask[args.taskId]?.queuedTurns ?? []).length >
      0,
  });
  if (!start) {
    return;
  }
  // "utility": Stave authored this, not the user, so it must not re-run the
  // task's armed Advisor — see the turnOrigin contract in app-store.types.ts.
  void state.sendUserMessage({
    taskId: args.taskId,
    content: buildProviderBrowserFallbackPrompt({
      urls: args.tracker.blockedUrls(),
    }),
    turnOrigin: "utility",
    preservePromptDraft: true,
  });
}

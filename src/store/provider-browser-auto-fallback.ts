import type {
  NormalizedProviderEvent,
  ProviderRuntimeOptions,
  ProviderId,
} from "../lib/providers/provider.types";
import type { AppSettings } from "./app-settings";
import type { WorkspaceSessionState } from "./workspace-session-state";
import type { PromptDraftRuntimeOverrides } from "../types/chat";
import {
  buildProviderBrowserFallbackPrompt,
  isPlainWebFetchToolName,
  isProviderBrowserAuthWallOutput,
  parseProviderBrowserDomains,
  shouldActivateProviderBrowser,
  resolveWebFetchToolUrl,
} from "../lib/provider-browser";
import {
  isLensBrowserToolName,
  isProviderBrowserFallbackLensTool,
  isLensProviderBrowserFallbackOutput,
  isLensFallbackControlBlock,
  parseLensFallbackOutput,
  lensFallbackOutputUrl,
} from "../lib/provider-browser-lens-fallback";

interface BrowserFallbackCall {
  lens: boolean;
  read: boolean;
  toolName: string;
  url: string | null;
  sessionKey: string;
}

/** Accumulates blocked page reads across the turn's throttled event batches. */
export function createProviderBrowserFallbackTracker(context: {
  /** The completed turn's own prompt — the loop breaker reads it. */
  prompt: string;
  providerId: ProviderId;
  turnOrigin: "conversation" | "utility";
  runtimeOptions: ProviderRuntimeOptions;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
}) {
  const calls = new Map<string, BrowserFallbackCall>();
  const lensUrls = new Map<string, string>();
  const blockedUrls = new Set<string>();
  let detected = false;
  let controlBlocked = false;
  let fallbackStarted = false;
  const blockedLensUrls = new Map<string, string | null>();

  const record = (url: string | null | undefined) => {
    detected = true;
    if (url) {
      blockedUrls.add(url);
    }
  };

  return {
    observe(events: readonly NormalizedProviderEvent[]) {
      const observeResult = (call: BrowserFallbackCall, output: string, isError: boolean) => {
        if (!call.lens) {
          if (isProviderBrowserAuthWallOutput(output)) record(call.url);
          return;
        }
        if (isLensFallbackControlBlock(output)) {
          controlBlocked = true;
          return;
        }
        if (!call.read) return;
        const result = parseLensFallbackOutput(output);
        const outputUrl = lensFallbackOutputUrl(result);
        const url = call.url ?? lensUrls.get(call.sessionKey) ?? outputUrl;
        if (url) lensUrls.set(call.sessionKey, url);
        if (isLensProviderBrowserFallbackOutput({ output, isError })) {
          blockedLensUrls.set(call.sessionKey, url);
        } else if (
          !isError && result.ok === true &&
          call.toolName.endsWith("stave_lens_snapshot") &&
          typeof result.snapshot === "string" && result.snapshot.trim()
        ) {
          // A readable snapshot after sign-in proves this session recovered.
          blockedLensUrls.delete(call.sessionKey);
        }
      };
      for (const event of events) {
        if (event.type === "tool") {
          // A child agent's tool result must not restart the parent's turn.
          if (event.ownerAgentId || event.parentToolUseId) continue;
          const lens = isLensBrowserToolName(event.toolName);
          const read = isProviderBrowserFallbackLensTool(event.toolName);
          if (!lens && !isPlainWebFetchToolName(event.toolName)) continue;
          const input = lens ? parseLensFallbackOutput(event.input) : {};
          const sessionKey = JSON.stringify([input.workspaceId, input.lensSessionId]);
          const url = lens ? lensFallbackOutputUrl(input) : resolveWebFetchToolUrl(event.input);
          const call = {
            lens, read, toolName: event.toolName, sessionKey,
            url: url ?? (lens ? lensUrls.get(sessionKey) ?? null : null),
          };
          if (lens && url) lensUrls.set(sessionKey, url);
          if (event.toolUseId) calls.set(event.toolUseId, call);
          if (event.output) observeResult(call, event.output, event.state === "output-error");
        } else if (event.type === "tool_result" && !event.isPartial) {
          const call = calls.get(event.tool_use_id);
          if (call) observeResult(call, event.output, event.isError === true);
        }
      }
    },
    get detected() {
      return (detected || blockedLensUrls.size > 0) && !controlBlocked;
    },
    get lensBlocked() {
      return blockedLensUrls.size > 0;
    },
    claimFallback() {
      if (fallbackStarted) return false;
      fallbackStarted = true;
      return true;
    },
    blockedUrls() {
      return Array.from(new Set(
        [...blockedUrls, ...blockedLensUrls.values()]
          .filter((url): url is string => Boolean(url)),
      ));
    },
    context,
  };
}

export type ProviderBrowserFallbackTracker = ReturnType<
  typeof createProviderBrowserFallbackTracker
>;

/**
 * Guards the one automatic `@web` retry Stave will spend on blocked page access.
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
  turnAborted: boolean;
  /** The user's own queued follow-up always wins over a synthesized one. */
  hasQueuedUserTurn: boolean;
}) {
  return (
    args.detected &&
    args.autoFallbackEnabled &&
    args.conversationTurn &&
    !args.originalPromptRequestedBrowser &&
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
    runtimeOverrides?: PromptDraftRuntimeOverrides;
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
    tracker: ProviderBrowserFallbackTracker;
    session: WorkspaceSessionState | null | undefined;
  },
) {
  const { context } = args.tracker;
  const state = getState();
  const start = shouldStartProviderBrowserFallbackTurn({
    detected: args.tracker.detected,
    autoFallbackEnabled: state.settings.providerBrowserAutoFallback,
    originalPromptRequestedBrowser: shouldActivateProviderBrowser({
      prompt: context.prompt,
      secondaryReadOnly: false,
      unattendedAutomation: false,
      alwaysEnabled: context.runtimeOptions.providerBrowserAlwaysOn,
      autoFallbackEnabled: context.runtimeOptions.providerBrowserAutoFallback,
      autoArmEnabled: context.runtimeOptions.providerBrowserAutoArm,
      autoFallbackDomains: parseProviderBrowserDomains(context.runtimeOptions.providerBrowserAutoFallbackDomains),
    }),
    conversationTurn: context.turnOrigin === "conversation" &&
      (context.providerId === "claude-code" || context.providerId === "codex"),
    turnAborted: args.events.some(
      (event) => event.type === "done" && event.stop_reason === "aborted",
    ),
    hasQueuedUserTurn:
      (args.session?.promptDraftByTask[args.taskId]?.queuedTurns ?? []).length >
      0,
  });
  if (!start || !args.tracker.claimFallback()) {
    return;
  }
  // "utility": Stave authored this, not the user, so it must not re-run the
  // task's armed Advisor — see the turnOrigin contract in app-store.types.ts.
  void state.sendUserMessage({
    taskId: args.taskId,
    content: buildProviderBrowserFallbackPrompt({
      urls: args.tracker.blockedUrls(),
      source: args.tracker.lensBlocked ? "lens" : "fetch",
    }),
    turnOrigin: "utility",
    preservePromptDraft: true,
    runtimeOverrides: context.runtimeOverrides,
  });
}

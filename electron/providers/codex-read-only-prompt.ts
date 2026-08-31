import type { BridgeEvent, StreamTurnArgs } from "./types";
import { isRecord, toTrimmedString } from "./codex-app-server-json";
import { DEFAULT_READ_ONLY_PROMPT_LABEL } from "./read-only-prompt-labels";
import {
  buildCodexSecondaryServerRequestDenial,
  resolveCodexIsolationConfigOverrides,
  type CodexConfigOverrides,
} from "./codex-app-server-params";

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;
type RuntimeOptions = StreamTurnArgs["runtimeOptions"];
const DEFAULT_CODEX_READ_ONLY_CLEANUP_TIMEOUT_MS = 2_000;

type JsonRpcMessage = {
  id?: unknown;
  method?: string;
  params?: unknown;
};

type Request = <T = unknown>(method: string, params: unknown) => Promise<T>;

type Respond = (requestId: unknown, result: unknown) => Promise<unknown>;

type BuildThreadStartParams = (args: {
  cwd: string;
  runtimeOptions?: RuntimeOptions;
  ephemeral?: boolean;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
  configOverrides?: CodexConfigOverrides;
  isolated?: boolean;
}) => unknown;

type BuildThreadResumeParams = (args: {
  threadId: string;
  cwd: string;
  runtimeOptions?: RuntimeOptions;
  configOverrides?: CodexConfigOverrides;
  secondaryReadOnly?: boolean;
}) => unknown;

type BuildTurnStartParams = (args: {
  threadId: string;
  prompt: string;
  cwd: string;
  runtimeOptions?: RuntimeOptions;
  outputSchema?: unknown;
}) => unknown;

export type CodexReadOnlyPromptArgs = {
  cwd?: string;
  prompt: string;
  model?: string;
  outputSchema?: unknown;
  runtimeOptions?: RuntimeOptions;
  signal?: AbortSignal;
  isolated?: boolean;
  /** Native session for the same isolated role lane, never the primary. */
  resumeSessionId?: string;
  /** Keeps a successful role lane available for a later bounded call. */
  preserveSession?: boolean;
  /** Caller-facing name used in failure text. See `read-only-prompt-labels.ts`. */
  label?: string;
  /**
   * Sign-of-life while the turn runs. `turn/start` does not resolve until the
   * model has finished, so without this the caller cannot distinguish a model
   * that is thinking from a wedged thread for the whole call.
   */
  onProgress?: (progress: { lastItemType: string }) => void;
};

export type CodexReadOnlyPromptResult = {
  ok: boolean;
  text?: string;
  usage?: UsageEvent;
  nativeSessionId?: string;
  sessionReused?: boolean;
  aborted?: boolean;
  detail?: string;
};

function extractLatestAgentMessageTextFromTurn(turn: unknown) {
  if (!isRecord(turn) || !Array.isArray(turn.items)) {
    return "";
  }
  for (let index = turn.items.length - 1; index >= 0; index -= 1) {
    const item = turn.items[index];
    if (
      isRecord(item) &&
      item.type === "agentMessage" &&
      typeof item.text === "string"
    ) {
      return item.text;
    }
  }
  return "";
}

function extractErrorMessage(params: Record<string, unknown> | null) {
  if (!params) {
    return null;
  }
  const directMessage = toTrimmedString(params.message);
  if (directMessage) {
    return directMessage;
  }
  const error = isRecord(params.error) ? params.error : null;
  if (!error) {
    return null;
  }
  const errorMessage = toTrimmedString(error.message);
  if (errorMessage) {
    return errorMessage;
  }
  const nestedError = isRecord(error.error) ? error.error : null;
  return toTrimmedString(nestedError?.message);
}

async function waitForCleanup(args: {
  task: Promise<unknown>;
  timeoutMs: number;
}) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      args.task,
      new Promise<void>((resolve) => {
        timeoutHandle = setTimeout(resolve, args.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function runCodexReadOnlyPromptWithClient(
  args: Omit<CodexReadOnlyPromptArgs, "cwd"> & {
    runtimeCwd: string;
    request: Request;
    /**
     * Answers server->client requests raised on this ephemeral thread. Without
     * it an approval or elicitation request for the read-only thread is never
     * answered: the primary turn's subscriber does not own this thread, so the
     * call would simply hang until the caller's deadline.
     */
    respond?: Respond;
    subscribe: (listener: (message: JsonRpcMessage) => void) => () => void;
    buildThreadStartParams: BuildThreadStartParams;
    buildThreadResumeParams?: BuildThreadResumeParams;
    buildTurnStartParams: BuildTurnStartParams;
    cleanupTimeoutMs?: number;
  },
): Promise<CodexReadOnlyPromptResult> {
  const label = args.label?.trim() || DEFAULT_READ_ONLY_PROMPT_LABEL;
  if (args.signal?.aborted) {
    return { ok: false, aborted: true, detail: `${label} was aborted.` };
  }

  const model = args.model?.trim() || args.runtimeOptions?.model?.trim();
  const readOnlyRuntimeOptions: RuntimeOptions = {
    ...args.runtimeOptions,
    ...(model ? { model } : {}),
    codexFileAccess: "read-only",
    codexNetworkAccess: false,
    codexApprovalPolicy: "never",
    codexPlanMode: false,
  };

  let threadId = "";
  let turnId = "";
  let unsubscribe: (() => void) | null = null;
  let aborted = false;
  let resolveCompletion: (() => void) | null = null;
  let interruptRequest: Promise<unknown> | null = null;
  let keepThread = false;
  let sessionReused = false;
  const requestInterrupt = () => {
    if (!threadId || !turnId || interruptRequest) {
      return;
    }
    interruptRequest = args
      .request("turn/interrupt", { threadId, turnId })
      .catch(() => undefined);
  };
  let resolveAborted: () => void = () => {};
  const abortedSignal = new Promise<void>((resolve) => {
    resolveAborted = resolve;
  });
  const abort = () => {
    aborted = true;
    requestInterrupt();
    resolveCompletion?.();
    resolveAborted();
  };
  args.signal?.addEventListener("abort", abort, { once: true });
  /**
   * Races a request against the abort.
   *
   * `turn/start` does not resolve until the model has finished generating, so
   * awaiting it directly means an abort cannot take effect until the work it
   * was meant to cancel has already been paid for — and there is no `turnId`
   * to interrupt with until it resolves, so `requestInterrupt` no-ops for that
   * whole window. Bailing out here instead falls through to the `finally`,
   * which deletes the ephemeral thread; that is what actually stops the turn
   * server-side.
   *
   * A rejection arriving after the abort already won the race is discarded by
   * `Promise.race` rather than going unhandled, since race attaches a handler
   * to every entrant.
   */
  const raceAbort = <T>(task: Promise<T>) =>
    Promise.race([
      task.then((value) => ({ aborted: false as const, value })),
      abortedSignal.then(() => ({ aborted: true as const })),
    ]);

  try {
    const account = await args.request<{
      account: unknown | null;
      requiresOpenaiAuth: boolean;
    }>("account/read", { refreshToken: true });
    if (aborted) {
      return { ok: false, aborted: true, detail: `${label} was aborted.` };
    }
    if (!account.account && account.requiresOpenaiAuth) {
      return { ok: false, detail: "Codex authentication is required." };
    }

    /**
     * `isolated` only *instructs* the model to avoid MCP; every registered
     * server stays reachable until it is disabled for this thread. Resolving
     * the overrides is therefore mandatory — if they cannot be resolved the
     * call is refused rather than run with weaker isolation than it claims.
     */
    const isolatedConfigOverrides: CodexConfigOverrides | undefined =
      args.isolated
        ? await resolveCodexIsolationConfigOverrides({
            request: args.request,
            cwd: args.runtimeCwd,
          })
        : undefined;
    if (aborted) {
      return { ok: false, aborted: true, detail: `${label} was aborted.` };
    }

    const resumeSessionId = args.resumeSessionId?.trim();
    const threadResponse = resumeSessionId && args.buildThreadResumeParams
      ? await args.request<{ thread: { id: string } }>(
          "thread/resume",
          args.buildThreadResumeParams({
            threadId: resumeSessionId,
            cwd: args.runtimeCwd,
            runtimeOptions: readOnlyRuntimeOptions,
            ...(isolatedConfigOverrides
              ? { configOverrides: isolatedConfigOverrides }
              : {}),
            secondaryReadOnly: true,
          }),
        )
      : await args.request<{ thread: { id: string } }>(
          "thread/start",
          args.buildThreadStartParams({
            cwd: args.runtimeCwd,
            runtimeOptions: readOnlyRuntimeOptions,
            ephemeral: !args.preserveSession,
            sandbox: "read-only",
            approvalPolicy: "never",
            ...(isolatedConfigOverrides
              ? { configOverrides: isolatedConfigOverrides }
              : {}),
            isolated: args.isolated,
          }),
        );
    threadId = threadResponse.thread.id;
    sessionReused = Boolean(
      resumeSessionId && threadId === resumeSessionId,
    );
    if (aborted) {
      return { ok: false, aborted: true, detail: `${label} was aborted.` };
    }

    let latestAgentMessageText = "";
    let latestUsage: UsageEvent | undefined;
    let failureMessage: string | null = null;
    const waitForCompletion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });

    unsubscribe = args.subscribe((message) => {
      if (!message.method) {
        return;
      }
      const params = isRecord(message.params) ? message.params : null;
      const isRequest = Object.prototype.hasOwnProperty.call(message, "id");
      if (isRequest) {
        // This thread is read-only, sandboxed, and has no user attached, so any
        // interactive or privileged request is declined immediately rather than
        // left unanswered.
        if (params?.threadId !== threadId) {
          return;
        }
        const denial = buildCodexSecondaryServerRequestDenial(message.method);
        if (denial && args.respond) {
          void args.respond(message.id, denial).catch(() => undefined);
        }
        failureMessage = `${label} requested an interactive or privileged operation and was stopped.`;
        resolveCompletion?.();
        return;
      }
      if (params?.threadId !== threadId) {
        // A global `error` notification carries no thread id, so it must still
        // fail the call fast instead of waiting for the caller's deadline.
        if (message.method === "error" && params?.threadId === undefined) {
          failureMessage =
            extractErrorMessage(params) ??
            "Codex App Server read-only turn failed.";
          resolveCompletion?.();
        }
        return;
      }

      if (message.method === "item/completed") {
        const item = isRecord(params.item) ? params.item : null;
        if (item?.type === "agentMessage" && typeof item.text === "string") {
          latestAgentMessageText = item.text;
        }
        if (typeof item?.type === "string") {
          args.onProgress?.({ lastItemType: item.type });
        }
        return;
      }

      if (message.method === "thread/tokenUsage/updated") {
        const tokenUsage = isRecord(params.tokenUsage)
          ? params.tokenUsage
          : null;
        const last =
          tokenUsage && isRecord(tokenUsage.last) ? tokenUsage.last : null;
        if (last) {
          latestUsage = {
            type: "usage",
            inputTokens:
              typeof last.inputTokens === "number" ? last.inputTokens : 0,
            outputTokens:
              typeof last.outputTokens === "number" ? last.outputTokens : 0,
            ...(typeof last.cachedInputTokens === "number" &&
            last.cachedInputTokens > 0
              ? { cacheReadTokens: last.cachedInputTokens }
              : {}),
          };
        }
        return;
      }

      if (message.method === "turn/completed") {
        const turn = isRecord(params.turn) ? params.turn : null;
        const turnText = extractLatestAgentMessageTextFromTurn(turn);
        if (turnText) {
          latestAgentMessageText = turnText;
        }
        const error = isRecord(turn?.error) ? turn.error : null;
        if (turn?.status === "failed") {
          failureMessage =
            typeof error?.message === "string"
              ? error.message
              : "Codex App Server read-only turn failed.";
        }
        resolveCompletion?.();
        return;
      }

      if (message.method === "error") {
        failureMessage =
          extractErrorMessage(params) ??
          "Codex App Server read-only turn failed.";
        resolveCompletion?.();
      }
    });

    const turnOutcome = await raceAbort(
      args.request<{
        turn: {
          id: string;
          status?: string;
          error?: { message?: string | null } | null;
          items?: unknown[];
        };
      }>(
        "turn/start",
        args.buildTurnStartParams({
          threadId,
          cwd: args.runtimeCwd,
          prompt: args.prompt,
          runtimeOptions: readOnlyRuntimeOptions,
          outputSchema: args.outputSchema,
        }),
      ),
    );
    if (turnOutcome.aborted) {
      // No `turnId` exists yet, so there is nothing to interrupt. The `finally`
      // deletes the ephemeral thread, which is what ends the turn server-side.
      return { ok: false, aborted: true, detail: `${label} was aborted.` };
    }
    const turnResponse = turnOutcome.value;
    turnId = turnResponse.turn.id;
    if (aborted) {
      requestInterrupt();
      return { ok: false, aborted: true, detail: `${label} was aborted.` };
    }
    const immediateText = extractLatestAgentMessageTextFromTurn(
      turnResponse.turn,
    );
    if (immediateText) {
      latestAgentMessageText = immediateText;
    }
    if (turnResponse.turn.status === "failed") {
      failureMessage =
        turnResponse.turn.error?.message ??
        "Codex App Server read-only turn failed.";
    }
    if (
      turnResponse.turn.status !== "completed" &&
      turnResponse.turn.status !== "failed"
    ) {
      await waitForCompletion;
    }

    if (aborted) {
      return {
        ok: false,
        aborted: true,
        usage: latestUsage,
        detail: `${label} was aborted.`,
      };
    }
    if (failureMessage) {
      return { ok: false, usage: latestUsage, detail: failureMessage };
    }
    keepThread = args.preserveSession === true;
    return {
      ok: true,
      text: latestAgentMessageText,
      usage: latestUsage,
      nativeSessionId: threadId,
      sessionReused,
    };
  } catch (error) {
    if (aborted) {
      return { ok: false, aborted: true, detail: `${label} was aborted.` };
    }
    return {
      ok: false,
      detail:
        error instanceof Error
          ? error.message
          : "Codex App Server read-only turn failed.",
    };
  } finally {
    args.signal?.removeEventListener("abort", abort);
    unsubscribe?.();
    const cleanupTimeoutMs = Math.max(
      1,
      args.cleanupTimeoutMs ?? DEFAULT_CODEX_READ_ONLY_CLEANUP_TIMEOUT_MS,
    );
    if (interruptRequest) {
      await waitForCleanup({
        task: interruptRequest,
        timeoutMs: cleanupTimeoutMs,
      });
    }
    if (threadId && !keepThread) {
      await waitForCleanup({
        task: args
          .request("thread/delete", { threadId })
          .catch(() => undefined),
        timeoutMs: cleanupTimeoutMs,
      });
    }
  }
}

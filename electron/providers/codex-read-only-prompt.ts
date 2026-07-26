import type { BridgeEvent, StreamTurnArgs } from "./types";
import { isRecord, toTrimmedString } from "./codex-app-server-json";

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;
type RuntimeOptions = StreamTurnArgs["runtimeOptions"];
const DEFAULT_CODEX_READ_ONLY_CLEANUP_TIMEOUT_MS = 2_000;

type JsonRpcMessage = {
  method?: string;
  params?: unknown;
};

type Request = <T = unknown>(method: string, params: unknown) => Promise<T>;

type BuildThreadStartParams = (args: {
  cwd: string;
  runtimeOptions?: RuntimeOptions;
  ephemeral?: boolean;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
  isolated?: boolean;
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
};

export type CodexReadOnlyPromptResult = {
  ok: boolean;
  text?: string;
  usage?: UsageEvent;
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
    subscribe: (listener: (message: JsonRpcMessage) => void) => () => void;
    buildThreadStartParams: BuildThreadStartParams;
    buildTurnStartParams: BuildTurnStartParams;
    cleanupTimeoutMs?: number;
  },
): Promise<CodexReadOnlyPromptResult> {
  if (args.signal?.aborted) {
    return { ok: false, aborted: true, detail: "Advisor was aborted." };
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
  const requestInterrupt = () => {
    if (!threadId || !turnId || interruptRequest) {
      return;
    }
    interruptRequest = args
      .request("turn/interrupt", { threadId, turnId })
      .catch(() => undefined);
  };
  const abort = () => {
    aborted = true;
    requestInterrupt();
    resolveCompletion?.();
  };
  args.signal?.addEventListener("abort", abort, { once: true });

  try {
    const account = await args.request<{
      account: unknown | null;
      requiresOpenaiAuth: boolean;
    }>("account/read", { refreshToken: true });
    if (aborted) {
      return { ok: false, aborted: true, detail: "Advisor was aborted." };
    }
    if (!account.account && account.requiresOpenaiAuth) {
      return { ok: false, detail: "Codex authentication is required." };
    }

    const threadResponse = await args.request<{ thread: { id: string } }>(
      "thread/start",
      args.buildThreadStartParams({
        cwd: args.runtimeCwd,
        runtimeOptions: readOnlyRuntimeOptions,
        ephemeral: true,
        sandbox: "read-only",
        approvalPolicy: "never",
        isolated: args.isolated,
      }),
    );
    threadId = threadResponse.thread.id;
    if (aborted) {
      return { ok: false, aborted: true, detail: "Advisor was aborted." };
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
      if (params?.threadId !== threadId) {
        return;
      }

      if (message.method === "item/completed") {
        const item = isRecord(params.item) ? params.item : null;
        if (item?.type === "agentMessage" && typeof item.text === "string") {
          latestAgentMessageText = item.text;
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

    const turnResponse = await args.request<{
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
    );
    turnId = turnResponse.turn.id;
    if (aborted) {
      requestInterrupt();
      return { ok: false, aborted: true, detail: "Advisor was aborted." };
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
        detail: "Advisor was aborted.",
      };
    }
    if (failureMessage) {
      return { ok: false, usage: latestUsage, detail: failureMessage };
    }
    return {
      ok: true,
      text: latestAgentMessageText,
      usage: latestUsage,
    };
  } catch (error) {
    if (aborted) {
      return { ok: false, aborted: true, detail: "Advisor was aborted." };
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
    if (threadId) {
      await waitForCleanup({
        task: args
          .request("thread/delete", { threadId })
          .catch(() => undefined),
        timeoutMs: cleanupTimeoutMs,
      });
    }
  }
}

import type { ProviderId } from "../../../src/lib/providers/provider.types";
import {
  buildProviderTurnPrompt,
  resolveProviderResumeSessionId,
} from "../../../src/lib/providers/provider-request-translators";
import { createBoundedBridgeEventCollector } from "../provider-buffering";
import type {
  BridgeEvent,
  ProviderResponderResult,
  StreamTurnArgs,
} from "../types";
import { AcpEventMapper } from "./acp-event-mapper";
import {
  AcpProtocolClient,
  AcpProtocolError,
  type AcpInboundRequestContext,
  type AcpInboundRequestHandler,
} from "./acp-protocol";
import { AcpRequestPermissionSchema } from "./acp-schemas";

const ACP_EVENT_RETAINED_BYTES_MAX = 512 * 1024;
const ACP_EVENT_TAIL_BYTES = 16 * 1024;
const ACP_CANCEL_GRACE_MS = 2_000;
const ACP_APPROVAL_INPUT_MAX_CHARS = 16_000;

type ApprovalResponseArgs = {
  requestId: string;
  approved: boolean;
  reason?: string;
};

type UserInputResponseArgs = {
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
};

type PendingPermission = {
  allowOptionId?: string;
  rejectOptionId?: string;
  settle: (result: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export interface AcpProviderExtensionRuntime {
  requestHandlers?: ReadonlyMap<string, AcpInboundRequestHandler>;
  onNotification?: (method: string, params: unknown) => boolean;
  respondApproval?: (
    args: ApprovalResponseArgs,
  ) => ProviderResponderResult | null;
  respondUserInput?: (
    args: UserInputResponseArgs,
  ) => ProviderResponderResult | null;
  cancelPending?: () => void;
  pendingApprovalRequestIds?: () => string[];
  pendingUserInputRequestIds?: () => string[];
}

export interface AcpProviderRuntimeProfile {
  providerId: ProviderId;
  displayName: string;
  command: string;
  commandArgs: readonly string[];
  cwd: string;
  env: Record<string, string | undefined>;
  resumeSessionId?: string;
  requestedMode?: string;
  requestedModel: string;
  modelConfigId?: string;
  modelSetter?: "config-option" | "legacy-set-model";
  promptParameterName?: "prompt" | "content";
  authenticationMethodId?: string;
  authenticationHelp: string;
  decisionTimeoutMs: number;
  /** Distinguishes nested ACP requests from the primary process on one turn. */
  requestIdScope?: string;
  /** Client-supplied MCP servers connected for both new and resumed sessions. */
  mcpServers?: readonly unknown[];
  createExtensionRuntime?: (args: {
    emit: (event: BridgeEvent) => void;
    createRequestId: (
      kind: string,
      context: AcpInboundRequestContext,
    ) => string;
    createDecisionTimer: (callback: () => void) => ReturnType<typeof setTimeout>;
  }) => AcpProviderExtensionRuntime;
}

export type AcpProviderStreamTurnArgs = StreamTurnArgs & {
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (aborter: () => void) => void;
  registerApprovalResponder?: (
    responder: (args: ApprovalResponseArgs) => ProviderResponderResult,
  ) => void;
  registerUserInputResponder?: (
    responder: (args: UserInputResponseArgs) => ProviderResponderResult,
  ) => void;
  /** Internal-only scoped Stave tools to attach through the ACP session. */
  staveLocalMcpToolNames?: readonly string[];
};

function listConfigOptionValues(
  option: NonNullable<
    Awaited<ReturnType<AcpProtocolClient["openSession"]>>["configOptions"]
  >[number],
) {
  const values: string[] = [];
  for (const item of option.options ?? []) {
    if ("value" in item) {
      values.push(item.value);
    } else {
      values.push(...item.options.map((nested) => nested.value));
    }
  }
  return values;
}

function serializeApprovalInput(input: unknown) {
  try {
    const value = typeof input === "string" ? input : JSON.stringify(input);
    if (!value) {
      return undefined;
    }
    return value.length > ACP_APPROVAL_INPUT_MAX_CHARS
      ? `${value.slice(0, ACP_APPROVAL_INPUT_MAX_CHARS)}\n…`
      : value;
  } catch {
    return "[Input could not be serialized]";
  }
}

function pendingRequestIds(args: {
  permissions: Map<string, PendingPermission>;
  extensions: AcpProviderExtensionRuntime;
}) {
  return [
    ...args.permissions.keys(),
    ...(args.extensions.pendingApprovalRequestIds?.() ?? []),
  ];
}

/**
 * Run one disposable ACP provider process for an interactive primary turn.
 * Provider profiles supply executable, authentication, and extension policy;
 * this function owns the shared process, session, approval, model, and cleanup
 * lifecycle.
 */
export async function streamAcpProviderTurn(args: {
  turn: AcpProviderStreamTurnArgs;
  profile: AcpProviderRuntimeProfile;
}): Promise<BridgeEvent[]> {
  const { turn, profile } = args;
  const collector = createBoundedBridgeEventCollector({
    maxBytes: ACP_EVENT_RETAINED_BYTES_MAX,
    reserveTailBytes: ACP_EVENT_TAIL_BYTES,
  });
  let emittedOverflow = false;
  let emittedDone = false;
  const emit = (event: BridgeEvent) => {
    if (event.type === "done") {
      if (emittedDone) {
        return;
      }
      emittedDone = true;
      collector.appendTail(event);
    } else if (!collector.append(event) && !emittedOverflow) {
      emittedOverflow = true;
      const warning: BridgeEvent = {
        type: "error",
        message: `${profile.displayName} turn replay was truncated because retained output exceeded the bounded snapshot limit.`,
        recoverable: true,
      };
      collector.appendTail(warning);
      turn.onEvent?.(warning);
    }
    turn.onEvent?.(event);
  };

  const createDecisionTimer = (callback: () => void) => {
    const timer = setTimeout(callback, profile.decisionTimeoutMs);
    timer.unref?.();
    return timer;
  };
  const createRequestId = (
    kind: string,
    context: AcpInboundRequestContext,
  ) =>
    [
      profile.providerId,
      profile.requestIdScope?.trim(),
      kind,
      String(context.id),
    ]
      .filter(Boolean)
      .join(":");
  const pendingPermissions = new Map<string, PendingPermission>();
  const settlePermission = (id: string, outcome: unknown) => {
    const pending = pendingPermissions.get(id);
    if (!pending) {
      return false;
    }
    pendingPermissions.delete(id);
    clearTimeout(pending.timer);
    pending.settle(outcome);
    return true;
  };
  const extensionRuntime = profile.createExtensionRuntime?.({
    emit,
    createRequestId,
    createDecisionTimer,
  }) ?? {};

  const permissionHandler: AcpInboundRequestHandler = async (
    params,
    context,
  ) => {
    const parsed = AcpRequestPermissionSchema.safeParse(params);
    if (!parsed.success) {
      throw new AcpProtocolError("Invalid ACP permission request.");
    }
    const id = createRequestId("permission", context);
    // Select by `kind`, never by `optionId`. `kind` is the protocol enum, while
    // `optionId` is agent-defined free text and genuinely differs per runtime:
    // Cursor advertises `allow-once`/`reject-once` and Kiro advertises
    // `allow_once`/`reject_once`. Matching the id made every Kiro approval
    // unanswerable, so the turn stalled until the decision timer rejected it.
    const allowOption = parsed.data.options.find(
      (option) => option.kind === "allow_once",
    );
    const rejectOption = parsed.data.options.find(
      (option) => option.kind === "reject_once",
    );
    const input = serializeApprovalInput(parsed.data.toolCall.rawInput);
    emit({
      type: "approval",
      toolName:
        parsed.data.toolCall.title?.trim() ||
        parsed.data.toolCall.kind?.trim() ||
        "Tool",
      requestId: id,
      description:
        parsed.data.toolCall.title?.trim() ||
        `${profile.displayName} requests permission.`,
      ...(input ? { input } : {}),
    });
    return await new Promise<unknown>((resolve) => {
      const timer = createDecisionTimer(() => {
        if (rejectOption) {
          settlePermission(id, {
            outcome: {
              outcome: "selected",
              optionId: rejectOption.optionId,
            },
          });
        } else {
          settlePermission(id, { outcome: { outcome: "cancelled" } });
        }
      });
      pendingPermissions.set(id, {
        allowOptionId: allowOption?.optionId,
        rejectOptionId: rejectOption?.optionId,
        settle: resolve,
        timer,
      });
      context.signal.addEventListener(
        "abort",
        () => settlePermission(id, { outcome: { outcome: "cancelled" } }),
        { once: true },
      );
    });
  };
  const requestHandlers = new Map<string, AcpInboundRequestHandler>([
    ["session/request_permission", permissionHandler],
    ...(extensionRuntime.requestHandlers ?? new Map()).entries(),
  ]);
  const mapper = new AcpEventMapper();
  let activeSessionId = "";
  let abortRequested = false;
  let cancelFallback: ReturnType<typeof setTimeout> | null = null;
  const client = new AcpProtocolClient({
    command: profile.command,
    args: profile.commandArgs,
    cwd: profile.cwd,
    env: profile.env,
    requestHandlers,
    onNotification: (method, params) => {
      if (method === "session/update" || method === "session/notification") {
        mapper.mapNotification(params).forEach(emit);
        return true;
      }
      return extensionRuntime.onNotification?.(method, params) ?? false;
    },
  });

  const settleAllCancelled = () => {
    for (const id of [...pendingPermissions.keys()]) {
      settlePermission(id, { outcome: { outcome: "cancelled" } });
    }
    extensionRuntime.cancelPending?.();
  };
  const abort = () => {
    if (abortRequested) {
      return;
    }
    abortRequested = true;
    settleAllCancelled();
    if (activeSessionId) {
      void client.cancel(activeSessionId).catch(() => {});
    }
    cancelFallback = setTimeout(() => {
      client.close(`${profile.displayName} ACP cancellation timed out.`);
    }, ACP_CANCEL_GRACE_MS);
    cancelFallback.unref?.();
  };
  turn.registerAbort?.(abort);
  turn.registerApprovalResponder?.((response) => {
    const permission = pendingPermissions.get(response.requestId);
    if (permission) {
      const optionId = response.approved
        ? permission.allowOptionId
        : permission.rejectOptionId;
      if (!optionId) {
        emit({
          type: "error",
          message: response.approved
            ? `${profile.displayName} did not advertise the required allow-once permission option; the request was rejected safely.`
            : `${profile.displayName} did not advertise the required reject-once permission option; the request was cancelled safely.`,
          recoverable: true,
        });
        settlePermission(
          response.requestId,
          permission.rejectOptionId
            ? {
                outcome: {
                  outcome: "selected",
                  optionId: permission.rejectOptionId,
                },
              }
            : { outcome: { outcome: "cancelled" } },
        );
      } else {
        settlePermission(response.requestId, {
          outcome: { outcome: "selected", optionId },
        });
      }
      return { ok: true };
    }
    const extensionResult = extensionRuntime.respondApproval?.(response);
    if (extensionResult) {
      return extensionResult;
    }
    return {
      ok: false,
      reason: "unknown-request",
      pendingRequestIds: pendingRequestIds({
        permissions: pendingPermissions,
        extensions: extensionRuntime,
      }),
    };
  });
  turn.registerUserInputResponder?.((response) => {
    const extensionResult = extensionRuntime.respondUserInput?.(response);
    if (extensionResult) {
      return extensionResult;
    }
    return {
      ok: false,
      reason: "unknown-request",
      pendingRequestIds:
        extensionRuntime.pendingUserInputRequestIds?.() ?? [],
    };
  });

  try {
    const initialized = await client.initialize({
      clientName: "Stave",
      clientVersion: process.env.npm_package_version ?? "0.0.0",
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    });
    if (profile.authenticationMethodId) {
      if (
        !initialized.authMethods?.some(
          (method) => method.id === profile.authenticationMethodId,
        )
      ) {
        throw new AcpProtocolError(
          `${profile.displayName} did not advertise ${profile.authenticationMethodId} authentication.`,
        );
      }
      await client.authenticate(profile.authenticationMethodId);
    }
    if (abortRequested) {
      throw new AcpProtocolError(
        `${profile.displayName} turn cancelled before session setup.`,
      );
    }

    const requestedResumeSessionId = resolveProviderResumeSessionId({
      conversation: turn.conversation,
      fallbackResumeId: profile.resumeSessionId,
    });
    let session;
    try {
      session = await client.openSession({
        cwd: profile.cwd,
        resumeSessionId: requestedResumeSessionId,
        mcpServers: profile.mcpServers,
      });
    } catch (error) {
      if (!requestedResumeSessionId || abortRequested) {
        throw error;
      }
      emit({
        type: "error",
        message: `${profile.displayName} could not resume the saved session. A fresh session was started with the available conversation history.`,
        recoverable: true,
      });
      session = await client.openSession({
        cwd: profile.cwd,
        mcpServers: profile.mcpServers,
      });
    }
    activeSessionId = session.sessionId;
    emit({
      type: "provider_session",
      providerId: profile.providerId,
      nativeSessionId: session.sessionId,
    });
    mapper.setConfigOptions(session.configOptions);

    if (profile.requestedMode) {
      const availableModeIds = new Set(
        session.modes?.availableModes.map((mode) => mode.id) ?? [],
      );
      if (!availableModeIds.has(profile.requestedMode)) {
        throw new AcpProtocolError(
          `${profile.displayName} session did not advertise the requested ${profile.requestedMode} mode.`,
        );
      }
      mapper.setExpectedMode(profile.requestedMode);
      if (session.modes?.currentModeId !== profile.requestedMode) {
        await client.setMode({
          sessionId: session.sessionId,
          modeId: profile.requestedMode,
        });
      }
    }

    const modelConfig = mapper
      .getConfigOptions()
      .find((option) => option.id === (profile.modelConfigId ?? "model"));
    let resolvedModel =
      typeof modelConfig?.currentValue === "string"
        ? modelConfig.currentValue
        : "auto";
    if (profile.requestedModel !== "auto") {
      if (
        profile.modelSetter === "legacy-set-model" &&
        !modelConfig
      ) {
        await client.setModel({
          sessionId: session.sessionId,
          modelId: profile.requestedModel,
        });
        resolvedModel = profile.requestedModel;
      } else if (
        modelConfig &&
        listConfigOptionValues(modelConfig).includes(profile.requestedModel)
      ) {
        await client.setConfigOption({
          sessionId: session.sessionId,
          configId: profile.modelConfigId ?? "model",
          value: profile.requestedModel,
        });
        resolvedModel = profile.requestedModel;
      } else {
        emit({
          type: "error",
          message: `${profile.displayName} did not advertise the requested model ${profile.requestedModel}; using ${resolvedModel}.`,
          recoverable: true,
        });
      }
    }
    emit({
      type: "model_resolved",
      resolvedProviderId: profile.providerId,
      resolvedModel,
    });
    if (abortRequested) {
      throw new AcpProtocolError(
        `${profile.displayName} turn cancelled before prompting.`,
      );
    }

    const prompt = buildProviderTurnPrompt({
      providerId: profile.providerId,
      prompt: turn.prompt,
      conversation: turn.conversation,
      activeResumeSessionId: session.resumed ? session.sessionId : null,
      includeImageData: false,
    });
    const result = await client.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: prompt }],
      parameterName: profile.promptParameterName,
    });
    if (result.usage) {
      const inputTokens = result.usage.input_tokens ?? 0;
      const outputTokens = result.usage.output_tokens ?? 0;
      emit({
        type: "usage",
        inputTokens,
        outputTokens,
        ...(result.usage.thought_tokens !== undefined
          ? { thoughtTokens: result.usage.thought_tokens }
          : {}),
        ...(result.usage.cached_read_tokens !== undefined
          ? { cacheReadTokens: result.usage.cached_read_tokens }
          : {}),
        ...(result.usage.cached_write_tokens !== undefined
          ? { cacheCreationTokens: result.usage.cached_write_tokens }
          : {}),
      });
    }
    if (cancelFallback) {
      clearTimeout(cancelFallback);
      cancelFallback = null;
    }
    emit({
      type: "done",
      stop_reason:
        abortRequested || result.stopReason === "cancelled"
          ? "user_abort"
          : result.stopReason,
    });
  } catch (error) {
    if (cancelFallback) {
      clearTimeout(cancelFallback);
      cancelFallback = null;
    }
    if (abortRequested) {
      emit({ type: "done", stop_reason: "user_abort" });
    } else {
      emit({
        type: "error",
        message: `${profile.displayName} provider stream failed: ${
          error instanceof Error ? error.message : String(error)
        }. ${profile.authenticationHelp}`,
        recoverable: true,
      });
      emit({ type: "done", stop_reason: "runtime_failure" });
    }
  } finally {
    settleAllCancelled();
    client.close();
  }
  return collector.events;
}

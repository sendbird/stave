import path from "node:path";
import { resolveBoundSecretEnv } from "../../main/browser/secret-service";
import { resolveAcpStaveLocalMcpServers } from "../../main/stave-local-mcp-manifest";
import { resolveAcpTurnMcpServers } from "../acp/acp-shared-mcp";
import {
  createEmptyProviderRuntimeCapabilities,
  extractRuntimeVersion,
  resolveProviderRuntimeCapabilities,
} from "../../../src/lib/providers/runtime-capabilities";
import {
  streamAcpProviderTurn,
  type AcpProviderExtensionRuntime,
  type AcpProviderRuntimeProfile,
  type AcpProviderStreamTurnArgs,
} from "../acp/acp-provider-runtime";
import {
  AcpProtocolError,
  type AcpInboundRequestHandler,
} from "../acp/acp-protocol";
import {
  buildCursorAgentEnv,
  resolveCursorAgentExecutablePath,
} from "../cursor-cli-env";
import { parsePositiveIntEnv, runExecutableProbe } from "../runtime-shared";
import type { BridgeEvent, StreamTurnArgs } from "../types";
import {
  buildCursorPlanResponse,
  buildCursorQuestionResponse,
  CursorAskQuestionRequestSchema,
  CursorCreatePlanRequestSchema,
  mapCursorAskQuestionEvent,
  mapCursorCreatePlanEvent,
  mapCursorGenerateImageEvent,
  mapCursorTaskEvent,
  mapCursorTodoEvent,
  type CursorAskQuestionRequest,
} from "./cursor-acp-extensions";

const CURSOR_AUTH_METHOD_ID = "cursor_login";
const CURSOR_APPROVAL_TIMEOUT_DEFAULT_MS = 45 * 60 * 1000;

/**
 * Builds the `agent` argument list for one ACP session.
 *
 * Approval autonomy is a process flag, not an ACP parameter: the protocol has no
 * "auto approve" field, so the only lever is how the CLI was started. Verified
 * against `agent 2026.08.25-3e8eec8` — these flags are accepted by the `acp`
 * subcommand even though `agent acp --help` does not list them, and `--force`
 * was observed to stop `session/request_permission` from being sent at all.
 *
 * `--approve-mcps` rides with `auto` because a run that cannot stop for a tool
 * approval also cannot stop for an MCP server trust prompt.
 */
export function buildCursorAcpCommandArgs(
  approvalMode: NonNullable<
    StreamTurnArgs["runtimeOptions"]
  >["cursorApprovalMode"],
) {
  if (approvalMode === "auto") {
    return ["acp", "--force", "--approve-mcps"];
  }
  if (approvalMode === "guided") {
    return ["acp", "--auto-review"];
  }
  return ["acp"];
}

type PendingPlan = {
  settle: (result: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingQuestion = {
  request: CursorAskQuestionRequest;
  settle: (result: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

function unavailableEvents(message: string): BridgeEvent[] {
  return [
    { type: "error", message, recoverable: true },
    { type: "done", stop_reason: "runtime_failure" },
  ];
}

type ExtensionFactoryArgs = Parameters<
  NonNullable<AcpProviderRuntimeProfile["createExtensionRuntime"]>
>[0];

function createCursorExtensionRuntime(
  args: ExtensionFactoryArgs,
  interactionMode: "interactive" | "worker" = "interactive",
): AcpProviderExtensionRuntime {
  const pendingPlans = new Map<string, PendingPlan>();
  const pendingQuestions = new Map<string, PendingQuestion>();
  const settlePlan = (id: string, outcome: unknown) => {
    const pending = pendingPlans.get(id);
    if (!pending) {
      return false;
    }
    pendingPlans.delete(id);
    clearTimeout(pending.timer);
    pending.settle(outcome);
    return true;
  };
  const settleQuestion = (id: string, outcome: unknown) => {
    const pending = pendingQuestions.get(id);
    if (!pending) {
      return false;
    }
    pendingQuestions.delete(id);
    clearTimeout(pending.timer);
    pending.settle(outcome);
    return true;
  };
  const requestHandlers = new Map<string, AcpInboundRequestHandler>([
    [
      "cursor/ask_question",
      async (params, context) => {
        const parsed = CursorAskQuestionRequestSchema.safeParse(params);
        if (!parsed.success) {
          throw new AcpProtocolError("Invalid Cursor question request.");
        }
        if (interactionMode === "worker") {
          return buildCursorQuestionResponse({
            request: parsed.data,
            denied: true,
          });
        }
        const id = args.createRequestId("question", context);
        return await new Promise<unknown>((resolve, reject) => {
          const timer = args.createDecisionTimer(() => {
            settleQuestion(id, { outcome: { outcome: "skipped" } });
          });
          pendingQuestions.set(id, {
            request: parsed.data,
            settle: resolve,
            timer,
          });
          context.signal.addEventListener(
            "abort",
            () => settleQuestion(id, { outcome: { outcome: "cancelled" } }),
            { once: true },
          );
          // Same ordering rule as the shared permission handler: an answer can
          // arrive inside the synchronous `emit`, so the entry has to exist
          // first or the responder rejects a live request.
          try {
            args.emit(
              mapCursorAskQuestionEvent({
                requestId: id,
                request: parsed.data,
              }),
            );
          } catch (error) {
            pendingQuestions.delete(id);
            clearTimeout(timer);
            reject(error);
          }
        });
      },
    ],
    [
      "cursor/create_plan",
      async (params, context) => {
        const parsed = CursorCreatePlanRequestSchema.safeParse(params);
        if (!parsed.success) {
          throw new AcpProtocolError("Invalid Cursor plan request.");
        }
        if (interactionMode === "worker") {
          return buildCursorPlanResponse({ approved: true });
        }
        const id = args.createRequestId("plan", context);
        return await new Promise<unknown>((resolve, reject) => {
          const timer = args.createDecisionTimer(() => {
            settlePlan(id, { outcome: { outcome: "cancelled" } });
          });
          pendingPlans.set(id, { settle: resolve, timer });
          context.signal.addEventListener(
            "abort",
            () => settlePlan(id, { outcome: { outcome: "cancelled" } }),
            { once: true },
          );
          try {
            args.emit(
              mapCursorCreatePlanEvent({ requestId: id, request: parsed.data }),
            );
          } catch (error) {
            pendingPlans.delete(id);
            clearTimeout(timer);
            reject(error);
          }
        });
      },
    ],
  ]);

  return {
    requestHandlers,
    onNotification: (method, params) => {
      const event =
        method === "cursor/update_todos"
          ? mapCursorTodoEvent(params)
          : method === "cursor/task"
            ? mapCursorTaskEvent(params)
            : method === "cursor/generate_image"
              ? mapCursorGenerateImageEvent(params)
              : null;
      if (!event) {
        return false;
      }
      args.emit(event);
      return true;
    },
    respondApproval: ({ requestId, approved, reason }) => {
      if (!pendingPlans.has(requestId)) {
        return null;
      }
      settlePlan(requestId, buildCursorPlanResponse({ approved, reason }));
      return { ok: true };
    },
    respondUserInput: ({ requestId, answers, denied }) => {
      const pending = pendingQuestions.get(requestId);
      if (!pending) {
        return null;
      }
      settleQuestion(
        requestId,
        buildCursorQuestionResponse({
          request: pending.request,
          answers,
          denied,
        }),
      );
      return { ok: true };
    },
    cancelPending: () => {
      for (const id of [...pendingPlans.keys()]) {
        settlePlan(id, { outcome: { outcome: "cancelled" } });
      }
      for (const id of [...pendingQuestions.keys()]) {
        settleQuestion(id, { outcome: { outcome: "cancelled" } });
      }
    },
    pendingApprovalRequestIds: () => [...pendingPlans.keys()],
    pendingUserInputRequestIds: () => [...pendingQuestions.keys()],
  };
}

export async function describeCursorAvailability(
  args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {},
) {
  const executablePath = resolveCursorAgentExecutablePath({
    explicitPath: args.runtimeOptions?.cursorBinaryPath,
  });
  if (!executablePath) {
    return {
      available: false,
      detail:
        "Cursor Agent CLI not found from runtime override, STAVE_CURSOR_AGENT_PATH, STAVE_CURSOR_AGENT_CMD, login-shell PATH, or home-bin candidates. Install the Agent CLI or configure its path.",
      capabilities: createEmptyProviderRuntimeCapabilities(),
    };
  }

  const env = buildCursorAgentEnv({ executablePath });
  const [versionProbe, acpProbe, authProbe] = await Promise.all([
    runExecutableProbe({ executablePath, commandArgs: ["--version"], env }),
    runExecutableProbe({ executablePath, commandArgs: ["acp", "--help"], env }),
    runExecutableProbe({ executablePath, commandArgs: ["status"], env }),
  ]);
  const available =
    versionProbe.status === 0 &&
    acpProbe.status === 0 &&
    authProbe.status === 0;
  const version = extractRuntimeVersion(versionProbe.text);
  const detail = available
    ? `Resolved authenticated Cursor Agent CLI: ${executablePath}`
    : authProbe.status !== 0
      ? "Cursor Agent CLI is installed but not authenticated. Run `agent login` and retry."
      : acpProbe.status !== 0
        ? "Cursor Agent CLI is installed but its ACP subcommand is unavailable. Update the Agent CLI and retry."
        : `Cursor Agent CLI probe failed: ${executablePath}`;
  return {
    available,
    detail,
    ...(version ? { version } : {}),
    capabilities: resolveProviderRuntimeCapabilities({
      providerId: "cursor",
      versionText: versionProbe.text,
      available,
    }),
  };
}

export async function streamCursorWithAcp(
  args: AcpProviderStreamTurnArgs & {
    /** Test-only subprocess arguments for the provider fixture. */
    acpArgsForTest?: readonly string[];
  },
): Promise<BridgeEvent[]> {
  if (args.executionPolicy || args.unattendedAutomation) {
    const events = unavailableEvents(
      "Cursor is available only for interactive primary task turns.",
    );
    events.forEach((event) => args.onEvent?.(event));
    return events;
  }

  const executablePath = resolveCursorAgentExecutablePath({
    explicitPath: args.runtimeOptions?.cursorBinaryPath,
  });
  if (!executablePath) {
    const events = unavailableEvents(
      "Cursor Agent CLI was not found. Install it or configure the Cursor Agent path in Settings.",
    );
    events.forEach((event) => args.onEvent?.(event));
    return events;
  }

  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const secretEnv = args.runtimeOptions?.boundSecretIds?.length
    ? await resolveBoundSecretEnv({ ids: args.runtimeOptions.boundSecretIds })
    : {};
  const staveLocalMcpServers = args.staveLocalMcpToolNames?.length
    ? await resolveAcpStaveLocalMcpServers({
        allowedToolNames: args.staveLocalMcpToolNames,
      })
    : [];
  const mcpServers = await resolveAcpTurnMcpServers({
    cwd: runtimeCwd,
    env: { ...process.env, ...secretEnv },
    staveLocalMcpServers,
  });
  if (
    args.staveLocalMcpToolNames?.length &&
    staveLocalMcpServers.length === 0
  ) {
    args.onEvent?.({
      type: "error",
      message:
        "Worker mode is armed, but the Stave Local MCP server is unavailable. Start it in Settings and retry the turn.",
      recoverable: true,
    });
  }
  return streamAcpProviderTurn({
    turn: args,
    profile: {
      providerId: "cursor",
      displayName: "Cursor",
      command: executablePath,
      commandArgs:
        args.acpArgsForTest ??
        buildCursorAcpCommandArgs(args.runtimeOptions?.cursorApprovalMode),
      cwd: runtimeCwd,
      env: buildCursorAgentEnv({ executablePath, baseEnv: secretEnv }),
      resumeSessionId: args.runtimeOptions?.cursorResumeSessionId,
      requestedMode: args.runtimeOptions?.cursorMode ?? "agent",
      requestedModel: args.runtimeOptions?.model?.trim() || "auto",
      modelSetter: "config-option",
      authenticationMethodId: CURSOR_AUTH_METHOD_ID,
      authenticationHelp: "Run `agent login` if authentication has expired.",
      decisionTimeoutMs: parsePositiveIntEnv({
        value: process.env.STAVE_CURSOR_APPROVAL_TIMEOUT_MS,
        fallback: CURSOR_APPROVAL_TIMEOUT_DEFAULT_MS,
      }),
      ...(mcpServers.length > 0 ? { mcpServers } : {}),
      createExtensionRuntime: (extensionArgs) =>
        createCursorExtensionRuntime(extensionArgs, "interactive"),
    },
  });
}

/** Same-task Worker lane. No secrets or nested MCP servers. */
export async function streamCursorWorkerWithAcp(args: {
  prompt: string;
  cwd: string;
  model: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  requestIdScope: string;
  resumeSessionId?: string;
  acpArgsForTest?: readonly string[];
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (aborter: () => void) => void;
  registerApprovalResponder?: AcpProviderStreamTurnArgs["registerApprovalResponder"];
}) {
  const executablePath = resolveCursorAgentExecutablePath({
    explicitPath: args.runtimeOptions?.cursorBinaryPath,
  });
  if (!executablePath) {
    return unavailableEvents(
      "Cursor Agent CLI was not found for the armed Worker.",
    );
  }
  const runtimeCwd = path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  return streamAcpProviderTurn({
    turn: {
      providerId: "cursor",
      prompt: args.prompt,
      cwd: runtimeCwd,
      runtimeOptions: {
        model: args.model,
        ...(args.runtimeOptions?.cursorBinaryPath
          ? { cursorBinaryPath: args.runtimeOptions.cursorBinaryPath }
          : {}),
      },
      onEvent: args.onEvent,
      registerAbort: args.registerAbort,
      registerApprovalResponder: args.registerApprovalResponder,
    },
    profile: {
      providerId: "cursor",
      displayName: "Cursor Worker",
      command: executablePath,
      // Manual on purpose: a nested Worker must not inherit the primary turn's
      // blanket approval grant. Worker approvals surface in the parent UI.
      commandArgs: args.acpArgsForTest ?? buildCursorAcpCommandArgs("manual"),
      cwd: runtimeCwd,
      env: buildCursorAgentEnv({ executablePath }),
      resumeSessionId: args.resumeSessionId,
      requestedMode: "agent",
      requestedModel: args.model.trim() || "auto",
      modelSetter: "config-option",
      authenticationMethodId: CURSOR_AUTH_METHOD_ID,
      authenticationHelp: "Run `agent login` if authentication has expired.",
      decisionTimeoutMs: parsePositiveIntEnv({
        value: process.env.STAVE_CURSOR_APPROVAL_TIMEOUT_MS,
        fallback: CURSOR_APPROVAL_TIMEOUT_DEFAULT_MS,
      }),
      requestIdScope: args.requestIdScope,
      createExtensionRuntime: (extensionArgs) =>
        createCursorExtensionRuntime(extensionArgs, "worker"),
    },
  });
}

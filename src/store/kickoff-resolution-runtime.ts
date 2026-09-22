import type {
  ProviderId,
  ProviderRuntimeOptions,
  NormalizedProviderEvent,
} from "@/lib/providers/provider.types";
import type { SecondaryRunClaimArgs } from "@/lib/runs/secondary-run";
import {
  executeSecondaryRun,
  resolveSecondaryRunBridge,
} from "@/store/secondary-run-executor";

export function withKickoffDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  onStop: () => void = () => {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    };
    const stop = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        onStop();
      } finally {
        reject(new Error(signal.aborted ? "cancelled" : "timeout"));
      }
    };
    const timer = setTimeout(stop, timeoutMs);
    signal.addEventListener("abort", stop, { once: true });
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) stop();
  });
}

export async function resolveKickoffModel<T>(args: {
  requestId: string;
  workspaceId: string;
  projectPath: string;
  providerId: ProviderId;
  model: string;
  prompt: string;
  runtimeOptions: ProviderRuntimeOptions;
  mcpServers: string[];
  signal: AbortSignal;
  timeoutMs: number;
  parse: (text: string) => T | null;
}): Promise<T> {
  if (args.providerId !== "claude-code" && args.providerId !== "codex")
    throw new Error("unavailable");
  if (args.mcpServers.length === 0) {
    const bridge = resolveSecondaryRunBridge();
    if (!bridge) throw new Error("unavailable");
    let failureCode: string | undefined;
    let truncated = false;
    const id = `kickoff:${args.requestId}:${crypto.randomUUID()}`;
    const claim: SecondaryRunClaimArgs = {
      run: {
        id,
        kind: "secondary-provider",
        origin: { kind: "manual", id: args.requestId },
        ownership: {
          projectPath: args.projectPath,
          workspaceId: args.workspaceId,
          taskId: null,
        },
        policy: {
          maxAttempts: 1,
          timeoutMs: args.timeoutMs,
          maxTurns: 2,
          maxOutputBytes: 32_768,
          maxEvents: 512,
        },
        provenance: {
          createdBy: "workspace-kickoff",
          schemaVersion: 1,
          sourceVersion: "brief-v1",
        },
      },
      step: {
        id: `${id}:step`,
        kind: "secondary-provider-turn",
        dependencyIds: [],
        idempotencyKey: id,
      },
      input: {
        providerId: args.providerId,
        model: args.model,
        prompt: args.prompt,
        cwd: args.projectPath,
        runtimeHints:
          args.providerId === "codex"
            ? {
                codexBinaryPath: args.runtimeOptions.codexBinaryPath,
                codexReasoningEffort:
                  args.runtimeOptions.codexReasoningEffort === "minimal"
                    ? "low"
                    : args.runtimeOptions.codexReasoningEffort,
                codexFastMode: args.runtimeOptions.codexFastMode,
              }
            : {
                claudeBinaryPath: args.runtimeOptions.claudeBinaryPath,
                claudeEffort: args.runtimeOptions.claudeEffort,
              },
      },
    };
    let executionId: string | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      if (executionId)
        void window.api?.runs
          ?.cancelSecondary?.({
            runId: id,
            stepId: claim.step.id,
            expectedExecutionId: executionId,
            idempotencyKey: `${id}:cancel`,
          })
          .catch(() => {});
    };
    const result = await withKickoffDeadline(
      executeSecondaryRun({
        bridge: {
          ...bridge,
          executeSecondary: async (request) => {
            const response = await bridge.executeSecondary(request);
            truncated = response.execution?.truncated ?? false;
            if (truncated) failureCode = "output-limit";
            else if (
              /timeout|timed.out/i.test(response.execution?.stopReason ?? "")
            )
              failureCode = "timeout";
            return response;
          },
        },
        claim,
        resultArtifactRef: `kickoff-proposal:${args.requestId}`,
        parse: (text) => (truncated ? null : args.parse(text)),
        parserError: "invalid-output",
        shouldContinue: () => !stopped && !args.signal.aborted,
        onClaimed: (value) => {
          executionId = value.executionId;
          if (stopped || args.signal.aborted) stop();
        },
      }),
      args.signal,
      args.timeoutMs,
      stop,
    );
    if (!result.ok)
      throw new Error(
        failureCode ??
          (result.error === "invalid-output"
            ? "invalid-output"
            : "unavailable"),
      );
    return result.value;
  }

  // Preserve explicitly configured MCP resolution until those sources have a
  // dedicated reader. Do not weaken the shared secondary executor's isolation.
  const turnId = crypto.randomUUID();
  const stream = window.api?.provider?.streamTurn;
  if (!stream) throw new Error("unavailable");
  const stop = () => {
    void window.api?.provider?.abortTurn?.({ turnId }).catch(() => {});
  };
  const read = async () => {
    const events = await stream({
      turnId,
      providerId: args.providerId,
      prompt: args.prompt,
      cwd: args.projectPath,
      runtimeOptions: {
        ...args.runtimeOptions,
        providerTimeoutMs: args.timeoutMs,
      },
    });
    let text = "";
    let count = 0;
    for (const event of events as NormalizedProviderEvent[]) {
      if (++count > 512) throw new Error("output-limit");
      if (event.type === "error") throw new Error("unavailable");
      if (event.type === "text") text += event.text;
      if (new TextEncoder().encode(text).length > 32_768)
        throw new Error("output-limit");
    }
    const result = args.parse(text);
    if (!result) throw new Error("invalid-output");
    return result;
  };
  return withKickoffDeadline(read(), args.signal, args.timeoutMs, stop);
}

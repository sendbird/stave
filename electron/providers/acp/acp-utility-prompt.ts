import path from "node:path";

import { streamAcpProviderTurn } from "./acp-provider-runtime";
import { buildKiroAcpCommandArgs } from "../kiro/kiro-acp-profile";
import {
  buildCursorAgentEnv,
  resolveCursorAgentExecutablePath,
} from "../cursor-cli-env";
import { buildKiroCliEnv, resolveKiroExecutablePath } from "../kiro-cli-env";
import { truncateBufferedText } from "../provider-buffering";
import { DEFAULT_READ_ONLY_PROMPT_LABEL } from "../read-only-prompt-labels";
import type { BridgeEvent, StreamTurnArgs } from "../types";

const CURSOR_AUTH_METHOD_ID = "cursor_login";
const ACP_UTILITY_OUTPUT_MAX_BYTES = 96 * 1024;
const ACP_UTILITY_TIMEOUT_MS = 120_000;
const ACP_UTILITY_ERROR_MAX_CHARS = 1_000;

export type AcpUtilityPromptArgs = {
  providerId: "cursor" | "kiro";
  cwd?: string;
  prompt: string;
  model?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  signal?: AbortSignal;
  /** Caller-facing name used in failure text. See `read-only-prompt-labels.ts`. */
  label?: string;
  /** Test-only subprocess arguments for the provider fixture. */
  acpArgsForTest?: readonly string[];
};

export type AcpUtilityPromptResult = {
  ok: boolean;
  text?: string;
  resolvedModel?: string;
  aborted?: boolean;
  detail?: string;
};

function collectUtilityText(events: readonly BridgeEvent[]) {
  return truncateBufferedText({
    value: events
      .filter(
        (event): event is Extract<BridgeEvent, { type: "text" }> =>
          event.type === "text",
      )
      .map((event) => event.text)
      .join(""),
    maxBytes: ACP_UTILITY_OUTPUT_MAX_BYTES,
  }).trim();
}

function buildFailureDetail(events: readonly BridgeEvent[]) {
  return events
    .filter(
      (event): event is Extract<BridgeEvent, { type: "error" }> =>
        event.type === "error",
    )
    .map((event) => event.message.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, ACP_UTILITY_ERROR_MAX_CHARS);
}

function resolveModelFromEvents(events: readonly BridgeEvent[]) {
  const resolved = events.find(
    (event): event is Extract<BridgeEvent, { type: "model_resolved" }> =>
      event.type === "model_resolved",
  );
  return resolved?.resolvedModel;
}

function finalizeUtilityResult(args: {
  events: BridgeEvent[];
  label: string;
  abortRequested: boolean;
}): AcpUtilityPromptResult {
  if (args.abortRequested) {
    return {
      ok: false,
      aborted: true,
      detail: `${args.label} was aborted.`,
    };
  }
  const done = args.events.find(
    (event): event is Extract<BridgeEvent, { type: "done" }> =>
      event.type === "done",
  );
  const text = collectUtilityText(args.events);
  if (done?.stop_reason === "end_turn" && text) {
    return {
      ok: true,
      text,
      resolvedModel: resolveModelFromEvents(args.events),
    };
  }
  return {
    ok: false,
    detail:
      buildFailureDetail(args.events) ||
      `${args.label} returned no usable result.`,
  };
}

export async function runAcpUtilityPrompt(
  args: AcpUtilityPromptArgs,
): Promise<AcpUtilityPromptResult> {
  const label = args.label ?? DEFAULT_READ_ONLY_PROMPT_LABEL;
  const runtimeCwd =
    args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const requestedModel = args.model?.trim() || "auto";
  let abortRequested = false;
  const abortController = new AbortController();
  const registerAbort = (abort: () => void) => {
    abortController.signal.addEventListener("abort", abort, { once: true });
  };
  const timeout = setTimeout(() => {
    abortRequested = true;
    abortController.abort();
  }, ACP_UTILITY_TIMEOUT_MS);
  timeout.unref?.();
  const onExternalAbort = () => {
    abortRequested = true;
    abortController.abort();
  };
  args.signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    if (args.providerId === "cursor") {
      const executablePath = resolveCursorAgentExecutablePath({
        explicitPath: args.runtimeOptions?.cursorBinaryPath,
      });
      if (!executablePath) {
        return {
          ok: false,
          detail: `${label} is unavailable — Cursor Agent CLI was not found.`,
        };
      }
      const events = await streamAcpProviderTurn({
        turn: {
          providerId: "cursor",
          prompt: args.prompt,
          cwd: runtimeCwd,
          runtimeOptions: {
            model: requestedModel,
            ...(args.runtimeOptions?.cursorBinaryPath
              ? { cursorBinaryPath: args.runtimeOptions.cursorBinaryPath }
              : {}),
          },
          registerAbort,
        },
        profile: {
          providerId: "cursor",
          displayName: "Cursor Utility",
          command: executablePath,
          commandArgs: args.acpArgsForTest ?? ["acp"],
          cwd: runtimeCwd,
          env: buildCursorAgentEnv({ executablePath }),
          requestedMode: "ask",
          requestedModeRequired: false,
          requestedModel,
          modelSetter: "config-option",
          authenticationMethodId: CURSOR_AUTH_METHOD_ID,
          authenticationHelp:
            "Run `agent login` if authentication has expired.",
          decisionTimeoutMs: 5_000,
          permissionPolicy: "auto-reject",
          requestIdScope: "utility",
        },
      });
      return finalizeUtilityResult({ events, label, abortRequested });
    }

    const executablePath = resolveKiroExecutablePath({
      explicitPath: args.runtimeOptions?.kiroBinaryPath,
    });
    if (!executablePath) {
      return {
        ok: false,
        detail: `${label} is unavailable — Kiro CLI was not found.`,
      };
    }
    const events = await streamAcpProviderTurn({
      turn: {
        providerId: "kiro",
        prompt: args.prompt,
        cwd: runtimeCwd,
        runtimeOptions: {
          model: requestedModel,
          kiroEffort: "low",
          ...(args.runtimeOptions?.kiroBinaryPath
            ? { kiroBinaryPath: args.runtimeOptions.kiroBinaryPath }
            : {}),
        },
        registerAbort,
      },
      profile: {
        providerId: "kiro",
        displayName: "Kiro Utility",
        command: executablePath,
        commandArgs: args.acpArgsForTest ?? buildKiroAcpCommandArgs("low"),
        cwd: runtimeCwd,
        env: buildKiroCliEnv({ executablePath }),
        requestedModel,
        modelSetter: "legacy-set-model",
        promptParameterName: "prompt+content",
        authenticationHelp:
          "Run `kiro-cli login` if authentication has expired.",
        decisionTimeoutMs: 5_000,
        permissionPolicy: "auto-reject",
        requestIdScope: "utility",
      },
    });
    return finalizeUtilityResult({ events, label, abortRequested });
  } finally {
    clearTimeout(timeout);
    args.signal?.removeEventListener("abort", onExternalAbort);
  }
}

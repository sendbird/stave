import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { agentPermissionOverrides } from "@/lib/agents/permission";
import { isReadOnlyDelegationPolicy } from "@/lib/runs/delegation-policy";
import {
  claudeReadOnlyDelegationOptions,
  codexReadOnlyDelegationOptions,
} from "@/lib/runs/read-only-delegation";

/**
 * One turn's autonomy, resolved once at the host turn entry for every kind of
 * turn (composer, agent, helper, mission, wake-up, `stave_run_task`).
 *
 * - `ask`: the user's settings exactly as set, with whatever prompts they bring.
 * - `autonomous`: no routine prompts. Only the hard guardrails (writes outside
 *   the workspace, credential paths, irreversible remote effects) and the
 *   agent's own questions reach the user.
 * - `read-only`: the read-only posture; never writes and never asks.
 *
 * Autonomy only removes prompts. It never loosens the user's sandbox, deny
 * lists, credential lists or network setting.
 */
export type Autonomy = "ask" | "autonomous" | "read-only";

export type TurnActor =
  | { kind: "chat" }
  /** A task that runs as an Agent. Any saved permission other than read-only is full access. */
  | { kind: "agent"; access: "full" | "read-only" }
  /** A delegated child: the parent's autonomy, which it can only narrow. */
  | { kind: "helper"; parent: Autonomy | null; access: "inherit" | "read-only" }
  /** Started through Stave Local MCP: never above the caller (when known) or the user. */
  | { kind: "spawned"; caller: Autonomy | null };

export interface TurnGuardrailSpec {
  /** The task's isolation root. Writes outside it (temp dirs aside) stop for the user. */
  root: string;
  credentialFiles: string[];
  credentialEnvVars: string[];
}

export interface TurnPolicy {
  autonomy: Autonomy;
  /** Fields to merge over the turn's options. Empty when the user's settings stand. */
  options: Partial<ProviderRuntimeOptions>;
  guardrails: TurnGuardrailSpec;
  source: "user-settings" | "agent" | "helper" | "spawned" | "read-only";
}

const AUTONOMY_RANK: Readonly<Record<Autonomy, number>> = { "read-only": 0, ask: 1, autonomous: 2 };

function lowerAutonomy(left: Autonomy, right: Autonomy): Autonomy {
  return AUTONOMY_RANK[left] <= AUTONOMY_RANK[right] ? left : right;
}

/**
 * What the user's own settings already mean. The read-only posture is
 * read-only; Claude Auto or Bypass and Codex "never ask" are autonomous;
 * everything else asks. Cursor and Kiro keep their own approvals.
 */
export function autonomyOfOptions(
  providerId: ProviderId,
  options: ProviderRuntimeOptions | undefined,
): Autonomy {
  const value = options ?? {};
  if (providerId === "claude-code") {
    if (isReadOnlyDelegationPolicy(providerId, { providerId, options: value })) return "read-only";
    return value.claudePermissionMode === "auto" || value.claudePermissionMode === "bypassPermissions"
      ? "autonomous"
      : "ask";
  }
  if (providerId === "codex") {
    if (value.codexApprovalPolicy !== "never") return "ask";
    return value.codexFileAccess === "read-only" ? "read-only" : "autonomous";
  }
  return "ask";
}

function resolveAutonomy(actor: TurnActor, requested: Autonomy): Autonomy {
  switch (actor.kind) {
    case "chat":
      return requested;
    case "agent":
      return actor.access === "read-only" || requested === "read-only" ? "read-only" : "autonomous";
    case "helper":
      if (actor.access === "read-only" || requested === "read-only") return "read-only";
      return actor.parent ?? requested;
    case "spawned":
      return lowerAutonomy(actor.caller ?? requested, requested);
  }
}

function readOnlyOptions(providerId: ProviderId, options: ProviderRuntimeOptions): Partial<ProviderRuntimeOptions> {
  if (providerId === "claude-code") {
    return isReadOnlyDelegationPolicy(providerId, { providerId, options })
      ? {}
      : claudeReadOnlyDelegationOptions({
          claudeDisallowedTools: options.claudeDisallowedTools,
          claudeSandboxCredentialFiles: options.claudeSandboxCredentialFiles,
          claudeSandboxCredentialEnvVars: options.claudeSandboxCredentialEnvVars,
        });
  }
  if (providerId === "codex") return codexReadOnlyDelegationOptions();
  return agentPermissionOverrides({ permission: "read-only", providerId, options });
}

/**
 * The prompt-free options for an autonomous turn.
 *
 * - Claude: Bypass stays Bypass (the guardrail hook still runs before it);
 *   Plan and Don't Ask stay as chosen, because widening them would loosen
 *   what the user denied; everything else becomes native `auto`. Stave's own
 *   permission callback answers whatever the CLI still hands over.
 * - Codex: approvals `never`, file access at least `workspace-write` (rooted at
 *   the workspace by the runtime) or the user's full access, network as set.
 * - Cursor and Kiro keep the user's settings.
 */
function autonomousOptions(providerId: ProviderId, options: ProviderRuntimeOptions): Partial<ProviderRuntimeOptions> {
  if (providerId === "claude-code") {
    const mode = options.claudePermissionMode;
    if (mode === "bypassPermissions" || mode === "plan" || mode === "dontAsk" || mode === "auto") return {};
    return { claudePermissionMode: "auto" };
  }
  if (providerId === "codex") {
    return {
      codexApprovalPolicy: "never",
      codexFileAccess: options.codexFileAccess === "danger-full-access" ? "danger-full-access" : "workspace-write",
      codexAutoApproveStaveLocalMcpTools: true,
    };
  }
  return {};
}

export function resolveTurnPolicy(input: {
  providerId: ProviderId;
  actor: TurnActor;
  /** The turn's options: the user's settings as sent, or as the host synced them. */
  options: ProviderRuntimeOptions | undefined;
  root: string;
}): TurnPolicy {
  const options = input.options ?? {};
  const requested = autonomyOfOptions(input.providerId, options);
  const autonomy = resolveAutonomy(input.actor, requested);
  const overrides =
    autonomy === "read-only"
      ? readOnlyOptions(input.providerId, options)
      : autonomy === "autonomous"
        ? autonomousOptions(input.providerId, options)
        : {};
  const merged = { ...options, ...overrides };
  return {
    autonomy,
    options: overrides,
    guardrails: {
      root: input.root,
      credentialFiles: [...(merged.claudeSandboxCredentialFiles ?? [])],
      credentialEnvVars: [...(merged.claudeSandboxCredentialEnvVars ?? [])],
    },
    source:
      autonomy === "read-only"
        ? "read-only"
        : input.actor.kind === "chat"
          ? "user-settings"
          : input.actor.kind,
  };
}

/**
 * Runtime options that decide what a turn may do without asking. A Stave
 * Local MCP caller cannot set them: a spawned turn takes them from the user's
 * settings and the resolver above. Binary and plugin paths are here because
 * they choose the executable or load code that runs with the turn's authority.
 */
export const PERMISSION_RUNTIME_OPTION_KEYS = [
  "claudePermissionMode",
  "claudePlanModeApprovalScope",
  "claudeAllowDangerouslySkipPermissions",
  "claudeSandboxEnabled",
  "claudeAllowUnsandboxedCommands",
  "claudeSandboxReadOnly",
  "claudeSandboxCredentialFiles",
  "claudeSandboxCredentialEnvVars",
  "claudeSettingSources",
  "claudeAllowedTools",
  "claudeDisallowedTools",
  "claudeBinaryPath",
  "claudePluginPaths",
  "trustedTools",
  "codexFileAccess",
  "codexNetworkAccess",
  "codexApprovalPolicy",
  "codexAutoApproveStaveLocalMcpTools",
  "codexAppToolApprovalMode",
  "codexBinaryPath",
  "cursorMode",
  "cursorApprovalMode",
  "cursorBinaryPath",
  "kiroApprovalMode",
  "kiroBinaryPath",
] as const satisfies ReadonlyArray<keyof ProviderRuntimeOptions>;

export function omitPermissionRuntimeOptions<T extends Partial<ProviderRuntimeOptions>>(
  options: T,
): Omit<T, (typeof PERMISSION_RUNTIME_OPTION_KEYS)[number]> {
  const out: Record<string, unknown> = { ...options };
  for (const key of PERMISSION_RUNTIME_OPTION_KEYS) delete out[key];
  return out as Omit<T, (typeof PERMISSION_RUNTIME_OPTION_KEYS)[number]>;
}

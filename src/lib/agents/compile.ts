import type { ProviderId } from "@/lib/providers/provider.types";
import type { DelegateTaskArgs } from "@/lib/runs/delegated-task";
import type { WorkerPresetId, WorkerProviderConfig } from "@/lib/providers/worker-mode";
import { isWorkerPresetId, workerToolsEnforced } from "@/lib/providers/worker-mode";
import type { TaskClass } from "@/lib/providers/auto-routing-profile";
import { agentPermissionSupport } from "./permission";
import {
  AGENT_ROLE_LABELS,
  isUsableAs,
  type AgentConfig,
  type AgentPermission,
  type AgentRole,
  type AgentWorkspace,
} from "./schema";

/**
 * Compiles an agent snapshot into the start options the existing executors
 * already accept. It adds no execution path of its own: a main-agent turn, a
 * delegated task and a Worker keep running exactly where they run today.
 *
 * Pure and deterministic. A limit a provider cannot enforce is never dropped
 * silently: it is written into the instructions and reported as `instructed`
 * (or `unavailable`) so the editor and the assign sheet can say so.
 */

/** UI: Enforced / Asked in instructions / Not available. */
export type AgentSupportLevel = "enforced" | "instructed" | "unavailable";

export interface AgentSupportEntry {
  field: "instructions" | "tools" | "model" | "permission";
  level: AgentSupportLevel;
  reason?: string;
}

/** UI: "Version used". The content hash identifies which version ran. */
export interface AgentSnapshot {
  agentConfigId: string;
  contentHash: string;
  agent: AgentConfig;
}

export type AgentModelResolution =
  | { source: "fixed"; model?: string; effort?: string }
  | { source: "auto-routing"; taskClass?: TaskClass }
  | { source: "provider-mismatch"; requestedProviderId: ProviderId };

/** UI: "What it received". */
export interface AgentReceivedInstruction {
  sourceId: string;
  kind: "agent" | "skill" | "standards";
  hash?: string;
  included: boolean;
  reason?: string;
}

interface CompiledBase {
  agentConfigId: string;
  contentHash: string;
  providerId: ProviderId;
  role: AgentRole;
  model: AgentModelResolution;
  permission: AgentPermission;
  workspace: AgentWorkspace;
  support: AgentSupportEntry[];
  received: AgentReceivedInstruction[];
}

export interface CompiledPrimary extends CompiledBase {
  role: "primary";
  /** Instructions for the provider's system/developer channel. */
  instructions: string;
  /** Instructions to prepend to the first message when no channel exists. */
  promptPreamble?: string;
  disallowedTools?: string[];
  skills: string[];
}

export interface CompiledDelegate extends CompiledBase {
  role: "delegate";
  delegate: Pick<DelegateTaskArgs, "providerId" | "permissionProfile"> & {
    model?: string;
    effort?: DelegateTaskArgs["effort"];
    workspaceMode: AgentWorkspace;
  };
  /** Prepended to the delegation prompt; delegated tasks have no system channel. */
  promptPreamble: string;
}

export interface CompiledWorker extends CompiledBase {
  role: "worker";
  /** Handed to the existing Worker builders unchanged. */
  workerConfig: WorkerProviderConfig;
}

export type CompiledAgent = CompiledPrimary | CompiledDelegate | CompiledWorker;

export type CompileAgentResult =
  | { ok: true; compiled: CompiledAgent }
  | { ok: false; code: "role-not-allowed" | "provider-unavailable" | "archived"; message: string };

const DELEGATE_PROVIDERS: readonly ProviderId[] = ["claude-code", "codex"];
const SYSTEM_CHANNEL_PROVIDERS: readonly ProviderId[] = ["claude-code", "codex"];

/* -------------------------------------------------------------------------- */
/* Snapshot                                                                   */
/* -------------------------------------------------------------------------- */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

/**
 * FNV-1a 64-bit over the UTF-16 code units of the stable JSON form. This is an
 * identity for "which version ran", not a security digest.
 */
export function hashAgentContent(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/** Content that decides behaviour; `archived` and `concurrency` do not. */
function behaviouralContent(agent: AgentConfig) {
  const { archived: _archived, concurrency: _concurrency, ...content } = agent;
  return content;
}

export function snapshotAgent(agent: AgentConfig): AgentSnapshot {
  const copy = structuredClone(agent);
  return {
    agentConfigId: agent.id,
    contentHash: hashAgentContent(behaviouralContent(copy)),
    agent: copy,
  };
}

/* -------------------------------------------------------------------------- */
/* Compile                                                                    */
/* -------------------------------------------------------------------------- */

function resolveModel(agent: AgentConfig, providerId: ProviderId): AgentModelResolution {
  if (agent.model.mode === "auto") {
    return { source: "auto-routing", taskClass: agent.model.taskClass };
  }
  if (agent.model.providerId !== providerId) {
    return { source: "provider-mismatch", requestedProviderId: agent.model.providerId };
  }
  return { source: "fixed", model: agent.model.model, effort: agent.model.effort };
}

function modelSupport(model: AgentModelResolution): AgentSupportEntry {
  if (model.source === "provider-mismatch") {
    return {
      field: "model",
      level: "unavailable",
      reason: `The agent pins ${model.requestedProviderId}; the provider default is used instead.`,
    };
  }
  return { field: "model", level: "enforced" };
}

/**
 * Which tool limits the runtime enforces, per role:
 * - worker: the allowlist, where Worker mode enforces tools (Claude today).
 * - primary: the denylist on Claude (`claudeDisallowedTools`); nothing else.
 * - delegate: nothing; delegated tasks take no per-task tool list.
 * Anything not enforced is stated in the instructions and reported here.
 */
function toolSupport(agent: AgentConfig, providerId: ProviderId, role: AgentRole): AgentSupportEntry | null {
  const hasAllow = (agent.tools.allow?.length ?? 0) > 0;
  const hasDeny = (agent.tools.deny?.length ?? 0) > 0;
  if (!hasAllow && !hasDeny) return null;
  const enforced =
    role === "worker"
      ? workerToolsEnforced(providerId) && !hasDeny
      : role === "primary"
        ? providerId === "claude-code" && !hasAllow
        : false;
  if (enforced) return { field: "tools", level: "enforced" };
  return {
    field: "tools",
    level: "instructed",
    reason: "Some of this agent's tool limits are not enforced here; they are stated in the instructions.",
  };
}

function instructionsSupport(providerId: ProviderId, role: AgentRole): AgentSupportEntry {
  if (role === "delegate") {
    return {
      field: "instructions",
      level: "instructed",
      reason: "Delegated tasks receive the agent instructions at the start of the delegation prompt.",
    };
  }
  if (role === "primary" && !SYSTEM_CHANNEL_PROVIDERS.includes(providerId)) {
    return {
      field: "instructions",
      level: "instructed",
      reason: "This provider has no instruction channel Stave controls; instructions precede the first message.",
    };
  }
  return { field: "instructions", level: "enforced" };
}

function toolLimitSentence(agent: AgentConfig): string | null {
  const parts: string[] = [];
  if (agent.tools.allow?.length) parts.push(`Only use these tools: ${agent.tools.allow.join(", ")}.`);
  if (agent.tools.deny?.length) parts.push(`Do not use these tools: ${agent.tools.deny.join(", ")}.`);
  return parts.length ? parts.join(" ") : null;
}

function renderInstructions(agent: AgentConfig, includeToolSentence: boolean, standards?: string): string {
  const lines = [`# Agent: ${agent.name}`, agent.instructions];
  // The user's own standards follow the agent's instructions and never replace them.
  if (standards) lines.push(`## My standards\n\n${standards}`);
  if (includeToolSentence) {
    const sentence = toolLimitSentence(agent);
    if (sentence) lines.push(sentence);
  }
  if (agent.permission === "read-only") {
    lines.push("Do not modify files.");
  }
  lines.push(`Report with these sections: ${agent.report.join(", ")}.`);
  return lines.join("\n\n");
}

function toDelegatePermission(permission: AgentPermission): DelegateTaskArgs["permissionProfile"] {
  // Read-only maps to the most restrictive delegated profile.
  return permission === "read-only" ? "manual" : permission;
}

function toDelegateEffort(effort: string | undefined): DelegateTaskArgs["effort"] | undefined {
  return effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh" || effort === "max" || effort === "ultra"
    ? effort
    : undefined;
}

export function compileAgent(args: {
  snapshot: AgentSnapshot;
  role: AgentRole;
  providerId: ProviderId;
  /** The user's "My standards" for this run; not part of the agent's version. */
  standards?: string;
}): CompileAgentResult {
  const { snapshot, role, providerId } = args;
  const standards = args.standards?.trim() || undefined;
  const { agent } = snapshot;

  if (agent.archived) {
    return { ok: false, code: "archived", message: `"${agent.name}" is archived and takes no new work.` };
  }
  if (!isUsableAs(agent, role)) {
    return {
      ok: false,
      code: "role-not-allowed",
      message: `"${agent.name}" can't be used as a ${AGENT_ROLE_LABELS[role].toLowerCase()}.`,
    };
  }
  if (role === "delegate" && !DELEGATE_PROVIDERS.includes(providerId)) {
    return {
      ok: false,
      code: "provider-unavailable",
      message: `Delegated tasks run on ${DELEGATE_PROVIDERS.join(" or ")}, not ${providerId}.`,
    };
  }

  const model = resolveModel(agent, providerId);
  const tools = toolSupport(agent, providerId, role);
  const permissionLevel = role === "primary" ? agentPermissionSupport(agent.permission, providerId) : null;
  const support: AgentSupportEntry[] = [
    instructionsSupport(providerId, role),
    modelSupport(model),
    ...(tools ? [tools] : []),
    ...(permissionLevel
      ? [
          {
            field: "permission" as const,
            level: permissionLevel,
            ...(permissionLevel === "instructed" ? { reason: "Kiro has no read-only mode; it asks before every tool." } : {}),
          },
        ]
      : []),
  ];
  const received: AgentReceivedInstruction[] = [
    { sourceId: `agent:${agent.id}`, kind: "agent", hash: snapshot.contentHash, included: true },
    ...agent.skills.map((skill) => ({ sourceId: `skill:${skill}`, kind: "skill" as const, included: true })),
    ...(standards
      ? [{ sourceId: "standards", kind: "standards" as const, hash: hashAgentContent(standards), included: true }]
      : []),
  ];
  const base = {
    agentConfigId: agent.id,
    contentHash: snapshot.contentHash,
    providerId,
    model,
    permission: agent.permission,
    workspace: agent.workspace,
    support,
    received,
  };
  const toolsInstructed = tools?.level === "instructed";
  const fixed = model.source === "fixed" ? model : null;

  if (role === "worker") {
    const workerConfig: WorkerProviderConfig = {
      ...(agent.workerPresetId && isWorkerPresetId(agent.workerPresetId)
        ? { presetId: agent.workerPresetId as WorkerPresetId }
        : {
            description: agent.description,
            instructions: renderInstructions(agent, toolsInstructed, standards),
            ...(agent.tools.allow ? { tools: [...agent.tools.allow] } : {}),
            ...(agent.tools.maxTurns ? { maxTurns: agent.tools.maxTurns } : {}),
          }),
      ...(fixed?.model ? { model: fixed.model } : {}),
      ...(fixed?.effort ? { effort: fixed.effort as WorkerProviderConfig["effort"] } : {}),
    };
    return { ok: true, compiled: { ...base, role, workerConfig } };
  }

  if (role === "delegate") {
    return {
      ok: true,
      compiled: {
        ...base,
        role,
        delegate: {
          providerId: providerId as DelegateTaskArgs["providerId"],
          permissionProfile: toDelegatePermission(agent.permission),
          ...(fixed?.model ? { model: fixed.model } : {}),
          ...(fixed ? { effort: toDelegateEffort(fixed.effort) } : {}),
          workspaceMode: agent.workspace,
        },
        promptPreamble: renderInstructions(agent, true, standards),
      },
    };
  }

  const hasChannel = SYSTEM_CHANNEL_PROVIDERS.includes(providerId);
  const rendered = renderInstructions(agent, toolsInstructed || !hasChannel, standards);
  return {
    ok: true,
    compiled: {
      ...base,
      role: "primary",
      instructions: rendered,
      ...(hasChannel ? {} : { promptPreamble: rendered }),
      ...(providerId === "claude-code" && agent.tools.deny?.length ? { disallowedTools: [...agent.tools.deny] } : {}),
      skills: [...agent.skills],
    },
  };
}

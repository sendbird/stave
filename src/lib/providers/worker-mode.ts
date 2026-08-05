import {
  CLAUDE_FABLE_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
  DEFAULT_CLAUDE_SONNET_1M_MODEL,
  MODEL_TIER_ORDER,
  clampCodexEffortToModel,
  getModelCapability,
  getSdkModelOptions,
  listCodexReasoningEffortsForModel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ModelTier } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * Worker mode: a high-capability primary orchestrates one provider-native
 * task-executor subagent.
 *
 * This module is the provider-neutral domain core. It owns the vocabulary, the
 * preset catalog, the capability table, and the single resolver both the
 * renderer (for labels and availability) and the main process (for the actual
 * provider call) go through. Provider mechanics live in the adapters — nothing
 * here knows about `Options.agents` or `agents.default_subagent_model`.
 */

/** The one worker Stave registers. Named so a trace can attribute work to it. */
export const WORKER_AGENT_NAME = "stave-task-executor";

/** MVP ceiling: one foreground worker, so the parent turn stays interruptible. */
export const WORKER_MAX_CONCURRENCY = 1;

export const WORKER_INSTRUCTIONS_MAX_CHARS = 8_000;
export const WORKER_DESCRIPTION_MAX_CHARS = 600;
export const WORKER_MODEL_MAX_CHARS = 200;
export const WORKER_MAX_TOOLS = 40;
export const WORKER_TURNS_MIN = 1;
export const WORKER_TURNS_MAX = 200;

export type WorkerMode = "off" | "task-executor";

/** `"auto"` defers to the preset's per-provider recommendation. */
export type WorkerModelPreference = "auto" | string;

/**
 * Worker effort scale. Union of both providers so one persisted value survives
 * a provider switch; `resolveWorkerProfile` clamps per provider and per model
 * rather than rejecting, and drops it entirely for models that reject effort.
 */
export type WorkerEffort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";

export type WorkerEffortPreference = "auto" | WorkerEffort;

export const WORKER_AUTO_VALUE = "auto";

export const WORKER_EFFORT_ORDER = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const satisfies readonly WorkerEffort[];

export type WorkerPresetId =
  | "patch-hand"
  | "verified-patch"
  | "sweep"
  | "scout"
  | "deep-packet"
  | "second-pair";

export const DEFAULT_WORKER_PRESET_ID: WorkerPresetId = "verified-patch";

/**
 * Per-provider worker configuration. Stored per provider so switching
 * Codex↔Claude and back never overwrites the other provider's choice.
 *
 * `description`, `instructions`, `tools` and `maxTurns` are optional overrides
 * of the selected preset. Absent means "use the preset value", which is what
 * keeps a preset upgrade from being shadowed by a stale copy of its old text.
 */
export interface WorkerProviderConfig {
  presetId?: WorkerPresetId;
  model?: WorkerModelPreference;
  effort?: WorkerEffortPreference;
  description?: string;
  instructions?: string;
  tools?: string[];
  maxTurns?: number;
}

/**
 * The subset of a task's prompt-draft runtime overrides that arms Worker mode.
 * Declared structurally so this module stays free of renderer types, mirroring
 * `AdvisorArmOverrides`.
 */
export type WorkerArmOverrides = {
  workerEnabled?: boolean;
  workerConfigByProvider?: Partial<Record<ProviderId, WorkerProviderConfig>>;
};

/** What one turn actually sends. Only the active provider's intent crosses IPC. */
export interface WorkerRuntimeIntent {
  mode: "task-executor";
  presetId: WorkerPresetId;
  workerModel: WorkerModelPreference;
  workerEffort: WorkerEffortPreference;
  description?: string;
  instructions?: string;
  tools?: string[];
  maxTurns?: number;
}

export interface ResolvedWorkerProfile {
  provider: ProviderId;
  primaryModel: string;
  workerName: string;
  presetId: WorkerPresetId;
  /** What the user asked for, preserved so the trace can show `Auto → model`. */
  requestedWorkerModel: WorkerModelPreference;
  resolvedWorkerModel: string;
  requestedWorkerEffort: WorkerEffortPreference;
  /** `null` means "send no effort" — the model rejects the field. */
  resolvedWorkerEffort: WorkerEffort | null;
  description: string;
  instructions: string;
  /** `null` inherits the parent's tools. */
  tools: readonly string[] | null;
  /** False when the provider cannot hard-enforce `tools` (Codex). */
  toolsEnforced: boolean;
  maxTurns: number | null;
  maxConcurrency: typeof WORKER_MAX_CONCURRENCY;
  foreground: true;
  /** Set when the worker is not actually cheaper than the primary. */
  costWarning: string | null;
}

/** Immutable provider-call configuration attached to a native Worker spawn. */
export interface WorkerExecutionMetadata {
  providerId: ProviderId;
  primaryModel: string;
  presetId: WorkerPresetId;
  workerModel: string;
  workerEffort: WorkerEffort | null;
}

export function buildWorkerExecutionMetadata(
  profile: ResolvedWorkerProfile,
): WorkerExecutionMetadata {
  return {
    providerId: profile.provider,
    primaryModel: profile.primaryModel,
    presetId: profile.presetId,
    workerModel: profile.resolvedWorkerModel,
    workerEffort: profile.resolvedWorkerEffort,
  };
}

export function formatWorkerExecutionMetadata(
  execution: WorkerExecutionMetadata,
): string {
  return [
    getWorkerPreset(execution.presetId).label,
    toHumanModelName({ model: execution.workerModel }),
    execution.workerEffort,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

export type WorkerUnavailableReason =
  | "primary_not_supported"
  | "worker_model_not_found"
  | "worker_model_not_supported"
  | "provider_capability_unavailable";

export type WorkerResolution =
  | { status: "off" }
  | {
      status: "unavailable";
      reason: WorkerUnavailableReason;
      detail: string;
    }
  | { status: "ready"; profile: ResolvedWorkerProfile };

/* -------------------------------------------------------------------------- */
/* Capability table                                                           */
/* -------------------------------------------------------------------------- */

interface WorkerProviderCapability {
  /** Models that can orchestrate a native worker as the primary. */
  primaries: readonly string[];
  /** Models that can be pinned as the worker. */
  workers: readonly string[];
  /** Whether the provider can hard-enforce a worker tool allowlist. */
  toolsEnforced: boolean;
  /**
   * Models that reject an explicit effort value. Claude's API errors on
   * `effort` for Haiku-class models, so the field is dropped rather than
   * clamped (see the Phase 0 capability spike).
   */
  modelsRejectingEffort: readonly string[];
}

/**
 * Verified against `@anthropic-ai/claude-agent-sdk` 0.3.179 and codex-cli
 * 0.145.0. See `.stave/context/plans/handoff_20260804-094957_capability-spike.md`.
 *
 * Codex primaries and workers are limited to Sol and Terra. On codex-cli
 * 0.145/0.146, `spawn_agent` uses the V2 subagent pool and rejects Luna even
 * though Luna remains a valid top-level model.
 */
const WORKER_CAPABILITIES: Readonly<
  Record<ProviderId, WorkerProviderCapability>
> = {
  "claude-code": {
    primaries: [
      CLAUDE_FABLE_MODEL,
      DEFAULT_CLAUDE_OPUS_MODEL,
      DEFAULT_CLAUDE_OPUS_1M_MODEL,
      DEFAULT_CLAUDE_SONNET_MODEL,
      DEFAULT_CLAUDE_SONNET_1M_MODEL,
    ],
    workers: [
      DEFAULT_CLAUDE_SONNET_MODEL,
      DEFAULT_CLAUDE_SONNET_1M_MODEL,
      "claude-haiku-4-5",
      DEFAULT_CLAUDE_OPUS_MODEL,
      CLAUDE_FABLE_MODEL,
    ],
    toolsEnforced: true,
    modelsRejectingEffort: ["claude-haiku-4-5"],
  },
  codex: {
    primaries: ["gpt-5.6-sol", "gpt-5.6-terra"],
    workers: ["gpt-5.6-terra", "gpt-5.6-sol"],
    // Codex carries worker copy through developer instructions; there is no
    // per-subagent tool allowlist, so a preset's tool list is advisory prose.
    toolsEnforced: false,
    modelsRejectingEffort: [],
  },
};

/** Deterministic `auto` worker per provider, used when a preset has no opinion. */
const DEFAULT_WORKER_MODEL: Readonly<Record<ProviderId, string>> = {
  "claude-code": DEFAULT_CLAUDE_SONNET_MODEL,
  codex: "gpt-5.6-terra",
};

export function listWorkerPrimaryModels(providerId: ProviderId) {
  return WORKER_CAPABILITIES[providerId].primaries;
}

export function listWorkerModelOptions(providerId: ProviderId) {
  return WORKER_CAPABILITIES[providerId].workers;
}

export function canPrimaryOrchestrateWorker(args: {
  providerId: ProviderId;
  model: string;
}) {
  return WORKER_CAPABILITIES[args.providerId].primaries.includes(
    args.model.trim(),
  );
}

export function isWorkerCapableModel(args: {
  providerId: ProviderId;
  model: string;
}) {
  return WORKER_CAPABILITIES[args.providerId].workers.includes(
    args.model.trim(),
  );
}

export function workerToolsEnforced(providerId: ProviderId) {
  return WORKER_CAPABILITIES[providerId].toolsEnforced;
}

/**
 * Effort tiers selectable for a worker model.
 *
 * Returns an empty list for models that reject the field entirely, which the
 * UI renders as "follows the model default" rather than as a broken select.
 */
export function listWorkerEffortsForModel(args: {
  providerId: ProviderId;
  model: string;
}): readonly WorkerEffort[] {
  const capability = WORKER_CAPABILITIES[args.providerId];
  const model = args.model.trim();
  if (capability.modelsRejectingEffort.includes(model)) {
    return [];
  }
  if (args.providerId === "codex") {
    return listCodexReasoningEffortsForModel({ model }).filter(
      (effort): effort is WorkerEffort => effort !== "minimal",
    );
  }
  // Claude's scale has no `ultra`.
  return WORKER_EFFORT_ORDER.filter((effort) => effort !== "ultra");
}

/** Claude's effort scale: the shared union minus Codex's `ultra` tier. */
export type ClaudeWorkerEffort = Exclude<WorkerEffort, "ultra">;

/**
 * The effort the Claude adapter may actually put on an `AgentDefinition`.
 *
 * `AgentDefinition.effort` has no `ultra` member, so this narrowing is a type
 * requirement and not just defensive coding. `resolveWorkerProfile` already
 * steps `ultra` down for a Claude worker, but that guarantee lives in a
 * different module — restating it at the SDK boundary means a future change to
 * Claude's supported-effort list cannot quietly ship an invalid field.
 */
export function toClaudeWorkerEffort(
  effort: WorkerEffort | null,
): ClaudeWorkerEffort | null {
  if (!effort) {
    return null;
  }
  return effort === "ultra" ? "max" : effort;
}

/* -------------------------------------------------------------------------- */
/* Preset catalog                                                             */
/* -------------------------------------------------------------------------- */

export interface WorkerPreset {
  id: WorkerPresetId;
  label: string;
  /** One-line descriptor for the picker row. */
  summary: string;
  /**
   * Delegation description handed to the provider. On Claude this becomes
   * `AgentDefinition.description`, which is what the primary reads to decide
   * whether to delegate — so it is written as a trigger, not as a bio.
   */
  description: string;
  /** The worker's system prompt / developer instructions. */
  instructions: string;
  /** Tool allowlist. Hard-enforced on Claude, advisory on Codex. */
  tools?: readonly string[];
  maxTurns?: number;
  /** Model each provider uses when the user leaves the model on `auto`. */
  autoModel: Readonly<Record<ProviderId, string>>;
  /** Effort each provider uses when the user leaves effort on `auto`. */
  autoEffort: Readonly<Record<ProviderId, WorkerEffort>>;
}

const READ_ONLY_TOOLS = ["Read", "Grep", "Glob"] as const;
const EDIT_TOOLS = [...READ_ONLY_TOOLS, "Edit", "Write"] as const;

/**
 * Presets are derived from published guidance rather than invented:
 *
 * - Anthropic's subagent docs recommend focused agents, trigger-shaped
 *   descriptions, limited tool access, and routing work to cheaper models.
 * - Aider's architect/editor split enforces worker discipline structurally (no
 *   repo map, no shell suggestions) rather than with "do not redesign" prose.
 * - Roo Code's orchestrator contract contributes the "only this work, and these
 *   instructions supersede conflicting general guidance" clause.
 * - The community `luna_worker` pattern contributes the heuristic that a
 *   cheaper model at high effort can beat a mid model at its default effort.
 *   Codex presets use Terra because the V2 subagent pool rejects Luna.
 */
export const WORKER_PRESETS: readonly WorkerPreset[] = [
  {
    id: "patch-hand",
    label: "Patch hand",
    summary: "Applies a decided edit exactly. No design authority, no verify.",
    description:
      "Applies a fully specified code edit exactly as described. Use when you have already decided what to change and only need the edit made.",
    instructions: [
      "You apply changes that have already been decided. The task description you receive is complete and authoritative — treat it as a specification, not a suggestion.",
      "Make exactly the edits it describes, in the files it names, and nothing else: no adjacent cleanup, no renames, no new abstractions, and no error handling for cases it does not mention.",
      "If the description conflicts with what you find in the code, stop and report the conflict rather than resolving it yourself.",
      "These instructions supersede any general guidance that would have you improve or extend the code beyond what was asked.",
      "When you finish, report the files you touched and a one-line description of each change.",
    ].join("\n\n"),
    tools: EDIT_TOOLS,
    maxTurns: 20,
    autoModel: {
      "claude-code": DEFAULT_CLAUDE_SONNET_MODEL,
      codex: "gpt-5.6-terra",
    },
    autoEffort: { "claude-code": "medium", codex: "high" },
  },
  {
    id: "verified-patch",
    label: "Verified patch",
    summary: "Applies the edit, then runs typecheck/tests until green.",
    description:
      "Applies a specified edit and runs typecheck and the narrowest relevant tests until they pass. Use proactively for edits that need verification before the result is trusted.",
    instructions: [
      "You apply changes that have already been decided, then prove they work. The task description is complete and authoritative — treat it as a specification, not a suggestion.",
      "Make exactly the edits it describes, in the files it names, and nothing else. No adjacent cleanup, no renames, no new abstractions.",
      "After editing, run the verification command given in the task — typically a typecheck plus the narrowest relevant test. Iterate until it passes, or until you can show the failure is pre-existing and unrelated to your change.",
      "Do not widen the change to make an unrelated failure go away, and do not weaken or skip a test to reach green.",
      "These instructions supersede any general guidance that would have you improve or extend the code beyond what was asked.",
      "Report the exact command you ran and its final status. Include failure output only for failures your change caused.",
    ].join("\n\n"),
    tools: [...EDIT_TOOLS, "Bash"],
    maxTurns: 30,
    autoModel: {
      "claude-code": DEFAULT_CLAUDE_SONNET_MODEL,
      codex: "gpt-5.6-terra",
    },
    autoEffort: { "claude-code": "high", codex: "max" },
  },
  {
    id: "sweep",
    label: "Sweep",
    summary: "One mechanical transformation across many files.",
    description:
      "Performs one mechanical transformation uniformly across many files. Use for renames, import rewrites, signature updates, and other repetitive multi-file edits.",
    instructions: [
      "You perform one mechanical transformation across many files. The task gives you the exact before/after pattern.",
      "Apply it uniformly: every match gets the same treatment, and a file with no match is left untouched. Do not judge whether a particular site should change — if it matches the pattern, change it; if it does not, skip it.",
      "Never reformat, reorder, or restyle code outside the matched region.",
      "If you find a site where the pattern applies but the mechanical edit would clearly break the code, skip it and list it under 'needs review' instead of improvising a fix.",
      "Report the files changed, the count of sites changed, and the needs-review list.",
    ].join("\n\n"),
    tools: [...READ_ONLY_TOOLS, "Edit"],
    maxTurns: 40,
    autoModel: {
      "claude-code": "claude-haiku-4-5",
      codex: "gpt-5.6-terra",
    },
    autoEffort: { "claude-code": "medium", codex: "xhigh" },
  },
  {
    id: "scout",
    label: "Scout",
    summary: "Read-only investigation. Returns a conclusion, not file dumps.",
    description:
      "Read-only codebase investigator that returns a conclusion with file paths and line numbers. Use proactively when answering a question would mean reading across many files.",
    instructions: [
      "You answer one specific question about this codebase and change nothing.",
      "Search broadly, read only the excerpts you need, and return a conclusion — not a transcript of your search.",
      "Give file paths and line numbers for every claim, and quote code only where the exact text is load-bearing.",
      "If the answer is that the thing does not exist here, say so plainly and list where you looked.",
      "If the question turns out to be ambiguous, answer the most likely reading and note the alternative in one sentence. Do not expand into adjacent questions.",
    ].join("\n\n"),
    tools: READ_ONLY_TOOLS,
    maxTurns: 25,
    autoModel: {
      "claude-code": "claude-haiku-4-5",
      codex: "gpt-5.6-terra",
    },
    autoEffort: { "claude-code": "medium", codex: "high" },
  },
  {
    id: "deep-packet",
    label: "Deep packet",
    summary: "Owns one bounded unit of real work at maximum effort.",
    description:
      "Implements one bounded, independent unit of work from a written spec, with latitude inside that boundary. Use for self-contained features, a single component, or one migration step.",
    instructions: [
      "You own one bounded, independent piece of work, described in full in your task.",
      "Inside that boundary you have real latitude: choose the implementation, match the surrounding code's conventions, and verify your own work.",
      "Outside it you have none. Do not touch files the task does not scope you to, do not change public interfaces the task did not tell you to change, and do not start adjacent work you notice along the way.",
      "Finish the whole piece, not the easy part. If you genuinely cannot complete something, complete the rest and state plainly what is missing and why.",
      "Report the outcome first, in one or two sentences, before any detail.",
    ].join("\n\n"),
    tools: [...EDIT_TOOLS, "Bash"],
    maxTurns: 60,
    autoModel: {
      "claude-code": DEFAULT_CLAUDE_SONNET_MODEL,
      codex: "gpt-5.6-terra",
    },
    autoEffort: { "claude-code": "max", codex: "max" },
  },
  {
    id: "second-pair",
    label: "Second pair of eyes",
    summary: "Reviews a diff for correctness. Reports, never edits.",
    description:
      "Reviews a completed diff for correctness without modifying anything. Use after a change is finished and before showing it to the user.",
    instructions: [
      "You review a diff you did not write, and you fix nothing.",
      "Read the change, then read enough surrounding code to judge whether it is correct in context.",
      "Report every issue you find, including ones you are uncertain about, each with a confidence level and a severity. Coverage matters more than selectivity here; a later pass will filter.",
      "For each finding give the file, the line, and a concrete failure scenario: specific inputs or state leading to a specific wrong result.",
      "Skip pure style and naming preferences.",
      "If you find nothing, say so. An empty report is a valid outcome.",
    ].join("\n\n"),
    tools: [...READ_ONLY_TOOLS, "Bash"],
    maxTurns: 30,
    autoModel: {
      "claude-code": DEFAULT_CLAUDE_SONNET_MODEL,
      codex: "gpt-5.6-terra",
    },
    autoEffort: { "claude-code": "high", codex: "high" },
  },
];

const WORKER_PRESET_BY_ID = new Map<WorkerPresetId, WorkerPreset>(
  WORKER_PRESETS.map((preset) => [preset.id, preset]),
);

export function getWorkerPreset(presetId: WorkerPresetId): WorkerPreset {
  const preset = WORKER_PRESET_BY_ID.get(presetId);
  // Callers may hold a preset id persisted by a newer build. Falling back keeps
  // Worker mode running with verified copy instead of disarming it silently.
  return preset ?? WORKER_PRESET_BY_ID.get(DEFAULT_WORKER_PRESET_ID)!;
}

export function isWorkerPresetId(value: unknown): value is WorkerPresetId {
  return typeof value === "string" && WORKER_PRESET_BY_ID.has(value as WorkerPresetId);
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function trimToLength(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxChars) : undefined;
}

function normalizeToolList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tools = Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ).slice(0, WORKER_MAX_TOOLS);
  return tools.length > 0 ? tools : undefined;
}

function normalizeMaxTurns(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (rounded < WORKER_TURNS_MIN) {
    return undefined;
  }
  return Math.min(rounded, WORKER_TURNS_MAX);
}

function isWorkerEffort(value: unknown): value is WorkerEffort {
  return (
    typeof value === "string" &&
    (WORKER_EFFORT_ORDER as readonly string[]).includes(value)
  );
}

function normalizeEffortPreference(value: unknown): WorkerEffortPreference {
  if (value === WORKER_AUTO_VALUE) {
    return WORKER_AUTO_VALUE;
  }
  return isWorkerEffort(value) ? value : WORKER_AUTO_VALUE;
}

function normalizeModelPreference(value: unknown): WorkerModelPreference {
  if (typeof value !== "string") {
    return WORKER_AUTO_VALUE;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === WORKER_AUTO_VALUE) {
    return WORKER_AUTO_VALUE;
  }
  return trimmed.slice(0, WORKER_MODEL_MAX_CHARS);
}

/**
 * Normalizes one provider's stored worker config.
 *
 * Every field degrades independently: a corrupt tool list must not discard a
 * good model choice, because the whole object is persisted inside a workspace
 * snapshot whose parse is all-or-nothing.
 */
export function normalizeWorkerProviderConfig(
  value: unknown,
): WorkerProviderConfig {
  if (!value || typeof value !== "object") {
    return {};
  }
  const candidate = value as Record<string, unknown>;
  const description = trimToLength(
    candidate.description,
    WORKER_DESCRIPTION_MAX_CHARS,
  );
  const instructions = trimToLength(
    candidate.instructions,
    WORKER_INSTRUCTIONS_MAX_CHARS,
  );
  const tools = normalizeToolList(candidate.tools);
  const maxTurns = normalizeMaxTurns(candidate.maxTurns);
  return {
    presetId: isWorkerPresetId(candidate.presetId)
      ? candidate.presetId
      : DEFAULT_WORKER_PRESET_ID,
    model: normalizeModelPreference(candidate.model),
    effort: normalizeEffortPreference(candidate.effort),
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    ...(tools ? { tools } : {}),
    ...(maxTurns !== undefined ? { maxTurns } : {}),
  };
}

export function normalizeWorkerConfigByProvider(
  value: unknown,
): Partial<Record<ProviderId, WorkerProviderConfig>> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const source = value as Record<string, unknown>;
  const result: Partial<Record<ProviderId, WorkerProviderConfig>> = {};
  for (const providerId of ["claude-code", "codex"] as const) {
    if (source[providerId] !== undefined) {
      result[providerId] = normalizeWorkerProviderConfig(source[providerId]);
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Arm state                                                                  */
/* -------------------------------------------------------------------------- */

export interface WorkerArmState {
  /** Whether this task wants a worker on its next turn. */
  enabled: boolean;
  /** The active provider's config, preset defaults filled in. */
  config: WorkerProviderConfig;
  /** True when the task decided rather than inheriting the Settings default. */
  overridden: boolean;
}

/**
 * Single resolution point for "does this task run a worker, configured how".
 *
 * Arming is a separate field from the per-provider config for the same reason
 * the Advisor splits them: keeping the remembered configuration through an off
 * state is what makes the composer toggle a real toggle rather than a
 * destructive edit.
 */
export function resolveWorkerArmState(args: {
  providerId: ProviderId;
  overrides?: WorkerArmOverrides | null;
  settingsConfig?: WorkerProviderConfig | null;
  settingsEnabled?: boolean;
}): WorkerArmState {
  const settingsConfig = normalizeWorkerProviderConfig(
    args.settingsConfig ?? {},
  );
  const taskConfig = args.overrides?.workerConfigByProvider?.[args.providerId];
  const config = taskConfig
    ? normalizeWorkerProviderConfig({ ...settingsConfig, ...taskConfig })
    : settingsConfig;
  return {
    enabled: args.overrides?.workerEnabled ?? args.settingsEnabled ?? false,
    config,
    overridden: typeof args.overrides?.workerEnabled === "boolean",
  };
}

/** Builds the per-turn intent from arm state. `null` whenever disarmed. */
export function buildWorkerRuntimeIntent(
  arm: WorkerArmState,
): WorkerRuntimeIntent | null {
  if (!arm.enabled) {
    return null;
  }
  const config = arm.config;
  return {
    mode: "task-executor",
    presetId: config.presetId ?? DEFAULT_WORKER_PRESET_ID,
    workerModel: config.model ?? WORKER_AUTO_VALUE,
    workerEffort: config.effort ?? WORKER_AUTO_VALUE,
    ...(config.description ? { description: config.description } : {}),
    ...(config.instructions ? { instructions: config.instructions } : {}),
    ...(config.tools ? { tools: config.tools } : {}),
    ...(config.maxTurns !== undefined ? { maxTurns: config.maxTurns } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Resolver                                                                   */
/* -------------------------------------------------------------------------- */

function tierIndex(model: string): number {
  const capability = getModelCapability({ model });
  return capability ? MODEL_TIER_ORDER.indexOf(capability.tier) : -1;
}

function buildCostWarning(args: {
  providerId: ProviderId;
  primaryModel: string;
  workerModel: string;
}): string | null {
  if (args.primaryModel === args.workerModel) {
    return "Worker uses the same model as the primary, so this will not reduce cost.";
  }
  const primaryTier = tierIndex(args.primaryModel);
  const workerTier = tierIndex(args.workerModel);
  if (primaryTier < 0 || workerTier < 0) {
    return null;
  }
  if (workerTier > primaryTier) {
    return `Worker (${toHumanModelName({ model: args.workerModel })}) is a higher tier than the primary, so delegating will cost more.`;
  }
  if (workerTier === primaryTier) {
    return "Worker is the same tier as the primary, so savings will be limited.";
  }
  return null;
}

function resolveWorkerEffort(args: {
  providerId: ProviderId;
  model: string;
  requested: WorkerEffortPreference;
  presetEffort: WorkerEffort;
}): WorkerEffort | null {
  const supported = listWorkerEffortsForModel({
    providerId: args.providerId,
    model: args.model,
  });
  if (supported.length === 0) {
    // The model rejects the field outright — sending anything would error.
    return null;
  }
  const desired =
    args.requested === WORKER_AUTO_VALUE ? args.presetEffort : args.requested;
  if (supported.includes(desired)) {
    return desired;
  }
  if (args.providerId === "codex") {
    const clamped = clampCodexEffortToModel({
      model: args.model,
      effort: desired,
    });
    return clamped === "minimal" ? "low" : clamped;
  }
  // Claude: step down to the highest supported tier at or below the request,
  // matching the direction the Codex clamp moves.
  const requestedIndex = WORKER_EFFORT_ORDER.indexOf(desired);
  for (let index = requestedIndex; index >= 0; index -= 1) {
    const candidate = WORKER_EFFORT_ORDER[index];
    if (candidate && supported.includes(candidate)) {
      return candidate;
    }
  }
  return supported[supported.length - 1] ?? null;
}

/**
 * The single semantic gate for Worker mode.
 *
 * Zod proves the payload's shape at the IPC boundary; this proves the payload
 * makes sense for the provider, primary model, and installed runtime. Both the
 * renderer (to label and to disable) and the main process (to build the native
 * call) resolve through here, so the composer can never promise a worker the
 * turn would not actually run.
 *
 * An explicit choice that is no longer valid returns `unavailable` rather than
 * quietly substituting another model — a silent swap would bill a different
 * tier than the one on screen.
 */
export function resolveWorkerProfile(args: {
  providerId: ProviderId;
  primaryModel: string;
  intent?: WorkerRuntimeIntent | null;
}): WorkerResolution {
  if (!args.intent || args.intent.mode !== "task-executor") {
    return { status: "off" };
  }
  const providerId = args.providerId;
  const capability = WORKER_CAPABILITIES[providerId];
  if (!capability) {
    return {
      status: "unavailable",
      reason: "provider_capability_unavailable",
      detail: "This provider does not support Worker mode.",
    };
  }

  const primaryModel = args.primaryModel.trim();
  if (!canPrimaryOrchestrateWorker({ providerId, model: primaryModel })) {
    return {
      status: "unavailable",
      reason: "primary_not_supported",
      detail: `${toHumanModelName({ model: primaryModel })} cannot orchestrate a worker. Switch to ${capability.primaries
        .map((model) => toHumanModelName({ model }))
        .join(", ")}.`,
    };
  }

  const preset = getWorkerPreset(args.intent.presetId);
  const requestedWorkerModel = normalizeModelPreference(
    args.intent.workerModel,
  );
  const resolvedWorkerModel =
    requestedWorkerModel === WORKER_AUTO_VALUE
      ? (preset.autoModel[providerId] ?? DEFAULT_WORKER_MODEL[providerId])
      : requestedWorkerModel;

  if (!isWorkerCapableModel({ providerId, model: resolvedWorkerModel })) {
    // Distinguish "never existed for this provider" from "exists but cannot
    // work", so the UI can say whether reselection or a provider switch is the
    // fix.
    const knownForProvider = (
      getSdkModelOptions({ providerId }) as readonly string[]
    ).includes(resolvedWorkerModel);
    return {
      status: "unavailable",
      reason: knownForProvider
        ? "worker_model_not_supported"
        : "worker_model_not_found",
      detail: knownForProvider
        ? `${toHumanModelName({ model: resolvedWorkerModel })} cannot run as a worker on this provider. Pick another worker model.`
        : `${resolvedWorkerModel} is not a known ${providerId} model. Pick another worker model.`,
    };
  }

  const requestedWorkerEffort = normalizeEffortPreference(
    args.intent.workerEffort,
  );
  const resolvedWorkerEffort = resolveWorkerEffort({
    providerId,
    model: resolvedWorkerModel,
    requested: requestedWorkerEffort,
    presetEffort: preset.autoEffort[providerId],
  });

  const overrideTools = normalizeToolList(args.intent.tools);
  const tools = overrideTools ?? preset.tools ?? null;

  return {
    status: "ready",
    profile: {
      provider: providerId,
      primaryModel,
      workerName: WORKER_AGENT_NAME,
      presetId: preset.id,
      requestedWorkerModel,
      resolvedWorkerModel,
      requestedWorkerEffort,
      resolvedWorkerEffort,
      description:
        trimToLength(args.intent.description, WORKER_DESCRIPTION_MAX_CHARS) ??
        preset.description,
      instructions:
        trimToLength(args.intent.instructions, WORKER_INSTRUCTIONS_MAX_CHARS) ??
        preset.instructions,
      tools: tools ? [...tools] : null,
      toolsEnforced: capability.toolsEnforced,
      maxTurns:
        normalizeMaxTurns(args.intent.maxTurns) ?? preset.maxTurns ?? null,
      maxConcurrency: WORKER_MAX_CONCURRENCY,
      foreground: true,
      costWarning: buildCostWarning({
        providerId,
        primaryModel,
        workerModel: resolvedWorkerModel,
      }),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

/** Compact label for the runtime bar, e.g. `Verified patch · Luna · max`. */
export function formatWorkerRuntimeStatusValue(
  resolution: WorkerResolution,
): string {
  if (resolution.status === "off") {
    return "Off";
  }
  if (resolution.status === "unavailable") {
    return "Unavailable";
  }
  const { profile } = resolution;
  const parts = [
    getWorkerPreset(profile.presetId).label,
    toHumanModelName({ model: profile.resolvedWorkerModel }),
  ];
  if (profile.resolvedWorkerEffort) {
    parts.push(profile.resolvedWorkerEffort);
  }
  return parts.join(" · ");
}

/**
 * The primary-facing instruction that makes delegation actually happen.
 *
 * Both adapters inject this, so the two providers describe the same contract:
 * plan, delegate one bounded brief, then review and integrate. Kept here rather
 * than duplicated per adapter so the two can never drift.
 */
export function buildWorkerPrimaryInstructions(
  profile: ResolvedWorkerProfile,
): string {
  const workerLabel = toHumanModelName({
    model: profile.resolvedWorkerModel,
  });
  const lines = [
    "## Worker mode",
    "",
    `Worker mode is on. A task-executor subagent (${workerLabel}${
      profile.resolvedWorkerEffort
        ? `, ${profile.resolvedWorkerEffort} effort`
        : ""
    }) is available to do bounded implementation work for you.`,
    "",
    "You remain responsible for the result. Your job is to plan, delegate, then verify and integrate:",
    "",
    "1. Decide what needs to happen and which part is bounded enough to hand off.",
    `2. Delegate that part to ${
      profile.provider === "claude-code"
        ? `the \`${profile.workerName}\` agent`
        : "one spawned worker agent"
    } as a single, complete, unambiguous brief. Name the files it may touch and how to verify the result. The worker starts with no view of this conversation, so the brief must stand alone.`,
    `3. Run at most ${profile.maxConcurrency} worker at a time, and do not edit the files it is working on while it runs.`,
    "4. When it returns, review its diff and its verification evidence yourself. Do not forward its claims to the user unchecked.",
    "5. Integrate, fix anything it got wrong, and write the final response.",
    "",
    "Keep work you can finish faster yourself. Delegating a one-line edit costs more than doing it.",
  ];
  if (!profile.toolsEnforced && profile.tools && profile.tools.length > 0) {
    lines.push(
      "",
      `Tell the worker to stay within these tools: ${profile.tools.join(", ")}.`,
    );
  }
  return lines.join("\n");
}

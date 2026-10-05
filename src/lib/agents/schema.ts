import { i18n } from "@/i18n/runtime";
import { z } from "zod";
import { TASK_CLASSES } from "@/lib/providers/auto-routing-profile";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  CHECK_IN_LABELS,
  CHECK_INS,
  MAX_WORKFLOW_STAGES,
  WorkflowStageSchema,
  listWorkflowStructureIssues,
  type CheckIns,
} from "@/lib/workflows/schema";

/**
 * An agent config is a saved worker definition: who does the work. The
 * product calls it an "Agent" (built-in or custom); code says `AgentConfig`
 * because `AgentDefinition` is the Claude Agent SDK's subagent type and
 * `agentId` already names provider workers on normalized events.
 *
 * A saved agent grants no permissions and starts nothing: saving or editing
 * one never creates a workspace, a task or a process. Every start records its
 * own consent and runs against a snapshot taken at start time.
 *
 * Field names follow the agent files providers already read (name,
 * description, instructions, model, tools) so import and export stay 1:1.
 */

export const AGENT_CONFIG_VERSION = 1 as const;
export const MAX_AGENT_CONFIGS = 50;

export const AGENT_CONFIG_LIMITS = {
  id: 80,
  name: 80,
  description: 600,
  avoidWhen: 600,
  instructions: 8_000,
  skillRef: 200,
  skills: 20,
  model: 200,
  toolName: 120,
  tools: 40,
  turnsMin: 1,
  turnsMax: 200,
  concurrencyMin: 1,
  concurrencyMax: 8,
  sourcePath: 1_024,
} as const;

export const DEFAULT_AGENT_CONCURRENCY = 2;

/**
 * Where an agent can be used. The words are the auto-routing roles Stave
 * already has, so one vocabulary covers routing and agents:
 * - `primary`: the main agent of a task, or an agent run's lead task.
 * - `worker`: an in-turn subagent inside another agent's turn.
 * - `delegate`: a durable subagent, its own task on the run ledger.
 */
export const AGENT_ROLES = ["primary", "worker", "delegate"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_ROLE_LABELS: Readonly<Record<AgentRole, string>> = {
  get primary() { return i18n.t("agents:schema.primary"); },
  get worker() { return i18n.t("agents:schema.worker"); },
  get delegate() { return i18n.t("agents:schema.delegate"); },
};

/** Effort tiers an agent may fix, low to high, across both providers' scales. */
export const AGENT_EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
export type AgentEffort = (typeof AGENT_EFFORT_ORDER)[number];

/** Same words as a delegated task's workspace strategy. */
export const AGENT_WORKSPACES = ["new-worktree", "same-workspace"] as const;
export type AgentWorkspace = (typeof AGENT_WORKSPACES)[number];

export const AGENT_WORKSPACE_LABELS: Readonly<Record<AgentWorkspace, string>> = {
  get "new-worktree"() { return i18n.t("agents:schema.newWorktree"); },
  get "same-workspace"() { return i18n.t("agents:schema.sameWorkspace"); },
};

/**
 * A default only: the assign sheet preselects it, the start records consent.
 * `manual`/`guided`/`auto` are the permission modes Stave already shows;
 * `read-only` adds "never edit".
 */
export const AGENT_PERMISSIONS = ["read-only", "manual", "guided", "auto"] as const;
export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];

export const AGENT_PERMISSION_LABELS: Readonly<Record<AgentPermission, string>> = {
  get "read-only"() { return i18n.t("agents:schema.readOnly"); },
  get manual() { return i18n.t("agents:schema.manual"); },
  get guided() { return i18n.t("agents:schema.guided"); },
  get auto() { return i18n.t("agents:schema.auto"); },
};

/** Sections the agent's report must contain. */
export const AGENT_REPORT_SECTIONS = [
  "summary",
  "changes",
  "verification",
  "findings",
  "sources",
  "decisions",
  "risks",
  "limitations",
] as const;
export type AgentReportSection = (typeof AGENT_REPORT_SECTIONS)[number];

/**
 * The named hues an agent's avatar can take. Each maps to an existing
 * `--ads-chart-*` token, so a theme moves the avatar colours with the rest of
 * its palette and no new colour token is added. The mapping and the derived
 * default live in `agent-appearance.ts`.
 */
export const AGENT_COLORS = [
  "blue",
  "orange",
  "green",
  "violet",
  "amber",
  "red",
  "purple",
  "cyan",
] as const;
export type AgentColor = (typeof AGENT_COLORS)[number];

/**
 * "Check in with me": when an agent with a workflow waits for the user
 * between stages. The values are the agent run engine's check-in levels; a
 * stage that writes outside the workspace (a publish stage or a Stave action)
 * runs without asking only under `when-stuck`, the default.
 */
export const DEFAULT_AGENT_CHECK_INS: CheckIns = "when-stuck";

/** The check-in words an agent and its runs share. */
export const AGENT_CHECK_IN_LABELS: Readonly<Record<CheckIns, string>> = CHECK_IN_LABELS;

/**
 * A workflow: the ordered stages a run of this agent follows, each an AI
 * stage (instruction, done when, optionally done by another agent) or a Stave
 * action (open draft PR, watch checks, ready for review, run script). The
 * stage schema is the agent run engine's own.
 */
export const AgentWorkflowSchema = z.array(WorkflowStageSchema).min(1).max(MAX_WORKFLOW_STAGES);
export type AgentWorkflow = z.infer<typeof AgentWorkflowSchema>;

export const AGENT_SOURCES = ["builtin", "custom", "repository"] as const;
export type AgentSource = (typeof AGENT_SOURCES)[number];

export const AGENT_SOURCE_LABELS: Readonly<Record<AgentSource, string>> = {
  builtin: "Built-in",
  get custom() { return i18n.t("agents:schema.custom"); },
  get repository() { return i18n.t("agents:schema.repository"); },
};

export const AGENT_FILE_FORMATS = [
  "claude-md",
  "codex-toml",
  "kiro-json",
  "kiro-md",
  "cursor-md",
  "copilot-md",
] as const;
export type AgentFileFormat = (typeof AGENT_FILE_FORMATS)[number];

const PROVIDER_IDS = listProviderIds() as [ProviderId, ...ProviderId[]];

/** Letters, digits, dot, underscore and hyphen — safe inside keys and paths. */
export const AgentConfigIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(AGENT_CONFIG_LIMITS.id)
  .regex(
    /^[A-Za-z0-9._-]+$/,
    { error: () => i18n.t("agents:schema.extraCopy400") },
  );

export const AgentModelSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("fixed"),
      providerId: z.enum(PROVIDER_IDS),
      model: z.string().trim().min(1).max(AGENT_CONFIG_LIMITS.model).optional(),
      effort: z.enum(AGENT_EFFORT_ORDER).optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("auto"),
      /** Routed through the user's auto-routing rules when set. */
      taskClass: z.enum(TASK_CLASSES).optional(),
    })
    .strict(),
]);
export type AgentModel = z.infer<typeof AgentModelSchema>;

const ToolNameSchema = z.string().trim().min(1).max(AGENT_CONFIG_LIMITS.toolName);

export const AgentToolsSchema = z
  .object({
    /** Allowlist. Absent means every tool the runtime offers. */
    allow: z.array(ToolNameSchema).max(AGENT_CONFIG_LIMITS.tools).optional(),
    /** Denylist, applied before the allowlist. */
    deny: z.array(ToolNameSchema).max(AGENT_CONFIG_LIMITS.tools).optional(),
    maxTurns: z
      .number()
      .int()
      .min(AGENT_CONFIG_LIMITS.turnsMin)
      .max(AGENT_CONFIG_LIMITS.turnsMax)
      .optional(),
  })
  .strict();
export type AgentTools = z.infer<typeof AgentToolsSchema>;

export const AgentFileOriginSchema = z
  .object({
    /** Repository-relative path of the file the agent was imported from. */
    path: z.string().trim().min(1).max(AGENT_CONFIG_LIMITS.sourcePath),
    format: z.enum(AGENT_FILE_FORMATS),
    contentHash: z.string().trim().min(1).max(200),
  })
  .strict();
export type AgentFileOrigin = z.infer<typeof AgentFileOriginSchema>;

export const AgentAppearanceSchema = z
  .object({
    /**
     * Chosen avatar hue. Absent means the avatar derives a stable colour from
     * the id, so an agent saved before this field still looks the same on
     * every load without a migration.
     */
    color: z.enum(AGENT_COLORS).optional(),
  })
  .strict();
export type AgentAppearance = z.infer<typeof AgentAppearanceSchema>;

export const AgentConfigSchema = z
  .object({
    version: z.literal(AGENT_CONFIG_VERSION),
    id: AgentConfigIdSchema,
    source: z.enum(AGENT_SOURCES),
    name: z.string().trim().min(1).max(AGENT_CONFIG_LIMITS.name),
    /** "Use when": when to assign work to this agent. A trigger, not a bio. */
    description: z.string().trim().min(1).max(AGENT_CONFIG_LIMITS.description),
    /** "Don't use when". */
    avoidWhen: z.string().trim().max(AGENT_CONFIG_LIMITS.avoidWhen).optional(),
    instructions: z.string().trim().min(1).max(AGENT_CONFIG_LIMITS.instructions),
    skills: z
      .array(z.string().trim().min(1).max(AGENT_CONFIG_LIMITS.skillRef))
      .max(AGENT_CONFIG_LIMITS.skills)
      .default([]),
    model: AgentModelSchema,
    tools: AgentToolsSchema.default({}),
    permission: z.enum(AGENT_PERMISSIONS),
    workspace: z.enum(AGENT_WORKSPACES),
    report: z.array(z.enum(AGENT_REPORT_SECTIONS)).min(1).max(AGENT_REPORT_SECTIONS.length),
    usableAs: z.array(z.enum(AGENT_ROLES)).min(1).max(AGENT_ROLES.length),
    /**
     * The agents a task running as this agent may delegate to. Absent: any
     * agent. An empty list: none. Checked when the delegation is made.
     */
    canCall: z.array(AgentConfigIdSchema).max(MAX_AGENT_CONFIGS).optional(),
    concurrency: z
      .number()
      .int()
      .min(AGENT_CONFIG_LIMITS.concurrencyMin)
      .max(AGENT_CONFIG_LIMITS.concurrencyMax)
      .default(DEFAULT_AGENT_CONCURRENCY),
    /** Built-in Worker preset this agent mirrors, when it is one. */
    workerPresetId: z.string().trim().min(1).max(AGENT_CONFIG_LIMITS.id).optional(),
    /** Absent: a run is one "Work" stage. */
    workflow: AgentWorkflowSchema.optional(),
    /** Absent: only when stuck. */
    checkIns: z.enum(CHECK_INS).optional(),
    /** Optional profile identity (avatar colour). Absent stays valid. */
    appearance: AgentAppearanceSchema.optional(),
    origin: AgentFileOriginSchema.optional(),
    archived: z.boolean().default(false),
  })
  .strict()
  .superRefine((agent, ctx) => {
    if (new Set(agent.usableAs).size !== agent.usableAs.length) {
      ctx.addIssue({ code: "custom", path: ["usableAs"], message: i18n.t("agents:schema.message") });
    }
    if (agent.canCall && new Set(agent.canCall).size !== agent.canCall.length) {
      ctx.addIssue({ code: "custom", path: ["canCall"], message: i18n.t("agents:schema.message2") });
    }
    if (new Set(agent.report).size !== agent.report.length) {
      ctx.addIssue({ code: "custom", path: ["report"], message: i18n.t("agents:schema.message3") });
    }
    // A read-only agent that gets its own worktree has nothing to write there.
    if (agent.permission === "read-only" && agent.workspace === "new-worktree") {
      ctx.addIssue({
        code: "custom",
        path: ["workspace"],
        message: i18n.t("agents:schema.message4"),
      });
    }
    if (agent.source === "builtin" && agent.origin) {
      ctx.addIssue({ code: "custom", path: ["origin"], message: i18n.t("agents:schema.message5") });
    }
    if (agent.source === "repository" && !agent.origin) {
      ctx.addIssue({ code: "custom", path: ["origin"], message: i18n.t("agents:schema.message6") });
    }
    if (agent.workflow) {
      for (const issue of listWorkflowStructureIssues({ purpose: "", stages: agent.workflow })) {
        ctx.addIssue({ code: "custom", message: issue.message, path: ["workflow", ...issue.path.slice(1)] });
      }
    }
    const deny = new Set(agent.tools.deny ?? []);
    const overlap = (agent.tools.allow ?? []).filter((tool) => deny.has(tool));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["tools"],
        message: i18n.t("agents:schema.message7", { value1: overlap.join(", ") }),
      });
    }
  });
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentConfigInput = z.input<typeof AgentConfigSchema>;

export const AgentConfigListSchema = z
  .array(AgentConfigSchema)
  .max(MAX_AGENT_CONFIGS)
  .superRefine((agents, ctx) => {
    const seen = new Set<string>();
    agents.forEach((agent, index) => {
      if (seen.has(agent.id)) {
        ctx.addIssue({ code: "custom", path: [index, "id"], message: i18n.t("agents:schema.message8", { value1: agent.id }) });
      }
      seen.add(agent.id);
    });
  });

export function parseAgentConfig(input: unknown) {
  return AgentConfigSchema.safeParse(input);
}

export function isUsableAs(agent: AgentConfig, role: AgentRole) {
  return agent.usableAs.includes(role);
}

import { z } from "zod";

/**
 * Claude Code and Codex sessions running outside Stave (a `claude` or `codex`
 * process in a terminal, another app), read from the transcript files those
 * tools write. Electron main reads them only while a renderer subscribes, and
 * a renderer subscribes only while Settings > General > Activity outside
 * Stave is on. Everything stays in memory; nothing is written or sent.
 */
export const EXTERNAL_SESSIONS_IPC = {
  SNAPSHOT: "external-sessions:snapshot",
  CHANGED: "external-sessions:changed",
  SUBSCRIBE: "external-sessions:subscribe",
  UNSUBSCRIBE: "external-sessions:unsubscribe",
} as const;

/**
 * `count`: only the 10 s folder scan that feeds the sidebar badge.
 * `live`: the Activity page is open, so transcripts are followed as they grow.
 */
export const ExternalSessionsModeSchema = z.enum(["count", "live"]);
export type ExternalSessionsMode = z.infer<typeof ExternalSessionsModeSchema>;

export const ExternalSessionsSubscribeArgsSchema = z
  .object({ mode: ExternalSessionsModeSchema })
  .strict();
export type ExternalSessionsSubscribeArgs = z.infer<typeof ExternalSessionsSubscribeArgsSchema>;

export const ExternalSessionSourceSchema = z.enum(["claude-code", "codex"]);
export type ExternalSessionSource = z.infer<typeof ExternalSessionSourceSchema>;

/** `waiting`: the last answer ended its turn. `working`: written in the last five minutes. */
export const ExternalSessionStatusSchema = z.enum(["working", "waiting", "idle"]);
export type ExternalSessionStatus = z.infer<typeof ExternalSessionStatusSchema>;

export const ExternalAgentStatusSchema = z.enum(["running", "finished", "failed", "stopped", "idle"]);
export type ExternalAgentStatus = z.infer<typeof ExternalAgentStatusSchema>;

/**
 * What a session or agent is doing, as a verb and its object. The renderer
 * words it in the display language ("Reading src/app.ts"); main never builds
 * user-facing sentences.
 */
export const ExternalActionVerbSchema = z.enum([
  "read",
  "edit",
  "write",
  "run",
  "search",
  "find",
  "list",
  "fetch",
  "webSearch",
  "agent",
  "plan",
  "skill",
  "message",
  "tool",
]);
export type ExternalActionVerb = z.infer<typeof ExternalActionVerbSchema>;

export const ExternalActionSchema = z.object({
  verb: ExternalActionVerbSchema,
  /** Redacted and clipped: a path relative to the session folder, a command, a query. */
  target: z.string().max(400).optional(),
  /** The tool's own name for `tool` (an MCP tool, an unknown built-in). */
  tool: z.string().max(120).optional(),
});
export type ExternalAction = z.infer<typeof ExternalActionSchema>;

export const ExternalAgentSchema = z.object({
  id: z.string().max(200),
  /** The agent type Claude Code records ("general-purpose", "Explore"). */
  agentType: z.string().max(200),
  description: z.string().max(400),
  status: ExternalAgentStatusSchema,
  startedAt: z.number(),
  lastAt: z.number(),
  action: ExternalActionSchema.optional(),
  steps: z.number().int().nonnegative(),
  contextTokens: z.number().int().nonnegative().optional(),
});
export type ExternalAgent = z.infer<typeof ExternalAgentSchema>;

export const ExternalSessionSchema = z.object({
  /** Native session id (the transcript's file name or the rollout's id). */
  id: z.string().max(200),
  source: ExternalSessionSourceSchema,
  title: z.string().max(400).optional(),
  cwd: z.string().max(4096).optional(),
  branch: z.string().max(400).optional(),
  status: ExternalSessionStatusSchema,
  startedAt: z.number().optional(),
  lastAt: z.number(),
  action: ExternalActionSchema.optional(),
  steps: z.number().int().nonnegative(),
  contextTokens: z.number().int().nonnegative().optional(),
  model: z.string().max(200).optional(),
  agents: z.array(ExternalAgentSchema).max(12),
});
export type ExternalSession = z.infer<typeof ExternalSessionSchema>;

export const ExternalSessionsSnapshotSchema = z.object({
  /** `off`: nothing is being read. */
  state: z.enum(["off", "count", "live"]),
  generatedAt: z.number(),
  /** Sessions working plus sub-agents running. */
  runningCount: z.number().int().nonnegative(),
  /** Filled only in `live`; the badge scan keeps no session detail. */
  sessions: z.array(ExternalSessionSchema).max(30),
});
export type ExternalSessionsSnapshot = z.infer<typeof ExternalSessionsSnapshotSchema>;

export const EXTERNAL_SESSIONS_OFF_SNAPSHOT: ExternalSessionsSnapshot = Object.freeze({
  state: "off",
  generatedAt: 0,
  runningCount: 0,
  sessions: [],
}) as ExternalSessionsSnapshot;

/** Sessions working plus agents running: the number the badge and header show. */
export function countRunningExternalWork(sessions: readonly Pick<ExternalSession, "status" | "agents">[]) {
  let count = 0;
  for (const session of sessions) {
    if (session.status === "working") count += 1;
    for (const agent of session.agents) if (agent.status === "running") count += 1;
  }
  return count;
}

/**
 * Which watcher a renderer asks for: none while the setting is off, the live
 * one while the Activity page is open, otherwise the badge scan.
 */
export function resolveExternalSessionsMode(args: { enabled: boolean; pageOpen: boolean }): ExternalSessionsMode | null {
  if (!args.enabled) return null;
  return args.pageOpen ? "live" : "count";
}

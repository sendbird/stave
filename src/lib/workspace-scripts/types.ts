// ---------------------------------------------------------------------------
// Workspace Scripts – Shared Types
// ---------------------------------------------------------------------------

// ---- Legacy lifecycle scripts ---------------------------------------------

/** Legacy lifecycle phases preserved for `.stave/scripts.json` compatibility. */
export type ScriptPhase = "setup" | "run" | "teardown";

/**
 * `.stave/scripts.json` — the legacy, team-shared config.
 *
 * The new scripts layer still supports this shape and normalizes it into
 * actions, services, and hooks.
 */
export interface LegacyWorkspaceScriptsConfig {
  version: 1;
  setup?: string[];
  run?: string[];
  teardown?: string[];
}

/**
 * `.stave/scripts.local.json` — legacy, per-developer overrides.
 *
 * - Plain array replaces the base commands entirely.
 * - `{ before, after }` wraps the base commands.
 */
export type LocalPhaseOverride = string[] | { before?: string[]; after?: string[] };

export interface LegacyWorkspaceScriptsLocalConfig {
  version: 1;
  setup?: LocalPhaseOverride;
  run?: LocalPhaseOverride;
  teardown?: LocalPhaseOverride;
}

/** Fully resolved legacy commands for the three lifecycle phases. */
export interface ResolvedLegacyScriptsConfig {
  setup: string[];
  run: string[];
  teardown: string[];
}

// ---- Workspace scripts ----------------------------------------------------

export type ScriptKind = "action" | "service";
export type ScriptTargetScope = "workspace" | "project";
export type ScriptTrigger =
  | "task.created"
  | "task.archiving"
  | "turn.started"
  | "turn.completed"
  | "pr.beforeOpen"
  | "pr.afterOpen";

export interface ScriptHookContext {
  taskId?: string;
  taskTitle?: string;
  turnId?: string;
}

export interface WorkspaceScriptTargetConfig {
  label?: string;
  cwd?: ScriptTargetScope;
  env?: Record<string, string>;
  shell?: string;
}

export interface WorkspaceScriptOrbitConfig {
  enabled?: boolean;
  name?: string;
  noTls?: boolean;
  proxyPort?: number;
}

export interface ResolvedWorkspaceScriptOrbitConfig {
  name?: string;
  noTls: boolean;
  proxyPort?: number;
}

interface WorkspaceScriptEntryConfigBase {
  label?: string;
  description?: string;
  commands: string[];
  target?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface WorkspaceScriptActionConfig extends WorkspaceScriptEntryConfigBase {}

export interface WorkspaceScriptServiceConfig extends WorkspaceScriptEntryConfigBase {
  restartOnRun?: boolean;
  orbit?: WorkspaceScriptOrbitConfig;
}

export type WorkspaceScriptHookRef =
  | string
  | {
      ref: string;
      kind?: ScriptKind;
      blocking?: boolean;
    };

export interface WorkspaceScriptsConfig {
  version: 2;
  actions?: Record<string, WorkspaceScriptActionConfig>;
  services?: Record<string, WorkspaceScriptServiceConfig>;
  hooks?: Partial<Record<ScriptTrigger, WorkspaceScriptHookRef[]>>;
  targets?: Record<string, WorkspaceScriptTargetConfig>;
}

export interface WorkspaceScriptsLocalConfig {
  version: 2;
  actions?: Record<string, Partial<WorkspaceScriptActionConfig>>;
  services?: Record<string, Partial<WorkspaceScriptServiceConfig>>;
  hooks?: Partial<Record<ScriptTrigger, WorkspaceScriptHookRef[]>>;
  targets?: Record<string, Partial<WorkspaceScriptTargetConfig>>;
}

export interface ResolvedScriptTarget {
  id: string;
  label: string;
  cwd: ScriptTargetScope;
  env: Record<string, string>;
  shell?: string;
}

export interface ResolvedWorkspaceScript {
  id: string;
  kind: ScriptKind;
  label: string;
  description: string;
  commands: string[];
  targetId: string;
  target: ResolvedScriptTarget;
  timeoutMs?: number;
  restartOnRun?: boolean;
  orbit?: ResolvedWorkspaceScriptOrbitConfig;
  source: "script" | "legacy";
}

export interface ResolvedWorkspaceScriptHook {
  trigger: ScriptTrigger;
  scriptId: string;
  scriptKind: ScriptKind;
  blocking: boolean;
}

export interface ResolvedWorkspaceScriptsConfig {
  actions: ResolvedWorkspaceScript[];
  services: ResolvedWorkspaceScript[];
  hooks: Partial<Record<ScriptTrigger, ResolvedWorkspaceScriptHook[]>>;
  targets: Record<string, ResolvedScriptTarget>;
  legacyPhases: ResolvedLegacyScriptsConfig;
}

export type WorkspaceScriptRunSource =
  | { kind: "manual" }
  | { kind: "hook"; trigger: ScriptTrigger };

export type WorkspaceScriptEvent =
  | {
      type: "started";
      commandIndex: number;
      command: string;
      totalCommands: number;
    }
  | { type: "orbit-url"; url: string }
  | { type: "output"; data: string }
  | { type: "command-completed"; commandIndex: number; exitCode: number }
  | { type: "completed"; exitCode: number }
  | { type: "error"; error: string }
  | { type: "stopped" };

export interface WorkspaceScriptEventEnvelope {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
  runId: string;
  sessionId?: string;
  source: WorkspaceScriptRunSource;
  event: WorkspaceScriptEvent;
}

export interface WorkspaceScriptStatusEntry {
  scriptId: string;
  scriptKind: ScriptKind;
  running: boolean;
  log: string;
  runId?: string;
  sessionId?: string;
  error?: string;
  orbitUrl?: string;
  source?: WorkspaceScriptRunSource;
}

export interface WorkspaceScriptHookRunSummary {
  trigger: ScriptTrigger;
  totalEntries: number;
  executedEntries: number;
  failures: Array<{ scriptId: string; message: string }>;
}

// ---- Legacy renderer state kept for compatibility ------------------------

export type PhaseExecutionStatus = "idle" | "running" | "success" | "error";

export interface PhaseExecutionState {
  status: PhaseExecutionStatus;
  terminalSessionId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  currentCommandIndex?: number;
  totalCommands?: number;
}

export interface WorkspaceScriptStatus {
  setup: PhaseExecutionState;
  run: PhaseExecutionState;
  teardown: PhaseExecutionState;
}

export type ScriptPhaseEvent =
  | { type: "started"; commandIndex: number; command: string; totalCommands: number }
  | { type: "output"; data: string }
  | { type: "command-completed"; commandIndex: number; exitCode: number }
  | { type: "phase-completed"; exitCode: number }
  | { type: "phase-error"; error: string };

export interface ScriptPhaseEventEnvelope {
  workspaceId: string;
  phase: ScriptPhase;
  event: ScriptPhaseEvent;
}

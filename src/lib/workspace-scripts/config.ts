// ---------------------------------------------------------------------------
// Workspace Scripts – Config Resolution
// ---------------------------------------------------------------------------

import {
  SCRIPT_TRIGGER_IDS,
  DEFAULT_SCRIPT_TARGET_IDS,
} from "./constants";
import type {
  ScriptKind,
  ScriptTrigger,
  ResolvedScriptTarget,
  ResolvedWorkspaceScriptOrbitConfig,
  ResolvedWorkspaceScript,
  ResolvedWorkspaceScriptHook,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptActionConfig,
  WorkspaceScriptHookRef,
  WorkspaceScriptServiceConfig,
  WorkspaceScriptsConfig,
  WorkspaceScriptsLocalConfig,
  WorkspaceScriptTargetConfig,
} from "./types";

function humanizeId(value: string) {
  return value
    .replaceAll(/[._:-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function createDefaultScriptTargets(): Record<string, ResolvedScriptTarget> {
  return {
    [DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE]: {
      id: DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE,
      label: "Workspace",
      cwd: "workspace",
      env: {},
    },
    [DEFAULT_SCRIPT_TARGET_IDS.PROJECT]: {
      id: DEFAULT_SCRIPT_TARGET_IDS.PROJECT,
      label: "Project",
      cwd: "project",
      env: {},
    },
  };
}

function mergeTargetRecord(
  base: Record<string, WorkspaceScriptTargetConfig> | undefined,
  local: Record<string, Partial<WorkspaceScriptTargetConfig>> | undefined,
): Record<string, WorkspaceScriptTargetConfig> {
  const result: Record<string, WorkspaceScriptTargetConfig> = { ...(base ?? {}) };
  for (const [targetId, patch] of Object.entries(local ?? {})) {
    result[targetId] = {
      ...(result[targetId] ?? {}),
      ...patch,
      env: {
        ...(result[targetId]?.env ?? {}),
        ...(patch.env ?? {}),
      },
    };
  }
  return result;
}

function mergeActionRecord(
  base: Record<string, WorkspaceScriptActionConfig> | undefined,
  local: Record<string, Partial<WorkspaceScriptActionConfig>> | undefined,
): Record<string, WorkspaceScriptActionConfig> {
  const result: Record<string, WorkspaceScriptActionConfig> = { ...(base ?? {}) };
  for (const [entryId, patch] of Object.entries(local ?? {})) {
    result[entryId] = {
      ...(result[entryId] ?? { commands: [] }),
      ...patch,
      commands: patch.commands ?? result[entryId]?.commands ?? [],
    };
  }
  return result;
}

function mergeServiceRecord(
  base: Record<string, WorkspaceScriptServiceConfig> | undefined,
  local: Record<string, Partial<WorkspaceScriptServiceConfig>> | undefined,
): Record<string, WorkspaceScriptServiceConfig> {
  const result: Record<string, WorkspaceScriptServiceConfig> = { ...(base ?? {}) };
  for (const [entryId, patch] of Object.entries(local ?? {})) {
    const nextOrbit = result[entryId]?.orbit || patch.orbit
      ? {
          ...(result[entryId]?.orbit ?? {}),
          ...(patch.orbit ?? {}),
        }
      : undefined;
    result[entryId] = {
      ...(result[entryId] ?? { commands: [] }),
      ...patch,
      commands: patch.commands ?? result[entryId]?.commands ?? [],
      ...(nextOrbit ? { orbit: nextOrbit } : {}),
    };
  }
  return result;
}

export function mergeScriptsConfig(
  base: WorkspaceScriptsConfig | null,
  local: WorkspaceScriptsLocalConfig | null,
): WorkspaceScriptsConfig | null {
  if (!base && !local) {
    return null;
  }
  return {
    version: 2,
    actions: mergeActionRecord(base?.actions, local?.actions),
    services: mergeServiceRecord(base?.services, local?.services),
    hooks: {
      ...(base?.hooks ?? {}),
      ...(local?.hooks ?? {}),
    },
    targets: mergeTargetRecord(base?.targets, local?.targets),
  };
}

function normalizeTargetMap(
  targets: Record<string, WorkspaceScriptTargetConfig> | undefined,
): Record<string, ResolvedScriptTarget> {
  const nextTargets = createDefaultScriptTargets();
  for (const [targetId, target] of Object.entries(targets ?? {})) {
    nextTargets[targetId] = {
      id: targetId,
      label: target.label?.trim() || humanizeId(targetId),
      cwd: target.cwd ?? nextTargets[targetId]?.cwd ?? "workspace",
      env: { ...(nextTargets[targetId]?.env ?? {}), ...(target.env ?? {}) },
      shell: target.shell ?? nextTargets[targetId]?.shell,
    };
  }
  return nextTargets;
}

function normalizeOrbitConfig(
  orbit: WorkspaceScriptServiceConfig["orbit"],
): ResolvedWorkspaceScriptOrbitConfig | undefined {
  if (!orbit || orbit.enabled === false) {
    return undefined;
  }

  return {
    ...(orbit.name?.trim() ? { name: orbit.name.trim() } : {}),
    noTls: orbit.noTls ?? false,
    ...(orbit.proxyPort ? { proxyPort: orbit.proxyPort } : {}),
  };
}

function normalizeEntryDescription(args: {
  entryId: string;
  entry: WorkspaceScriptActionConfig | WorkspaceScriptServiceConfig;
  kind: ScriptKind;
}) {
  if (args.entry.description?.trim()) {
    return args.entry.description.trim();
  }
  if (args.kind === "service") {
    return "Long-running script service.";
  }
  return "Runnable workspace script.";
}

function normalizeEntries(
  args: {
    entries: Record<string, WorkspaceScriptActionConfig | WorkspaceScriptServiceConfig> | undefined;
    kind: ScriptKind;
    targets: Record<string, ResolvedScriptTarget>;
  },
): ResolvedWorkspaceScript[] {
  const fallbackTarget = args.targets[DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE];
  const resolvedEntries: ResolvedWorkspaceScript[] = [];

  for (const [entryId, entry] of Object.entries(args.entries ?? {})) {
    const commands = (entry.commands ?? []).map((command) => command.trim()).filter(Boolean);
    if (entry.enabled === false || commands.length === 0 || !fallbackTarget) {
      continue;
    }
    const targetId = entry.target?.trim() || DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE;
    const target = args.targets[targetId] ?? fallbackTarget;
    resolvedEntries.push({
      id: entryId,
      kind: args.kind,
      label: entry.label?.trim() || humanizeId(entryId),
      description: normalizeEntryDescription({ entryId, entry, kind: args.kind }),
      commands,
      targetId,
      target,
      timeoutMs: entry.timeoutMs,
      restartOnRun: args.kind === "service" ? (entry as WorkspaceScriptServiceConfig).restartOnRun ?? true : undefined,
      orbit: args.kind === "service" ? normalizeOrbitConfig((entry as WorkspaceScriptServiceConfig).orbit) : undefined,
      source: "script",
    });
  }

  return resolvedEntries;
}

function resolveHookRef(
  args: {
    ref: WorkspaceScriptHookRef;
    trigger: ScriptTrigger;
    actionIds: Set<string>;
    serviceIds: Set<string>;
  },
): ResolvedWorkspaceScriptHook | null {
  const rawRef = typeof args.ref === "string" ? args.ref : args.ref.ref;
  const scriptId = rawRef.trim();
  if (!scriptId) {
    return null;
  }

  const kind = typeof args.ref === "string"
    ? (args.actionIds.has(scriptId)
        ? "action"
        : (args.serviceIds.has(scriptId) ? "service" : null))
    : (args.ref.kind
        ?? (args.actionIds.has(scriptId)
          ? "action"
          : (args.serviceIds.has(scriptId) ? "service" : null)));
  if (!kind) {
    return null;
  }

  return {
    trigger: args.trigger,
    scriptId,
    scriptKind: kind,
    blocking: typeof args.ref === "string" ? true : args.ref.blocking ?? true,
  };
}

function normalizeHooks(
  args: {
    hooks: WorkspaceScriptsConfig["hooks"];
    actions: ResolvedWorkspaceScript[];
    services: ResolvedWorkspaceScript[];
  },
): ResolvedWorkspaceScriptsConfig["hooks"] {
  const actionIds = new Set(args.actions.map((entry) => entry.id));
  const serviceIds = new Set(args.services.map((entry) => entry.id));
  const result: ResolvedWorkspaceScriptsConfig["hooks"] = {};

  for (const trigger of SCRIPT_TRIGGER_IDS) {
    const refs = args.hooks?.[trigger];
    if (!refs || refs.length === 0) {
      continue;
    }
    const resolvedRefs = refs
      .map((ref) => resolveHookRef({ ref, trigger, actionIds, serviceIds }))
      .filter((item): item is ResolvedWorkspaceScriptHook => item !== null);
    if (resolvedRefs.length > 0) {
      result[trigger] = resolvedRefs;
    }
  }

  return result;
}

export function resolveScriptsFromConfig(
  config: WorkspaceScriptsConfig | null,
): ResolvedWorkspaceScriptsConfig | null {
  if (!config) {
    return null;
  }

  const targets = normalizeTargetMap(config.targets);
  const actions = normalizeEntries({
    entries: config.actions,
    kind: "action",
    targets,
  });
  const services = normalizeEntries({
    entries: config.services,
    kind: "service",
    targets,
  });
  const hooks = normalizeHooks({
    hooks: config.hooks,
    actions,
    services,
  });

  return {
    actions,
    services,
    hooks,
    targets,
    legacyPhases: {
      setup: [],
      run: [],
      teardown: [],
    },
  };
}

export function resolveScriptConfigFromTiers(
  tiers: Array<{
    base: WorkspaceScriptsConfig | null;
    local: WorkspaceScriptsLocalConfig | null;
  }>,
): ResolvedWorkspaceScriptsConfig | null {
  for (const tier of tiers) {
    if (!tier.base) {
      continue;
    }
    return resolveScriptsFromConfig(mergeScriptsConfig(tier.base, tier.local));
  }
  return null;
}

export function listScriptEntries(
  config: ResolvedWorkspaceScriptsConfig | null,
): ResolvedWorkspaceScript[] {
  if (!config) {
    return [];
  }
  return [...config.actions, ...config.services];
}

export function getScriptEntry(
  config: ResolvedWorkspaceScriptsConfig | null,
  args: { scriptId: string; kind: ScriptKind },
): ResolvedWorkspaceScript | null {
  if (!config) {
    return null;
  }
  const collection = args.kind === "service" ? config.services : config.actions;
  return collection.find((entry) => entry.id === args.scriptId) ?? null;
}

export function getScriptHooksForTrigger(
  config: ResolvedWorkspaceScriptsConfig | null,
  trigger: ScriptTrigger,
): ResolvedWorkspaceScriptHook[] {
  return config?.hooks[trigger] ?? [];
}

export function hasAnyScripts(config: ResolvedWorkspaceScriptsConfig | null): boolean {
  return Boolean(config && (config.actions.length > 0 || config.services.length > 0 || Object.keys(config.hooks).length > 0));
}

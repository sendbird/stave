import {
  SCRIPT_TRIGGER_IDS,
  DEFAULT_SCRIPT_TARGET_IDS,
} from "./constants";
import type {
  ScriptKind,
  ScriptTrigger,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptsConfig,
} from "./types";

export interface ScriptEditorEntry {
  id: string;
  label: string;
  description: string;
  target: string;
  commandsText: string;
  timeoutMs: string;
  enabled: boolean;
  restartOnRun: boolean;
  orbitEnabled: boolean;
  orbitName: string;
  orbitNoTls: boolean;
  orbitProxyPort: string;
}

export interface ScriptEditorHookLink {
  scriptId: string;
  scriptKind: ScriptKind | null;
  blocking: boolean;
}

export interface ScriptEditorState {
  actions: ScriptEditorEntry[];
  services: ScriptEditorEntry[];
  hooks: Partial<Record<ScriptTrigger, ScriptEditorHookLink[]>>;
}

export interface ScriptEditorCandidate {
  scriptId: string;
  scriptKind: ScriptKind;
  label: string;
  description: string;
}

function normalizeCommandsText(commands: string[] | undefined) {
  return (commands ?? []).join("\n");
}

function inferHookKind(args: {
  scriptId: string;
  explicitKind?: ScriptKind;
  fileActionIds: Set<string>;
  fileServiceIds: Set<string>;
  resolvedKindsById: Map<string, ScriptKind | null>;
}) {
  if (args.explicitKind) {
    return args.explicitKind;
  }
  if (args.fileActionIds.has(args.scriptId)) {
    return "action";
  }
  if (args.fileServiceIds.has(args.scriptId)) {
    return "service";
  }
  return args.resolvedKindsById.get(args.scriptId) ?? null;
}

function buildResolvedKindsById(
  resolvedConfig: ResolvedWorkspaceScriptsConfig | null | undefined,
) {
  const kindsById = new Map<string, ScriptKind | null>();
  for (const entry of [...(resolvedConfig?.actions ?? []), ...(resolvedConfig?.services ?? [])]) {
    const existing = kindsById.get(entry.id);
    if (!existing) {
      kindsById.set(entry.id, entry.kind);
      continue;
    }
    if (existing !== entry.kind) {
      kindsById.set(entry.id, null);
    }
  }
  return kindsById;
}

export function createEmptyScriptEditorEntry(
  kind: ScriptKind,
): ScriptEditorEntry {
  return {
    id: "",
    label: "",
    description: "",
    target: DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE,
    commandsText: "",
    timeoutMs: "",
    enabled: true,
    restartOnRun: kind === "service",
    orbitEnabled: false,
    orbitName: "",
    orbitNoTls: false,
    orbitProxyPort: "",
  };
}

export function createEmptyScriptEditorState(): ScriptEditorState {
  return {
    actions: [],
    services: [],
    hooks: {},
  };
}

export function buildScriptEditorState(args: {
  config: WorkspaceScriptsConfig | null;
  resolvedConfig?: ResolvedWorkspaceScriptsConfig | null;
}): ScriptEditorState {
  if (!args.config) {
    return createEmptyScriptEditorState();
  }

  const fileActionIds = new Set(Object.keys(args.config.actions ?? {}));
  const fileServiceIds = new Set(Object.keys(args.config.services ?? {}));
  const resolvedKindsById = buildResolvedKindsById(args.resolvedConfig);

  const actions = Object.entries(args.config.actions ?? {}).map(([id, entry]) => ({
    id,
    label: entry.label ?? "",
    description: entry.description ?? "",
    target: entry.target ?? DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE,
    commandsText: normalizeCommandsText(entry.commands),
    timeoutMs: entry.timeoutMs ? String(entry.timeoutMs) : "",
    enabled: entry.enabled ?? true,
    restartOnRun: true,
    orbitEnabled: false,
    orbitName: "",
    orbitNoTls: false,
    orbitProxyPort: "",
  }));

  const services = Object.entries(args.config.services ?? {}).map(([id, entry]) => ({
    id,
    label: entry.label ?? "",
    description: entry.description ?? "",
    target: entry.target ?? DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE,
    commandsText: normalizeCommandsText(entry.commands),
    timeoutMs: entry.timeoutMs ? String(entry.timeoutMs) : "",
    enabled: entry.enabled ?? true,
    restartOnRun: entry.restartOnRun ?? true,
    orbitEnabled: entry.orbit?.enabled !== false && Boolean(entry.orbit),
    orbitName: entry.orbit?.name ?? "",
    orbitNoTls: entry.orbit?.noTls ?? false,
    orbitProxyPort: entry.orbit?.proxyPort ? String(entry.orbit.proxyPort) : "",
  }));

  const hooks = SCRIPT_TRIGGER_IDS.reduce<ScriptEditorState["hooks"]>((acc, trigger) => {
    const refs = args.config?.hooks?.[trigger];
    if (!refs?.length) {
      return acc;
    }
    const normalizedRefs = refs
      .map((ref) => {
        const scriptId = (typeof ref === "string" ? ref : ref.ref).trim();
        if (!scriptId) {
          return null;
        }
        return {
          scriptId,
          scriptKind: inferHookKind({
            scriptId,
            explicitKind: typeof ref === "string" ? undefined : ref.kind,
            fileActionIds,
            fileServiceIds,
            resolvedKindsById,
          }),
          blocking: typeof ref === "string" ? true : ref.blocking ?? true,
        };
      })
      .filter((item): item is ScriptEditorHookLink => item !== null);

    if (normalizedRefs.length > 0) {
      acc[trigger] = normalizedRefs;
    }

    return acc;
  }, {});

  return {
    actions,
    services,
    hooks,
  };
}

function buildEntryConfig(entry: ScriptEditorEntry) {
  const commands = entry.commandsText
    .split("\n")
    .map((command) => command.trim())
    .filter(Boolean);
  const timeoutMs = entry.timeoutMs.trim();

  return {
    ...(entry.label.trim() ? { label: entry.label.trim() } : {}),
    ...(entry.description.trim() ? { description: entry.description.trim() } : {}),
    commands,
    target: entry.target.trim() || DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE,
    ...(timeoutMs ? { timeoutMs: Number(timeoutMs) } : {}),
    ...(entry.enabled ? {} : { enabled: false }),
  };
}

function dedupeHookLinks(links: ScriptEditorHookLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.scriptKind ?? "unknown"}:${link.scriptId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildScriptConfigFromEditorState(
  state: ScriptEditorState,
): WorkspaceScriptsConfig {
  const actions = Object.fromEntries(
    state.actions
      .map((entry) => [entry.id.trim(), buildEntryConfig(entry)] as const)
      .filter(([id, entry]) => Boolean(id) && entry.commands.length > 0),
  );

  const services = Object.fromEntries(
    state.services
      .map((entry) => [entry.id.trim(), {
        ...buildEntryConfig(entry),
        ...(entry.restartOnRun ? {} : { restartOnRun: false }),
        ...(entry.orbitEnabled
          ? {
              orbit: {
                enabled: true,
                ...(entry.orbitName.trim() ? { name: entry.orbitName.trim() } : {}),
                ...(entry.orbitNoTls ? { noTls: true } : {}),
                ...(entry.orbitProxyPort.trim() ? { proxyPort: Number(entry.orbitProxyPort.trim()) } : {}),
              },
            }
          : {}),
      }] as const)
      .filter(([id, entry]) => Boolean(id) && entry.commands.length > 0),
  );

  const hooks = SCRIPT_TRIGGER_IDS.reduce<WorkspaceScriptsConfig["hooks"]>((acc, trigger) => {
    const nextRefs = dedupeHookLinks(state.hooks[trigger] ?? [])
      .map((link) => {
        const scriptId = link.scriptId.trim();
        if (!scriptId) {
          return null;
        }
        return {
          ref: scriptId,
          ...(link.scriptKind ? { kind: link.scriptKind } : {}),
          ...(link.blocking ? {} : { blocking: false }),
        };
      })
      .filter((item): item is { ref: string; kind?: ScriptKind; blocking?: boolean } => item !== null);

    if (nextRefs.length > 0) {
      acc ??= {};
      acc[trigger] = nextRefs;
    }

    return acc;
  }, undefined);

  return {
    version: 2,
    ...(Object.keys(actions).length > 0 ? { actions } : {}),
    ...(Object.keys(services).length > 0 ? { services } : {}),
    ...(hooks && Object.keys(hooks).length > 0 ? { hooks } : {}),
  };
}

export function mergeScriptConfigIntoRaw(args: {
  rawConfig: Record<string, unknown> | null;
  config: WorkspaceScriptsConfig;
}): Record<string, unknown> {
  const next = {
    ...(args.rawConfig ?? {}),
    ...args.config,
    version: 2,
  } as Record<string, unknown>;

  if (!args.config.actions || Object.keys(args.config.actions).length === 0) {
    delete next.actions;
  }
  if (!args.config.services || Object.keys(args.config.services).length === 0) {
    delete next.services;
  }
  if (!args.config.hooks || Object.keys(args.config.hooks).length === 0) {
    delete next.hooks;
  }

  return next;
}

export function formatScriptConfigFile(rawConfig: Record<string, unknown>) {
  return `${JSON.stringify(rawConfig, null, 2)}\n`;
}

export function buildScriptEditorCandidates(args: {
  state: ScriptEditorState;
  resolvedConfig?: ResolvedWorkspaceScriptsConfig | null;
}): ScriptEditorCandidate[] {
  const next = new Map<string, ScriptEditorCandidate>();

  for (const entry of [...(args.resolvedConfig?.actions ?? []), ...(args.resolvedConfig?.services ?? [])]) {
    next.set(`${entry.kind}:${entry.id}`, {
      scriptId: entry.id,
      scriptKind: entry.kind,
      label: entry.label,
      description: entry.description,
    });
  }

  for (const entry of args.state.actions) {
    const scriptId = entry.id.trim();
    if (!scriptId) {
      continue;
    }
    next.set(`action:${scriptId}`, {
      scriptId,
      scriptKind: "action",
      label: entry.label.trim() || scriptId,
      description: entry.description.trim(),
    });
  }

  for (const entry of args.state.services) {
    const scriptId = entry.id.trim();
    if (!scriptId) {
      continue;
    }
    next.set(`service:${scriptId}`, {
      scriptId,
      scriptKind: "service",
      label: entry.label.trim() || scriptId,
      description: entry.description.trim(),
    });
  }

  return [...next.values()].sort((left, right) => {
    if (left.scriptKind !== right.scriptKind) {
      return left.scriptKind.localeCompare(right.scriptKind);
    }
    return (left.label || left.scriptId).localeCompare(right.label || right.scriptId);
  });
}

export function validateScriptEditorState(state: ScriptEditorState) {
  const issues: string[] = [];

  for (const [section, entries] of [
    ["actions", state.actions],
    ["services", state.services],
  ] as const) {
    const seenIds = new Set<string>();
    entries.forEach((entry, index) => {
      const scriptId = entry.id.trim();
      const label = entry.label.trim() || scriptId || `${section.slice(0, -1)} ${index + 1}`;

      if (!scriptId) {
        issues.push(`${section}: "${label}" is missing an id.`);
      } else if (seenIds.has(scriptId)) {
        issues.push(`${section}: duplicate id "${scriptId}".`);
      } else {
        seenIds.add(scriptId);
      }

      const commands = entry.commandsText
        .split("\n")
        .map((command) => command.trim())
        .filter(Boolean);
      if (commands.length === 0) {
        issues.push(`${section}: "${label}" needs at least one command.`);
      }

      if (entry.timeoutMs.trim()) {
        const timeout = Number(entry.timeoutMs);
        if (!Number.isInteger(timeout) || timeout <= 0) {
          issues.push(`${section}: "${label}" has an invalid timeout.`);
        }
      }

      if (section === "services" && entry.orbitEnabled && entry.target !== DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE) {
        issues.push(`${section}: "${label}" must target workspace when Orbit is enabled.`);
      }

      if (section === "services" && entry.orbitEnabled && entry.orbitProxyPort.trim()) {
        const orbitProxyPort = Number(entry.orbitProxyPort);
        if (!Number.isInteger(orbitProxyPort) || orbitProxyPort <= 0) {
          issues.push(`${section}: "${label}" has an invalid Orbit proxy port.`);
        }
      }
    });
  }

  return issues;
}

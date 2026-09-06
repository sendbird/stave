import { SCRIPT_TRIGGER_IDS, DEFAULT_SCRIPT_TARGET_IDS } from "./constants";
import type {
  ScriptKind,
  ScriptTargetScope,
  ScriptTrigger,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptsConfig,
  WorkspaceScriptTargetConfig,
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

export interface ScriptEditorEnvRow {
  key: string;
  value: string;
}

export interface ScriptEditorTargetEntry {
  id: string;
  label: string;
  cwd: ScriptTargetScope;
  shell: string;
  envRows: ScriptEditorEnvRow[];
}

export interface ScriptEditorState {
  actions: ScriptEditorEntry[];
  services: ScriptEditorEntry[];
  hooks: Partial<Record<ScriptTrigger, ScriptEditorHookLink[]>>;
  targets: ScriptEditorTargetEntry[];
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
  for (const entry of [
    ...(resolvedConfig?.actions ?? []),
    ...(resolvedConfig?.services ?? []),
  ]) {
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stable id stem from a display label. Empty labels become `process`. */
export function scriptIdBaseFromLabel(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "process"
  );
}

/** Unique script id derived from a label, appending -2, -3, … on collision. */
export function slugifyScriptId(
  label: string,
  existingIds: Iterable<string>,
): string {
  const used = new Set([...existingIds].map((id) => id.trim()).filter(Boolean));
  const base = scriptIdBaseFromLabel(label);
  if (!used.has(base)) {
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

/** True when the id is still generated from the label and should follow edits. */
export function shouldAutoSyncScriptId(args: {
  currentId: string;
  currentLabel: string;
  otherIds: Iterable<string>;
}): boolean {
  const id = args.currentId.trim();
  if (!id) {
    return true;
  }
  if (!args.currentLabel.trim()) {
    return false;
  }
  return id === slugifyScriptId(args.currentLabel, args.otherIds);
}

export function collectScriptIdsFromRaw(
  rawConfig: Record<string, unknown> | null,
): string[] {
  if (!rawConfig) {
    return [];
  }
  const ids: string[] = [];
  for (const key of ["actions", "services"] as const) {
    const block = rawConfig[key];
    if (isPlainRecord(block)) {
      ids.push(...Object.keys(block));
    }
  }
  return ids;
}

export function appendServiceEntryToRawConfig(args: {
  rawConfig: Record<string, unknown> | null;
  id: string;
  label: string;
  commands: string[];
}): Record<string, unknown> {
  return appendScriptEntryToRawConfig({ ...args, kind: "service" });
}

export function appendScriptEntryToRawConfig(args: {
  rawConfig: Record<string, unknown> | null;
  id: string;
  label: string;
  commands: string[];
  kind: ScriptKind;
}): Record<string, unknown> {
  const key = args.kind === "service" ? "services" : "actions";
  const entries = isPlainRecord(args.rawConfig?.[key])
    ? { ...args.rawConfig[key] }
    : {};
  entries[args.id] = {
    label: args.label.trim() || args.id,
    commands: args.commands,
    target: DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE,
  };
  return {
    ...(args.rawConfig ?? {}),
    version: 2,
    [key]: entries,
  };
}

export function entryHasAdvancedValues(
  entry: ScriptEditorEntry,
  kind: ScriptKind,
): boolean {
  if (entry.description.trim()) {
    return true;
  }
  if (
    entry.target.trim() &&
    entry.target !== DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE
  ) {
    return true;
  }
  if (entry.timeoutMs.trim()) {
    return true;
  }
  if (!entry.enabled) {
    return true;
  }
  return kind === "service" && entry.orbitEnabled;
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

export function createEmptyScriptEditorTargetEntry(): ScriptEditorTargetEntry {
  return {
    id: "",
    label: "",
    cwd: "workspace",
    shell: "",
    envRows: [],
  };
}

export function createEmptyScriptEditorState(): ScriptEditorState {
  return {
    actions: [],
    services: [],
    hooks: {},
    targets: [],
  };
}

function normalizeEnvRows(
  env: Record<string, string> | undefined,
): ScriptEditorEnvRow[] {
  return Object.entries(env ?? {}).map(([key, value]) => ({ key, value }));
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

  const actions = Object.entries(args.config.actions ?? {}).map(
    ([id, entry]) => ({
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
    }),
  );

  const services = Object.entries(args.config.services ?? {}).map(
    ([id, entry]) => ({
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
      orbitProxyPort: entry.orbit?.proxyPort
        ? String(entry.orbit.proxyPort)
        : "",
    }),
  );

  const hooks = SCRIPT_TRIGGER_IDS.reduce<ScriptEditorState["hooks"]>(
    (acc, trigger) => {
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
            blocking: typeof ref === "string" ? true : (ref.blocking ?? true),
          };
        })
        .filter((item): item is ScriptEditorHookLink => item !== null);

      if (normalizedRefs.length > 0) {
        acc[trigger] = normalizedRefs;
      }

      return acc;
    },
    {},
  );

  const targets = Object.entries(args.config.targets ?? {}).map(
    ([id, target]) => ({
      id,
      label: target.label ?? "",
      cwd: target.cwd ?? "workspace",
      shell: target.shell ?? "",
      envRows: normalizeEnvRows(target.env),
    }),
  );

  return {
    actions,
    services,
    hooks,
    targets,
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
    ...(entry.description.trim()
      ? { description: entry.description.trim() }
      : {}),
    commands,
    target: entry.target.trim() || DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE,
    ...(timeoutMs ? { timeoutMs: Number(timeoutMs) } : {}),
    ...(entry.enabled ? {} : { enabled: false }),
  };
}

function buildTargetConfig(
  target: ScriptEditorTargetEntry,
): WorkspaceScriptTargetConfig {
  const env: Record<string, string> = {};
  for (const row of target.envRows) {
    const key = row.key.trim();
    if (key) {
      env[key] = row.value;
    }
  }
  return {
    ...(target.label.trim() ? { label: target.label.trim() } : {}),
    cwd: target.cwd,
    ...(Object.keys(env).length > 0 ? { env } : {}),
    ...(target.shell.trim() ? { shell: target.shell.trim() } : {}),
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
      .map(
        (entry) =>
          [
            entry.id.trim(),
            {
              ...buildEntryConfig(entry),
              ...(entry.restartOnRun ? {} : { restartOnRun: false }),
              ...(entry.orbitEnabled
                ? {
                    orbit: {
                      enabled: true,
                      ...(entry.orbitName.trim()
                        ? { name: entry.orbitName.trim() }
                        : {}),
                      ...(entry.orbitNoTls ? { noTls: true } : {}),
                      ...(entry.orbitProxyPort.trim()
                        ? { proxyPort: Number(entry.orbitProxyPort.trim()) }
                        : {}),
                    },
                  }
                : {}),
            },
          ] as const,
      )
      .filter(([id, entry]) => Boolean(id) && entry.commands.length > 0),
  );

  const hooks = SCRIPT_TRIGGER_IDS.reduce<WorkspaceScriptsConfig["hooks"]>(
    (acc, trigger) => {
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
        .filter(
          (
            item,
          ): item is { ref: string; kind?: ScriptKind; blocking?: boolean } =>
            item !== null,
        );

      if (nextRefs.length > 0) {
        acc ??= {};
        acc[trigger] = nextRefs;
      }

      return acc;
    },
    undefined,
  );

  const targets = Object.fromEntries(
    state.targets
      .map((target) => [target.id.trim(), buildTargetConfig(target)] as const)
      .filter(([id]) => Boolean(id)),
  );

  return {
    version: 2,
    ...(Object.keys(actions).length > 0 ? { actions } : {}),
    ...(Object.keys(services).length > 0 ? { services } : {}),
    ...(hooks && Object.keys(hooks).length > 0 ? { hooks } : {}),
    ...(Object.keys(targets).length > 0 ? { targets } : {}),
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
  // Targets are now editor-managed. When present, the serialized `config.targets`
  // replaces the raw block wholesale (dropping per-target unknown keys); when
  // empty, the block is removed. Top-level unknown keys (`notes`, etc.) survive
  // via the `...rawConfig` spread above.
  if (!args.config.targets || Object.keys(args.config.targets).length === 0) {
    delete next.targets;
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

  for (const entry of [
    ...(args.resolvedConfig?.actions ?? []),
    ...(args.resolvedConfig?.services ?? []),
  ]) {
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
    return (left.label || left.scriptId).localeCompare(
      right.label || right.scriptId,
    );
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
      const label =
        entry.label.trim() ||
        scriptId ||
        `${section.slice(0, -1)} ${index + 1}`;

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

      if (
        section === "services" &&
        entry.orbitEnabled &&
        entry.target !== DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE
      ) {
        issues.push(
          `${section}: "${label}" must target workspace when Orbit is enabled.`,
        );
      }

      if (
        section === "services" &&
        entry.orbitEnabled &&
        entry.orbitProxyPort.trim()
      ) {
        const orbitProxyPort = Number(entry.orbitProxyPort);
        if (!Number.isInteger(orbitProxyPort) || orbitProxyPort <= 0) {
          issues.push(
            `${section}: "${label}" has an invalid Orbit proxy port.`,
          );
        }
      }
    });
  }

  return issues;
}

export interface ScriptEntryFieldIssues {
  id?: string;
  commands?: string;
  timeoutMs?: string;
  target?: string;
  orbitProxyPort?: string;
}

/**
 * Per-field validation for a single entry, used to surface inline errors in the
 * card editor. `duplicateId` is computed by the caller (it needs cross-entry
 * context). The aggregate `validateScriptEditorState` remains the source of
 * truth for save-time gating and its exact message strings.
 */
export function validateScriptEditorEntry(args: {
  entry: ScriptEditorEntry;
  kind: ScriptKind;
  duplicateId?: boolean;
}): ScriptEntryFieldIssues {
  const { entry, kind } = args;
  const issues: ScriptEntryFieldIssues = {};

  const id = entry.id.trim();
  if (!id) {
    issues.id = "ID is required.";
  } else if (args.duplicateId) {
    issues.id = `Duplicate ID "${id}".`;
  }

  const commands = entry.commandsText
    .split("\n")
    .map((command) => command.trim())
    .filter(Boolean);
  if (commands.length === 0) {
    issues.commands = "Add at least one command.";
  }

  if (entry.timeoutMs.trim()) {
    const timeout = Number(entry.timeoutMs);
    if (!Number.isInteger(timeout) || timeout <= 0) {
      issues.timeoutMs = "Timeout must be a positive integer.";
    }
  }

  if (kind === "service" && entry.orbitEnabled) {
    if (entry.target !== DEFAULT_SCRIPT_TARGET_IDS.WORKSPACE) {
      issues.target = "Orbit services must target the workspace.";
    }
    if (entry.orbitProxyPort.trim()) {
      const orbitProxyPort = Number(entry.orbitProxyPort);
      if (!Number.isInteger(orbitProxyPort) || orbitProxyPort <= 0) {
        issues.orbitProxyPort = "Proxy port must be a positive integer.";
      }
    }
  }

  return issues;
}

/** Produce a duplicate of an entry with a unique `-copy` id and " (copy)" label. */
export function duplicateScriptEditorEntry(
  entry: ScriptEditorEntry,
  existingIds: Iterable<string>,
): ScriptEditorEntry {
  const taken = new Set(
    [...existingIds].map((id) => id.trim()).filter(Boolean),
  );
  const base = entry.id.trim() || "script";
  let candidate = `${base}-copy`;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-copy-${suffix}`;
    suffix += 1;
  }
  const baseLabel = entry.label.trim() || entry.id.trim() || base;
  return {
    ...entry,
    id: candidate,
    label: `${baseLabel} (copy)`,
  };
}

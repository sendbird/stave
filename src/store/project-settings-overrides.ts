import type { AppSettings } from "@/store/app-settings";

/**
 * Settings scope: the only settings a project (repository) may override.
 *
 * Two groups, both owned by a Settings section that already exists:
 * - the default model and effort per provider (Settings > Models);
 * - the permission posture per provider (Settings > Providers): Claude's
 *   permission mode and sandbox switches, Codex's file access, network
 *   access and approvals, and the Cursor and Kiro approval presets.
 *
 * Everything else is global. Every read of an overridable value for a new
 * task or turn goes through `resolveEffectiveSettings` / `effectiveSetting`,
 * and an explicit task or composer choice still wins over both layers.
 */
export const PROJECT_OVERRIDABLE_SETTING_KEYS = [
  "modelClaude",
  "claudeEffort",
  "modelCodex",
  "codexReasoningEffort",
  "modelCursor",
  "cursorEffort",
  "modelKiro",
  "kiroEffort",
  "claudePermissionMode",
  "claudeAllowDangerouslySkipPermissions",
  "claudeSandboxEnabled",
  "claudeAllowUnsandboxedCommands",
  "codexFileAccess",
  "codexNetworkAccess",
  "codexApprovalPolicy",
  "codexAppToolApprovalMode",
  "cursorApprovalMode",
  "kiroApprovalMode",
] as const satisfies readonly (keyof AppSettings)[];

export type ProjectOverridableSettingKey =
  (typeof PROJECT_OVERRIDABLE_SETTING_KEYS)[number];

export type ProjectSettingsOverrides = Partial<
  Pick<AppSettings, ProjectOverridableSettingKey>
>;

/** Where an effective value came from, for the Settings scope badges. */
export type SettingValueSource = "global" | "project";

const OVERRIDABLE_KEY_SET: ReadonlySet<string> = new Set(
  PROJECT_OVERRIDABLE_SETTING_KEYS,
);

export function isProjectOverridableSettingKey(
  key: string,
): key is ProjectOverridableSettingKey {
  return OVERRIDABLE_KEY_SET.has(key);
}

const MAX_MODEL_ID_LENGTH = 256;
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

function oneOf<T extends string>(values: readonly T[]) {
  return (value: unknown): T | undefined =>
    typeof value === "string" && (values as readonly string[]).includes(value)
      ? (value as T)
      : undefined;
}

function modelId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_MODEL_ID_LENGTH ? trimmed : undefined;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * One validator per allow-listed key. A stored or patched value that fails
 * its validator is dropped, so the global value applies instead.
 */
const OVERRIDE_VALIDATORS: {
  [K in ProjectOverridableSettingKey]: (
    value: unknown,
  ) => AppSettings[K] | undefined;
} = {
  modelClaude: modelId,
  claudeEffort: oneOf<AppSettings["claudeEffort"]>(EFFORTS),
  modelCodex: modelId,
  codexReasoningEffort: oneOf<AppSettings["codexReasoningEffort"]>([
    ...EFFORTS,
    "ultra",
  ]),
  modelCursor: modelId,
  cursorEffort: oneOf<AppSettings["cursorEffort"]>(EFFORTS),
  modelKiro: modelId,
  kiroEffort: oneOf<AppSettings["kiroEffort"]>(EFFORTS),
  claudePermissionMode: oneOf<AppSettings["claudePermissionMode"]>([
    "default",
    "acceptEdits",
    "bypassPermissions",
    "dontAsk",
    "auto",
  ]),
  claudeAllowDangerouslySkipPermissions: flag,
  claudeSandboxEnabled: flag,
  claudeAllowUnsandboxedCommands: flag,
  codexFileAccess: oneOf<AppSettings["codexFileAccess"]>([
    "read-only",
    "workspace-write",
    "danger-full-access",
  ]),
  codexNetworkAccess: flag,
  codexApprovalPolicy: oneOf<AppSettings["codexApprovalPolicy"]>([
    "never",
    "on-request",
    "on-failure",
    "untrusted",
  ]),
  codexAppToolApprovalMode: oneOf<AppSettings["codexAppToolApprovalMode"]>([
    "inherit",
    "auto",
    "prompt",
    "writes",
    "approve",
  ]),
  cursorApprovalMode: oneOf<AppSettings["cursorApprovalMode"]>([
    "manual",
    "guided",
    "auto",
  ]),
  kiroApprovalMode: oneOf<AppSettings["kiroApprovalMode"]>(["manual", "auto"]),
};

function validateOverride<K extends ProjectOverridableSettingKey>(
  key: K,
  value: unknown,
): AppSettings[K] | undefined {
  return (OVERRIDE_VALIDATORS[key] as (value: unknown) => AppSettings[K] | undefined)(
    value,
  );
}

/**
 * Reads a stored overrides blob. Keys outside the allow-list and values that
 * fail validation are dropped; an empty result is `undefined`. A blob that is
 * already clean is returned as the same object, so remembered repositories
 * that are re-cloned keep a stable reference for memoized readers.
 */
export function normalizeProjectSettingsOverrides(
  value: unknown,
): ProjectSettingsOverrides | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const [key, raw] of entries) {
    const normalized = isProjectOverridableSettingKey(key)
      ? validateOverride(key, raw)
      : undefined;
    if (normalized === undefined) {
      changed = true;
      continue;
    }
    if (normalized !== raw) {
      changed = true;
    }
    next[key] = normalized;
  }
  if (Object.keys(next).length === 0) {
    return undefined;
  }
  return changed ? (next as ProjectSettingsOverrides) : (value as ProjectSettingsOverrides);
}

/**
 * Applies a patch and clears keys on a project's overrides. Keys outside the
 * allow-list are refused and reported, never stored; a value that matches
 * nothing valid is refused too. Returns `undefined` overrides once nothing is
 * left, so a cleared project carries no blob.
 */
export function updateProjectSettingsOverrides(args: {
  overrides: ProjectSettingsOverrides | undefined;
  patch?: Record<string, unknown>;
  clearKeys?: readonly string[];
}): {
  overrides: ProjectSettingsOverrides | undefined;
  refusedKeys: string[];
  changed: boolean;
} {
  const normalizedInput = normalizeProjectSettingsOverrides(args.overrides);
  const current: ProjectSettingsOverrides = normalizedInput ?? {};
  const next: Record<string, unknown> = { ...current };
  const refusedKeys: string[] = [];
  for (const [key, raw] of Object.entries(args.patch ?? {})) {
    const normalized = isProjectOverridableSettingKey(key)
      ? validateOverride(key, raw)
      : undefined;
    if (normalized === undefined) {
      refusedKeys.push(key);
      continue;
    }
    next[key] = normalized;
  }
  for (const key of args.clearKeys ?? []) {
    if (!isProjectOverridableSettingKey(key)) {
      refusedKeys.push(key);
      continue;
    }
    delete next[key];
  }
  const changed =
    normalizedInput !== args.overrides ||
    Object.keys(next).length !== Object.keys(current).length ||
    Object.entries(next).some(
      ([key, value]) => current[key as ProjectOverridableSettingKey] !== value,
    );
  const overrides = Object.keys(next).length > 0
    ? (next as ProjectSettingsOverrides)
    : undefined;
  return {
    overrides: changed ? overrides : normalizedInput,
    refusedKeys,
    changed,
  };
}

/** Keeps only the allow-listed part of a settings patch (e.g. a mode preset). */
export function pickProjectOverridablePatch(
  patch: Partial<AppSettings>,
): ProjectSettingsOverrides {
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => isProjectOverridableSettingKey(key)),
  ) as ProjectSettingsOverrides;
}

interface RepositoryOverridesSource {
  repositoryPath: string;
  settingsOverrides?: ProjectSettingsOverrides;
}

export interface EffectiveSettingsSource<TSettings = AppSettings> {
  settings: TSettings;
  recentRepositories: readonly RepositoryOverridesSource[];
}

export function resolveProjectSettingsOverrides(args: {
  repositoryPath?: string | null;
  recentRepositories: readonly RepositoryOverridesSource[];
}): ProjectSettingsOverrides | undefined {
  const repositoryPath = args.repositoryPath?.trim();
  if (!repositoryPath) {
    return undefined;
  }
  return args.recentRepositories.find(
    (repository) => repository.repositoryPath === repositoryPath,
  )?.settingsOverrides;
}

const overridesKeyCache = new WeakMap<object, string>();
const effectiveSettingsCache = new WeakMap<object, Map<string, object>>();
const MAX_CACHED_PROJECTS_PER_SETTINGS = 16;

function overridesCacheKey(overrides: ProjectSettingsOverrides) {
  const cached = overridesKeyCache.get(overrides);
  if (cached !== undefined) {
    return cached;
  }
  const key = JSON.stringify(
    PROJECT_OVERRIDABLE_SETTING_KEYS.map((name) => overrides[name] ?? null),
  );
  overridesKeyCache.set(overrides, key);
  return key;
}

/**
 * Global settings with a project's overrides laid over them. Returns the
 * global object itself when the project has none, and the same merged object
 * for the same settings and overrides, so Zustand selectors that return it
 * stay referentially stable.
 */
export function applyProjectSettingsOverrides<TSettings extends object>(
  settings: TSettings,
  overrides: ProjectSettingsOverrides | undefined,
): TSettings {
  if (!overrides) {
    return settings;
  }
  const key = overridesCacheKey(overrides);
  let bySettings = effectiveSettingsCache.get(settings);
  const cached = bySettings?.get(key);
  if (cached) {
    return cached as TSettings;
  }
  const merged = { ...settings };
  for (const name of PROJECT_OVERRIDABLE_SETTING_KEYS) {
    const value = overrides[name];
    if (value !== undefined && name in settings) {
      (merged as Record<string, unknown>)[name] = value;
    }
  }
  if (!bySettings || bySettings.size >= MAX_CACHED_PROJECTS_PER_SETTINGS) {
    bySettings = new Map();
    effectiveSettingsCache.set(settings, bySettings);
  }
  bySettings.set(key, merged);
  return merged;
}

/** The settings a new task or turn in `repositoryPath` starts from. */
export function resolveEffectiveSettings<TSettings extends object>(
  args: EffectiveSettingsSource<TSettings> & {
    repositoryPath?: string | null;
  },
): TSettings {
  return applyProjectSettingsOverrides(
    args.settings,
    resolveProjectSettingsOverrides(args),
  );
}

/**
 * Store-shaped convenience for selectors: the effective settings of
 * `repositoryPath`, or of the open repository when none is given.
 */
export function selectEffectiveSettings<TSettings extends object>(
  state: EffectiveSettingsSource<TSettings> & { repositoryPath: string | null },
  repositoryPath?: string | null,
): TSettings {
  return resolveEffectiveSettings({
    settings: state.settings,
    recentRepositories: state.recentRepositories,
    repositoryPath: repositoryPath ?? state.repositoryPath,
  });
}

/**
 * One setting as a new task or turn in `repositoryPath` sees it: an explicit
 * task or composer choice, then the project's override (allow-listed keys
 * only), then the global value.
 */
export function effectiveSetting<K extends keyof AppSettings>(
  key: K,
  repositoryPath: string | null | undefined,
  source: EffectiveSettingsSource & { taskChoice?: AppSettings[K] },
): AppSettings[K] {
  if (source.taskChoice !== undefined) {
    return source.taskChoice;
  }
  if (isProjectOverridableSettingKey(key)) {
    const override = resolveProjectSettingsOverrides({
      repositoryPath,
      recentRepositories: source.recentRepositories,
    })?.[key];
    if (override !== undefined) {
      return override as AppSettings[K];
    }
  }
  return source.settings[key];
}

export function resolveSettingValueSource(args: {
  key: ProjectOverridableSettingKey;
  overrides: ProjectSettingsOverrides | undefined;
}): SettingValueSource {
  return args.overrides?.[args.key] === undefined ? "global" : "project";
}

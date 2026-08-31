import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import {
  clampCodexEffortToModel,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
} from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import type { ClaudePermissionMode } from "@/types/chat";

type ClaudeEffort = NonNullable<ProviderRuntimeOptions["claudeEffort"]>;
type CodexEffort = NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>;
type KiroEffort = NonNullable<ProviderRuntimeOptions["kiroEffort"]>;

export interface ModelRuntimePreference {
  mode?: ProviderModePresetId;
  effort?: ClaudeEffort | CodexEffort | KiroEffort;
  fastMode?: boolean;
}

export type ModelRuntimePreferences = Record<string, ModelRuntimePreference>;
export type ModelRuntimePreferencePatch = Partial<ModelRuntimePreference>;
export interface UpdateModelRuntimePreferenceArgs {
  providerId: ProviderId;
  model: string;
  patch: ModelRuntimePreferencePatch;
}

export interface ModelRuntimePreferenceSettings {
  modelRuntimePreferences: ModelRuntimePreferences;
  modelClaude: string;
  modelCodex: string;
  modelKiro: string;
  claudePermissionMode: ClaudePermissionMode;
  claudeAllowDangerouslySkipPermissions: boolean;
  claudeSandboxEnabled: boolean;
  claudeAllowUnsandboxedCommands: boolean;
  claudeEffort: ClaudeEffort;
  claudeFastMode: boolean;
  codexFileAccess: NonNullable<ProviderRuntimeOptions["codexFileAccess"]>;
  codexApprovalPolicy: NonNullable<
    ProviderRuntimeOptions["codexApprovalPolicy"]
  >;
  codexNetworkAccess: boolean;
  codexWebSearch: NonNullable<ProviderRuntimeOptions["codexWebSearch"]>;
  codexReasoningEffort: CodexEffort;
  codexFastMode: boolean;
  kiroEffort: KiroEffort;
}

const CLAUDE_EFFORTS = new Set<ClaudeEffort>([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const CODEX_EFFORTS = new Set<CodexEffort>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);
const KIRO_EFFORTS = new Set<KiroEffort>([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const MODE_PRESETS = new Set<ProviderModePresetId>([
  "manual",
  "guided",
  "auto",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProviderEffort(
  providerId: ProviderId,
  value: unknown,
): value is ClaudeEffort | CodexEffort | KiroEffort {
  if (typeof value !== "string") {
    return false;
  }
  if (providerId === "claude-code") {
    return CLAUDE_EFFORTS.has(value as ClaudeEffort);
  }
  if (providerId === "codex") {
    return CODEX_EFFORTS.has(value as CodexEffort);
  }
  return providerId === "kiro" && KIRO_EFFORTS.has(value as KiroEffort);
}

function parseModelRuntimePreferenceKey(key: string): {
  providerId: ProviderId;
  model: string;
} | null {
  for (const providerId of ["claude-code", "codex", "kiro"] as const) {
    const prefix = `${providerId}:`;
    if (key.startsWith(prefix) && key.length > prefix.length) {
      return { providerId, model: key.slice(prefix.length) };
    }
  }
  return null;
}

function normalizeModelRuntimePreference(args: {
  providerId: ProviderId;
  value: unknown;
}): ModelRuntimePreference | null {
  if (!isRecord(args.value)) {
    return null;
  }

  const preference: ModelRuntimePreference = {};
  if (
    (args.providerId === "claude-code" || args.providerId === "codex") &&
    MODE_PRESETS.has(args.value.mode as ProviderModePresetId)
  ) {
    preference.mode = args.value.mode as ProviderModePresetId;
  }
  if (isProviderEffort(args.providerId, args.value.effort)) {
    preference.effort = args.value.effort;
  }
  if (
    (args.providerId === "claude-code" || args.providerId === "codex") &&
    typeof args.value.fastMode === "boolean"
  ) {
    preference.fastMode = args.value.fastMode;
  }

  return Object.keys(preference).length > 0 ? preference : null;
}

export function buildModelRuntimePreferenceKey(args: {
  providerId: ProviderId;
  model: string;
}) {
  return `${args.providerId}:${args.model.trim()}`;
}

export function normalizeModelRuntimePreferences(
  value: unknown,
): ModelRuntimePreferences {
  if (!isRecord(value)) {
    return {};
  }

  const normalized: ModelRuntimePreferences = {};
  for (const [key, candidate] of Object.entries(value)) {
    const parsedKey = parseModelRuntimePreferenceKey(key);
    if (!parsedKey) {
      continue;
    }
    const preference = normalizeModelRuntimePreference({
      providerId: parsedKey.providerId,
      value: candidate,
    });
    if (preference) {
      normalized[
        buildModelRuntimePreferenceKey({
          providerId: parsedKey.providerId,
          model: parsedKey.model,
        })
      ] = preference;
    }
  }
  return normalized;
}

export function mergeModelRuntimePreference(args: {
  preferences: ModelRuntimePreferences;
  providerId: ProviderId;
  model: string;
  patch: ModelRuntimePreferencePatch;
}): ModelRuntimePreferences {
  if (!args.model.trim()) {
    return args.preferences;
  }
  const key = buildModelRuntimePreferenceKey(args);
  const current = args.preferences[key] ?? {};
  const nextCandidate = {
    ...current,
    ...(args.patch.mode === undefined ? {} : { mode: args.patch.mode }),
    ...(args.patch.effort === undefined ? {} : { effort: args.patch.effort }),
    ...(args.patch.fastMode === undefined
      ? {}
      : { fastMode: args.patch.fastMode }),
  };
  const next = normalizeModelRuntimePreference({
    providerId: args.providerId,
    value: nextCandidate,
  });
  if (!next) {
    return args.preferences;
  }
  if (
    current.mode === next.mode &&
    current.effort === next.effort &&
    current.fastMode === next.fastMode
  ) {
    return args.preferences;
  }
  return { ...args.preferences, [key]: next };
}

export function mergeModelRuntimePreferenceSettings<
  TSettings extends { modelRuntimePreferences: ModelRuntimePreferences },
>(settings: TSettings, args: UpdateModelRuntimePreferenceArgs): TSettings {
  const modelRuntimePreferences = mergeModelRuntimePreference({
    preferences: settings.modelRuntimePreferences,
    ...args,
  });
  return modelRuntimePreferences === settings.modelRuntimePreferences
    ? settings
    : { ...settings, modelRuntimePreferences };
}

export function applyModelRuntimePreference<
  TSettings extends ModelRuntimePreferenceSettings,
>(args: {
  settings: TSettings;
  providerId: ProviderId;
  model: string;
}): TSettings {
  const preference =
    args.settings.modelRuntimePreferences[buildModelRuntimePreferenceKey(args)];

  if (args.providerId === "claude-code") {
    const claudeEffort =
      preference?.effort &&
      CLAUDE_EFFORTS.has(preference.effort as ClaudeEffort)
        ? (preference.effort as ClaudeEffort)
        : args.model === args.settings.modelClaude
          ? args.settings.claudeEffort
          : resolveDefaultClaudeEffortForModel({ model: args.model });
    if (!preference && claudeEffort === args.settings.claudeEffort) {
      return args.settings;
    }
    return {
      ...args.settings,
      ...(preference?.mode
        ? buildClaudeProviderModeSettingsPatch({
            presetId: preference.mode,
          })
        : {}),
      claudeEffort,
      ...(preference?.fastMode === undefined
        ? {}
        : { claudeFastMode: preference.fastMode }),
    };
  }

  if (args.providerId === "cursor") {
    return args.settings;
  }

  if (args.providerId === "kiro") {
    const kiroEffort =
      preference?.effort && KIRO_EFFORTS.has(preference.effort as KiroEffort)
        ? (preference.effort as KiroEffort)
        : args.settings.kiroEffort;
    if (!preference && kiroEffort === args.settings.kiroEffort) {
      return args.settings;
    }
    return { ...args.settings, kiroEffort };
  }

  const codexReasoningEffort = clampCodexEffortToModel({
    model: args.model,
    effort:
      preference?.effort && CODEX_EFFORTS.has(preference.effort as CodexEffort)
        ? (preference.effort as CodexEffort)
        : args.model === args.settings.modelCodex
          ? args.settings.codexReasoningEffort
          : resolveDefaultCodexEffortForModel({ model: args.model }),
  });
  if (
    !preference &&
    codexReasoningEffort === args.settings.codexReasoningEffort
  ) {
    return args.settings;
  }
  return {
    ...args.settings,
    ...(preference?.mode
      ? buildCodexProviderModeSettingsPatch({ presetId: preference.mode })
      : {}),
    codexReasoningEffort,
    ...(preference?.fastMode === undefined
      ? {}
      : { codexFastMode: preference.fastMode }),
  };
}

import {
  applyModelRuntimePreference,
  type ModelRuntimePreferenceSettings,
} from "@/lib/providers/model-runtime-preferences";
import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  CLAUDE_PROVIDER_MODE_PRESETS,
  CODEX_PROVIDER_MODE_PRESETS,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import type {
  AdvisorTarget,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  CLAUDE_EFFORT_OPTIONS,
  listCodexEffortOptionsForModel,
} from "@/lib/providers/runtime-option-contract";
import type {
  CraneDispatchApprovalResponse,
  CraneDispatchEffort,
  CraneTeamRuntimeMemory,
} from "./types";

type ClaudeEffort = NonNullable<ProviderRuntimeOptions["claudeEffort"]>;

/**
 * Claude has no "minimal"/"ultra" tier, so a Codex-scale value can never be
 * sent as `claudeEffort`. Clamping happens upstream in
 * `clampCraneDispatchEffort`; this is the last-resort guard that keeps the
 * strict IPC schema from rejecting an otherwise valid approval.
 */
function toClaudeEffort(effort: CraneDispatchEffort): ClaudeEffort {
  return CLAUDE_EFFORT_OPTIONS.some((option) => option.value === effort)
    ? (effort as ClaudeEffort)
    : "high";
}

/**
 * The access-level runtime fields a Crane dispatch carries.
 *
 * This mirrors every field `provider-mode-presets.ts` patches. That is load
 * bearing: if a preset field were left out, the Crane job would run with the
 * provider runtime's own fallback for it rather than the preset value, and the
 * autonomy label shown at approval time would be a lie. `Manual` on Claude is
 * the sharp case - `claudeAllowUnsandboxedCommands` defaults to `true` in
 * `claude-sdk-runtime.ts`, which cancels out the sandbox `Manual` turns on.
 */
export interface CraneDispatchAccessState {
  claudePermissionMode: NonNullable<
    ProviderRuntimeOptions["claudePermissionMode"]
  >;
  claudeSandboxEnabled: boolean;
  claudeAllowUnsandboxedCommands: boolean;
  claudeAllowDangerouslySkipPermissions: boolean;
  codexFileAccess: NonNullable<ProviderRuntimeOptions["codexFileAccess"]>;
  codexNetworkAccess: boolean;
  codexApprovalPolicy: NonNullable<
    ProviderRuntimeOptions["codexApprovalPolicy"]
  >;
  codexWebSearch: NonNullable<ProviderRuntimeOptions["codexWebSearch"]>;
}

export interface CraneDispatchModelState {
  providerId: ProviderId;
  model: string;
  effort: CraneDispatchEffort;
  codexFastMode: boolean;
}

export function listCraneAutonomyOptions(args: { providerId: ProviderId }) {
  const presets =
    args.providerId === "claude-code"
      ? CLAUDE_PROVIDER_MODE_PRESETS
      : CODEX_PROVIDER_MODE_PRESETS;
  return presets.map((preset) => ({
    value: preset.id,
    label: preset.label,
    description: preset.description,
  }));
}

export function applyCraneAutonomyPreset(args: {
  providerId: ProviderId;
  presetId: ProviderModePresetId;
  access: CraneDispatchAccessState;
}): CraneDispatchAccessState {
  return args.providerId === "claude-code"
    ? {
        ...args.access,
        ...buildClaudeProviderModeSettingsPatch({ presetId: args.presetId }),
      }
    : {
        ...args.access,
        ...buildCodexProviderModeSettingsPatch({ presetId: args.presetId }),
      };
}

/**
 * Detects which autonomy preset the current access state matches. Compares the
 * full preset field set for the active provider, so a state that differs only
 * in a field with no dedicated control still reports as `Custom` rather than
 * borrowing a preset's name.
 */
export function detectCraneAutonomyPreset(args: {
  providerId: ProviderId;
  access: CraneDispatchAccessState;
}): ProviderModePresetId | null {
  const presets =
    args.providerId === "claude-code"
      ? CLAUDE_PROVIDER_MODE_PRESETS
      : CODEX_PROVIDER_MODE_PRESETS;
  const fields =
    args.providerId === "claude-code"
      ? ([
          "claudePermissionMode",
          "claudeSandboxEnabled",
          "claudeAllowUnsandboxedCommands",
          "claudeAllowDangerouslySkipPermissions",
        ] as const)
      : ([
          "codexFileAccess",
          "codexApprovalPolicy",
          "codexNetworkAccess",
          "codexWebSearch",
        ] as const);
  for (const preset of presets) {
    const expected = applyCraneAutonomyPreset({
      providerId: args.providerId,
      presetId: preset.id,
      access: args.access,
    });
    if (fields.every((field) => expected[field] === args.access[field])) {
      return preset.id;
    }
  }
  return null;
}

export function describeCraneAccess(args: {
  providerId: ProviderId;
  access: CraneDispatchAccessState;
}) {
  if (args.providerId === "claude-code") {
    return [
      `Permission ${args.access.claudePermissionMode}`,
      `Sandbox ${args.access.claudeSandboxEnabled ? "on" : "off"}`,
      `Unsandboxed ${args.access.claudeAllowUnsandboxedCommands ? "on" : "off"}`,
      `Dangerous Skip ${
        args.access.claudeAllowDangerouslySkipPermissions ? "on" : "off"
      }`,
    ].join(" / ");
  }
  return [
    `Files ${args.access.codexFileAccess}`,
    `Approvals ${args.access.codexApprovalPolicy}`,
    `Network ${args.access.codexNetworkAccess ? "on" : "off"}`,
    `Web ${args.access.codexWebSearch}`,
  ].join(" / ");
}

export function listCraneEffortOptions(args: {
  providerId: ProviderId;
  model: string;
}): readonly { value: CraneDispatchEffort; label: string }[] {
  return args.providerId === "claude-code"
    ? CLAUDE_EFFORT_OPTIONS
    : listCodexEffortOptionsForModel({ model: args.model });
}

/**
 * The effort a Crane dispatch should default to: the same value a normal
 * interactive turn on that provider/model would use, including any per-model
 * runtime preference the user pinned in the composer.
 */
export function resolveCraneDispatchEffort(args: {
  settings: ModelRuntimePreferenceSettings;
  providerId: ProviderId;
  model: string;
}): CraneDispatchEffort {
  const runtimeSettings = applyModelRuntimePreference({
    settings: args.settings,
    providerId: args.providerId,
    model: args.model,
  });
  return args.providerId === "claude-code"
    ? runtimeSettings.claudeEffort
    : runtimeSettings.codexReasoningEffort;
}

/**
 * Keeps a held effort valid after a model switch (e.g. GPT-5.6 Luna drops the
 * "ultra" tier), falling back to the provider/model default instead of sending
 * an effort the model would reject.
 */
export function clampCraneDispatchEffort(args: {
  settings: ModelRuntimePreferenceSettings;
  providerId: ProviderId;
  model: string;
  effort: CraneDispatchEffort;
}): CraneDispatchEffort {
  const options = listCraneEffortOptions({
    providerId: args.providerId,
    model: args.model,
  });
  if (options.some((option) => option.value === args.effort)) {
    return args.effort;
  }
  const fallback = resolveCraneDispatchEffort({
    settings: args.settings,
    providerId: args.providerId,
    model: args.model,
  });
  return options.some((option) => option.value === fallback)
    ? fallback
    : (options[0]?.value ?? args.effort);
}

/**
 * Access defaults for a dispatch, resolved the same way the composer resolves
 * them: through `applyModelRuntimePreference`, so a mode the user pinned to
 * this specific model wins over the global provider setting.
 */
export function resolveCraneDispatchAccessDefaults(args: {
  settings: ModelRuntimePreferenceSettings;
  providerId: ProviderId;
  model: string;
}): CraneDispatchAccessState {
  const settings = applyModelRuntimePreference({
    settings: args.settings,
    providerId: args.providerId,
    model: args.model,
  });
  return {
    claudePermissionMode: settings.claudePermissionMode,
    claudeSandboxEnabled: settings.claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands: settings.claudeAllowUnsandboxedCommands,
    claudeAllowDangerouslySkipPermissions:
      settings.claudeAllowDangerouslySkipPermissions,
    codexFileAccess: settings.codexFileAccess,
    codexNetworkAccess: settings.codexNetworkAccess,
    codexApprovalPolicy: settings.codexApprovalPolicy,
    codexWebSearch: settings.codexWebSearch,
  };
}

/**
 * Re-seeds access for a newly selected provider while preserving an explicit
 * autonomy choice. Without this, switching provider in the picker would drop a
 * deliberate `Manual` and silently adopt the other provider's Stave default,
 * which may be the most permissive preset.
 */
export function reseedCraneAccessForProvider(args: {
  settings: ModelRuntimePreferenceSettings;
  previous: { providerId: ProviderId; access: CraneDispatchAccessState };
  next: { providerId: ProviderId; model: string };
}): CraneDispatchAccessState {
  if (args.previous.providerId === args.next.providerId) {
    return args.previous.access;
  }
  const defaults = resolveCraneDispatchAccessDefaults({
    settings: args.settings,
    providerId: args.next.providerId,
    model: args.next.model,
  });
  const carried = detectCraneAutonomyPreset({
    providerId: args.previous.providerId,
    access: args.previous.access,
  });
  // A hand-edited ("Custom") state has no equivalent on the other provider, so
  // fall back to that provider's own defaults rather than inventing a mapping.
  return carried
    ? applyCraneAutonomyPreset({
        providerId: args.next.providerId,
        presetId: carried,
        access: defaults,
      })
    : defaults;
}

/**
 * Seeds the model/effort controls for a new approval: the remembered team
 * runtime when one exists and still validates, otherwise the user's current
 * Stave defaults for the draft provider.
 */
export function resolveCraneDispatchModelDefaults(args: {
  settings: ModelRuntimePreferenceSettings;
  draftProvider: ProviderId;
  memory?: CraneTeamRuntimeMemory | null;
  /**
   * Model ids currently offered by the picker. A remembered model that is no
   * longer in the catalog (retired id, dynamic Codex catalog change) is
   * discarded instead of being sent to the provider or shown as a selection
   * with no matching row in the picker.
   */
  availableModels?: readonly string[];
}): CraneDispatchModelState {
  const memory =
    args.memory &&
    (!args.availableModels ||
      args.availableModels.includes(args.memory.model))
      ? args.memory
      : null;
  const providerId = memory?.provider ?? args.draftProvider;
  const model =
    memory?.model ??
    (providerId === "claude-code"
      ? args.settings.modelClaude
      : args.settings.modelCodex);
  const effort = clampCraneDispatchEffort({
    settings: args.settings,
    providerId,
    model,
    effort:
      memory?.effort ??
      resolveCraneDispatchEffort({
        settings: args.settings,
        providerId,
        model,
      }),
  });
  return {
    providerId,
    model,
    effort,
    codexFastMode: memory?.fastMode ?? args.settings.codexFastMode,
  };
}

export function buildCraneTeamRuntimeMemory(args: {
  model: CraneDispatchModelState;
}): CraneTeamRuntimeMemory {
  return {
    provider: args.model.providerId,
    model: args.model.model,
    effort: args.model.effort,
    ...(args.model.providerId === "codex"
      ? { fastMode: args.model.codexFastMode }
      : {}),
  };
}

/**
 * Builds the exact `runtime` block sent over IPC. Centralized so the effort
 * fields cannot be dropped again the way they were before: the union member is
 * assembled in one place and the schema requires them.
 */
export function buildCraneDispatchRuntimeChoice(args: {
  model: CraneDispatchModelState;
  access: CraneDispatchAccessState;
  providerTimeoutMs: number;
  advisorTarget: AdvisorTarget | null;
}): CraneDispatchApprovalResponse["runtime"] {
  if (args.model.providerId === "claude-code") {
    return {
      provider: "claude-code",
      model: args.model.model,
      providerTimeoutMs: args.providerTimeoutMs,
      claudePermissionMode: args.access.claudePermissionMode,
      claudeSandboxEnabled: args.access.claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands:
        args.access.claudeAllowUnsandboxedCommands,
      claudeAllowDangerouslySkipPermissions:
        args.access.claudeAllowDangerouslySkipPermissions,
      claudeEffort: toClaudeEffort(args.model.effort),
      advisorTarget: args.advisorTarget,
    };
  }
  return {
    provider: "codex",
    model: args.model.model,
    providerTimeoutMs: args.providerTimeoutMs,
    codexFileAccess: args.access.codexFileAccess,
    codexNetworkAccess: args.access.codexNetworkAccess,
    codexApprovalPolicy: args.access.codexApprovalPolicy,
    codexWebSearch: args.access.codexWebSearch,
    codexReasoningEffort: args.model.effort,
    codexFastMode: args.model.codexFastMode,
    advisorTarget: args.advisorTarget,
  };
}

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
import {
  normalizeAdvisorConsultLimit,
  resolveAdvisorArmState,
  resolveAdvisorSelectedProviderId,
} from "@/lib/providers/advisor";
import type {
  AdvisorTarget,
  AdvisorTargetByProvider,
  ManagedExecutionProviderId,
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
  providerId: ManagedExecutionProviderId;
  model: string;
  effort: CraneDispatchEffort;
  codexFastMode: boolean;
}

export function listCraneAutonomyOptions(args: {
  providerId: ManagedExecutionProviderId;
}) {
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
  providerId: ManagedExecutionProviderId;
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
  providerId: ManagedExecutionProviderId;
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
  providerId: ManagedExecutionProviderId;
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
  providerId: ManagedExecutionProviderId;
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
  providerId: ManagedExecutionProviderId;
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
  providerId: ManagedExecutionProviderId;
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
  providerId: ManagedExecutionProviderId;
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
  previous: {
    providerId: ManagedExecutionProviderId;
    access: CraneDispatchAccessState;
  };
  next: { providerId: ManagedExecutionProviderId; model: string };
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
  const providerId: ManagedExecutionProviderId =
    memory?.provider ??
    (args.draftProvider === "claude-code" || args.draftProvider === "codex"
      ? args.draftProvider
      : "claude-code");
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

/**
 * Advisor controls in the approval dialog.
 *
 * The same three-part shape every other Advisor surface uses: arming is
 * separate from configuring, and each provider keeps its own model and tier so
 * switching provider and back is not a destructive edit. Held per approval
 * rather than written to Stave settings, because approving one dispatch must
 * not silently redefine the user's global default.
 */
export interface CraneDispatchAdvisorState {
  /** Whether this dispatch actually pays for an Advisor. */
  enabled: boolean;
  /** Provider the dialog is configuring, armed or not. */
  providerId: ManagedExecutionProviderId;
  /** Fully populated, so an unarmed provider still has a model and tier. */
  targetByProvider: Record<ManagedExecutionProviderId, AdvisorTarget>;
}

/** The Advisor fields this seeding reads out of Stave settings. */
export interface CraneDispatchAdvisorSettings {
  advisorEnabled: boolean;
  advisorTarget: AdvisorTarget | null;
  advisorTargetByProvider: AdvisorTargetByProvider;
  advisorConsultLimit: number;
}

/**
 * Seeds the Advisor controls for a new approval.
 *
 * Precedence is the team's remembered choice, then the Stave default. A team
 * memory without an `advisor` key is a team mapped before Advisor became
 * rememberable, so it inherits the default rather than reading as an explicit
 * "off" — otherwise every existing mapping would silently disarm the Advisor.
 */
export function resolveCraneDispatchAdvisorDefaults(args: {
  settings: CraneDispatchAdvisorSettings;
  memory?: CraneTeamRuntimeMemory | null;
  /** Provider that will run the dispatched turn, for the opposite-side default. */
  primaryProviderId: ManagedExecutionProviderId;
}): CraneDispatchAdvisorState {
  const remembered = args.memory ? args.memory.advisor : undefined;
  const arm = resolveAdvisorArmState({
    overrides:
      remembered === undefined
        ? null
        : remembered === null
          ? { advisorEnabled: false }
          : { advisorEnabled: true, advisorTarget: remembered },
    settingsEnabled: args.settings.advisorEnabled,
    settingsTarget: args.settings.advisorTarget,
    settingsTargetByProvider: args.settings.advisorTargetByProvider,
  });
  return {
    enabled: arm.enabled,
    providerId: resolveAdvisorSelectedProviderId({
      arm,
      primaryProviderId: args.primaryProviderId,
    }),
    targetByProvider: arm.targetByProvider,
  };
}

/**
 * Records a model or tier pick for the provider it belongs to, leaving the
 * other provider's pick untouched.
 */
export function selectCraneDispatchAdvisorTarget(args: {
  advisor: CraneDispatchAdvisorState;
  target: AdvisorTarget;
}): CraneDispatchAdvisorState {
  return {
    ...args.advisor,
    providerId: args.target.providerId,
    targetByProvider: {
      ...args.advisor.targetByProvider,
      [args.target.providerId]: args.target,
    },
  };
}

/** The target this dispatch will actually send — `null` whenever disarmed. */
export function resolveCraneDispatchAdvisorTarget(
  advisor: CraneDispatchAdvisorState,
): AdvisorTarget | null {
  return advisor.enabled ? advisor.targetByProvider[advisor.providerId] : null;
}

/**
 * An Advisor and the budget it may spend, or `null` for no Advisor.
 *
 * One value rather than two arguments so a target can never be sent without a
 * consult ceiling. That pairing is what the IPC schema enforces, and dropping
 * the ceiling is not a cosmetic loss: the runtime would silently substitute its
 * own default and ignore a budget the user lowered on purpose.
 */
export type CraneDispatchAdvisorChoice = {
  target: AdvisorTarget;
  consultLimit: number;
} | null;

export function resolveCraneDispatchAdvisorChoice(args: {
  advisor: CraneDispatchAdvisorState;
  /** The user's configured Stave ceiling, normalized here. */
  consultLimit: number;
}): CraneDispatchAdvisorChoice {
  const target = resolveCraneDispatchAdvisorTarget(args.advisor);
  return target
    ? {
        target,
        consultLimit: normalizeAdvisorConsultLimit(args.consultLimit),
      }
    : null;
}

export function buildCraneTeamRuntimeMemory(args: {
  model: CraneDispatchModelState;
  advisor: CraneDispatchAdvisorState;
}): CraneTeamRuntimeMemory {
  return {
    provider: args.model.providerId,
    model: args.model.model,
    effort: args.model.effort,
    ...(args.model.providerId === "codex"
      ? { fastMode: args.model.codexFastMode }
      : {}),
    // Always written, including as an explicit `null`, so remembering an
    // Advisor-free dispatch is a real choice rather than an absent key that
    // would re-inherit the global default on the next job.
    advisor: resolveCraneDispatchAdvisorTarget(args.advisor),
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
  advisor: CraneDispatchAdvisorChoice;
}): CraneDispatchApprovalResponse["runtime"] {
  const advisor = args.advisor
    ? {
        advisorTarget: args.advisor.target,
        advisorConsultLimit: normalizeAdvisorConsultLimit(
          args.advisor.consultLimit,
        ),
      }
    : { advisorTarget: null };
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
      ...advisor,
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
    ...advisor,
  };
}

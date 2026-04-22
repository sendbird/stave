import type {
  ProviderId,
  ProviderRuntimeOptions,
  StaveAutoIntent,
  StaveAutoProfile,
  StaveAutoRoleName,
  StaveAutoRoleRuntimeOverrides,
  StaveAutoRoleRuntimeOverridesMap,
  StaveWorkerRole,
} from "@/lib/providers/provider.types";
import {
  DEFAULT_CLAUDE_OPUS_1M_MODEL,
  DEFAULT_CLAUDE_OPUS_MODEL,
} from "@/lib/providers/model-catalog";

export type StaveAutoModelPresetId =
  | "recommended"
  | "recommended-1m"
  | "claude-only"
  | "codex-only";

type StaveAutoModelProfile = {
  classifierModel: string;
  supervisorModel: string;
  planModel: string;
  analyzeModel: string;
  implementModel: string;
  quickEditModel: string;
  generalModel: string;
  verifyModel: string;
};

export interface StaveAutoModelSettingsPatch {
  staveAutoClassifierModel: string;
  staveAutoSupervisorModel: string;
  staveAutoPlanModel: string;
  staveAutoAnalyzeModel: string;
  staveAutoImplementModel: string;
  staveAutoQuickEditModel: string;
  staveAutoGeneralModel: string;
  staveAutoVerifyModel: string;
}

type StaveAutoSettingsLike = StaveAutoModelSettingsPatch & {
  staveAutoOrchestrationMode: StaveAutoProfile["orchestrationMode"];
  staveAutoMaxSubtasks: number;
  staveAutoMaxParallelSubtasks: number;
  staveAutoAllowCrossProviderWorkers: boolean;
  staveAutoFastMode: boolean;
  staveAutoRoleRuntimeOverrides: StaveAutoRoleRuntimeOverridesMap;
  claudeFastModeVisible: boolean;
  codexFastModeVisible: boolean;
  promptSupervisorBreakdown?: string;
  promptSupervisorSynthesis?: string;
  promptPreprocessorClassifier?: string;
};

export const STAVE_AUTO_ROLE_NAMES = [
  "classifier",
  "supervisor",
  "plan",
  "analyze",
  "implement",
  "quick_edit",
  "general",
  "verify",
] as const satisfies readonly StaveAutoRoleName[];

function createEmptyRoleRuntimeOverrides(): StaveAutoRoleRuntimeOverrides {
  return {
    claude: {
      permissionMode: "auto",
      thinkingMode: "adaptive",
      effort: "medium",
      fastMode: false,
    },
    codex: {
      approvalPolicy: "untrusted",
      reasoningEffort: "medium",
      fastMode: false,
    },
  };
}

export function createDefaultStaveAutoRoleRuntimeOverrides(): StaveAutoRoleRuntimeOverridesMap {
  return {
    classifier: createEmptyRoleRuntimeOverrides(),
    supervisor: createEmptyRoleRuntimeOverrides(),
    plan: createEmptyRoleRuntimeOverrides(),
    analyze: createEmptyRoleRuntimeOverrides(),
    implement: createEmptyRoleRuntimeOverrides(),
    quick_edit: createEmptyRoleRuntimeOverrides(),
    general: createEmptyRoleRuntimeOverrides(),
    verify: createEmptyRoleRuntimeOverrides(),
  };
}

export function normalizeStaveAutoRoleRuntimeOverrides(args: {
  value?: Partial<StaveAutoRoleRuntimeOverridesMap> | null;
}): StaveAutoRoleRuntimeOverridesMap {
  const defaults = createDefaultStaveAutoRoleRuntimeOverrides();
  const rawValue = args.value;
  if (!rawValue || typeof rawValue !== "object") {
    return defaults;
  }

  const rawByRole = rawValue as Record<string, unknown>;

  for (const role of STAVE_AUTO_ROLE_NAMES) {
    const rawRole = rawByRole[role];
    if (!rawRole || typeof rawRole !== "object" || Array.isArray(rawRole)) {
      continue;
    }

    const roleValue = rawRole as Record<string, unknown>;
    const rawClaude = roleValue.claude;
    if (
      rawClaude &&
      typeof rawClaude === "object" &&
      !Array.isArray(rawClaude)
    ) {
      const claudeValue = rawClaude as Record<string, unknown>;
      if (
        claudeValue.permissionMode === "default" ||
        claudeValue.permissionMode === "acceptEdits" ||
        claudeValue.permissionMode === "bypassPermissions" ||
        claudeValue.permissionMode === "plan" ||
        claudeValue.permissionMode === "dontAsk" ||
        claudeValue.permissionMode === "auto"
      ) {
        defaults[role].claude.permissionMode = claudeValue.permissionMode;
      }
      if (
        claudeValue.thinkingMode === "adaptive" ||
        claudeValue.thinkingMode === "enabled" ||
        claudeValue.thinkingMode === "disabled"
      ) {
        defaults[role].claude.thinkingMode = claudeValue.thinkingMode;
      }
      if (
        claudeValue.effort === "low" ||
        claudeValue.effort === "medium" ||
        claudeValue.effort === "high" ||
        claudeValue.effort === "xhigh" ||
        claudeValue.effort === "max"
      ) {
        defaults[role].claude.effort = claudeValue.effort;
      }
      if (typeof claudeValue.fastMode === "boolean") {
        defaults[role].claude.fastMode = claudeValue.fastMode;
      }
    }

    const rawCodex = roleValue.codex;
    if (rawCodex && typeof rawCodex === "object" && !Array.isArray(rawCodex)) {
      const codexValue = rawCodex as Record<string, unknown>;
      if (
        codexValue.approvalPolicy === "never" ||
        codexValue.approvalPolicy === "on-request" ||
        codexValue.approvalPolicy === "untrusted"
      ) {
        defaults[role].codex.approvalPolicy = codexValue.approvalPolicy;
      }
      if (
        codexValue.reasoningEffort === "minimal" ||
        codexValue.reasoningEffort === "low" ||
        codexValue.reasoningEffort === "medium" ||
        codexValue.reasoningEffort === "high" ||
        codexValue.reasoningEffort === "xhigh"
      ) {
        defaults[role].codex.reasoningEffort = codexValue.reasoningEffort;
      }
      if (typeof codexValue.fastMode === "boolean") {
        defaults[role].codex.fastMode = codexValue.fastMode;
      }
    }
  }

  return defaults;
}

export const DEFAULT_STAVE_AUTO_MODEL_PRESET_ID: StaveAutoModelPresetId =
  "recommended";

export const STAVE_AUTO_MODEL_PRESETS = [
  {
    id: "recommended",
    label: "Recommended",
    description:
      "Balanced Claude + Codex mix. Supervisor uses Sonnet. Verify uses GPT-5.4.",
  },
  {
    id: "recommended-1m",
    label: "Recommended (1M)",
    description:
      "1M context for supervisor, analyze & general roles. Higher cost for longer sessions.",
  },
  {
    id: "claude-only",
    label: "Claude Only",
    description:
      "Keep every Stave Auto role on Claude models only, with supervisor on Sonnet.",
  },
  {
    id: "codex-only",
    label: "Codex Only",
    description:
      "Use GPT-5.4 Mini for lightweight classifier/supervisor/general/quick-edit roles and keep heavy work on GPT-5.4 / GPT-5.3-Codex.",
  },
] as const satisfies ReadonlyArray<{
  id: StaveAutoModelPresetId;
  label: string;
  description: string;
}>;

const STAVE_AUTO_MODEL_PRESET_PROFILES: Record<
  StaveAutoModelPresetId,
  StaveAutoModelProfile
> = {
  recommended: {
    classifierModel: "claude-haiku-4-5",
    supervisorModel: "claude-sonnet-4-6",
    planModel: "opusplan",
    analyzeModel: DEFAULT_CLAUDE_OPUS_MODEL,
    implementModel: "gpt-5.3-codex",
    quickEditModel: "claude-haiku-4-5",
    generalModel: "claude-sonnet-4-6",
    verifyModel: "gpt-5.4",
  },
  "recommended-1m": {
    classifierModel: "claude-haiku-4-5",
    supervisorModel: "claude-sonnet-4-6[1m]",
    planModel: "opusplan",
    analyzeModel: DEFAULT_CLAUDE_OPUS_1M_MODEL,
    implementModel: "gpt-5.3-codex",
    quickEditModel: "claude-haiku-4-5",
    generalModel: "claude-sonnet-4-6[1m]",
    verifyModel: "gpt-5.4",
  },
  "claude-only": {
    classifierModel: "claude-haiku-4-5",
    supervisorModel: "claude-sonnet-4-6",
    planModel: "opusplan",
    analyzeModel: DEFAULT_CLAUDE_OPUS_MODEL,
    implementModel: "claude-sonnet-4-6",
    quickEditModel: "claude-haiku-4-5",
    generalModel: "claude-sonnet-4-6",
    verifyModel: "claude-sonnet-4-6",
  },
  "codex-only": {
    classifierModel: "gpt-5.4-mini",
    supervisorModel: "gpt-5.4-mini",
    planModel: "gpt-5.4",
    analyzeModel: "gpt-5.4",
    implementModel: "gpt-5.3-codex",
    quickEditModel: "gpt-5.4-mini",
    generalModel: "gpt-5.4-mini",
    verifyModel: "gpt-5.4",
  },
};

function toSettingsPatch(args: {
  profile: StaveAutoModelProfile;
}): StaveAutoModelSettingsPatch {
  const { profile } = args;
  return {
    staveAutoClassifierModel: profile.classifierModel,
    staveAutoSupervisorModel: profile.supervisorModel,
    staveAutoPlanModel: profile.planModel,
    staveAutoAnalyzeModel: profile.analyzeModel,
    staveAutoImplementModel: profile.implementModel,
    staveAutoQuickEditModel: profile.quickEditModel,
    staveAutoGeneralModel: profile.generalModel,
    staveAutoVerifyModel: profile.verifyModel,
  };
}

export function buildStaveAutoModelSettingsPatch(args: {
  presetId: StaveAutoModelPresetId;
}): StaveAutoModelSettingsPatch {
  return toSettingsPatch({
    profile: STAVE_AUTO_MODEL_PRESET_PROFILES[args.presetId],
  });
}

export function detectStaveAutoModelPreset(args: {
  settings: StaveAutoModelSettingsPatch;
}): StaveAutoModelPresetId | null {
  for (const preset of STAVE_AUTO_MODEL_PRESETS) {
    const presetSettings = buildStaveAutoModelSettingsPatch({
      presetId: preset.id,
    });
    if (
      presetSettings.staveAutoClassifierModel ===
        args.settings.staveAutoClassifierModel &&
      presetSettings.staveAutoSupervisorModel ===
        args.settings.staveAutoSupervisorModel &&
      presetSettings.staveAutoPlanModel === args.settings.staveAutoPlanModel &&
      presetSettings.staveAutoAnalyzeModel ===
        args.settings.staveAutoAnalyzeModel &&
      presetSettings.staveAutoImplementModel ===
        args.settings.staveAutoImplementModel &&
      presetSettings.staveAutoQuickEditModel ===
        args.settings.staveAutoQuickEditModel &&
      presetSettings.staveAutoGeneralModel ===
        args.settings.staveAutoGeneralModel &&
      presetSettings.staveAutoVerifyModel === args.settings.staveAutoVerifyModel
    ) {
      return preset.id;
    }
  }
  return null;
}

export const DEFAULT_STAVE_AUTO_PROFILE: StaveAutoProfile = {
  ...STAVE_AUTO_MODEL_PRESET_PROFILES[DEFAULT_STAVE_AUTO_MODEL_PRESET_ID],
  orchestrationMode: "auto",
  maxSubtasks: 3,
  maxParallelSubtasks: 2,
  allowCrossProviderWorkers: true,
  claudeFastModeSupported: true,
  codexFastModeSupported: true,
  fastMode: false,
  roleRuntimeOverrides: createDefaultStaveAutoRoleRuntimeOverrides(),
};

export function buildStaveAutoProfileFromSettings(args: {
  settings: StaveAutoSettingsLike;
}): StaveAutoProfile {
  const { settings } = args;
  return {
    classifierModel: settings.staveAutoClassifierModel,
    supervisorModel: settings.staveAutoSupervisorModel,
    planModel: settings.staveAutoPlanModel,
    analyzeModel: settings.staveAutoAnalyzeModel,
    implementModel: settings.staveAutoImplementModel,
    quickEditModel: settings.staveAutoQuickEditModel,
    generalModel: settings.staveAutoGeneralModel,
    verifyModel: settings.staveAutoVerifyModel,
    orchestrationMode: settings.staveAutoOrchestrationMode,
    maxSubtasks: settings.staveAutoMaxSubtasks,
    maxParallelSubtasks: settings.staveAutoMaxParallelSubtasks,
    allowCrossProviderWorkers: settings.staveAutoAllowCrossProviderWorkers,
    claudeFastModeSupported: settings.claudeFastModeVisible,
    codexFastModeSupported: settings.codexFastModeVisible,
    fastMode: settings.staveAutoFastMode,
    roleRuntimeOverrides: normalizeStaveAutoRoleRuntimeOverrides({
      value: settings.staveAutoRoleRuntimeOverrides,
    }),
    promptSupervisorBreakdown: settings.promptSupervisorBreakdown || undefined,
    promptSupervisorSynthesis: settings.promptSupervisorSynthesis || undefined,
    promptPreprocessorClassifier:
      settings.promptPreprocessorClassifier || undefined,
  };
}

export function resolveStaveProviderForModel(args: {
  model: string;
}): Exclude<ProviderId, "stave"> {
  const normalizedModel = args.model.trim().toLowerCase();
  if (normalizedModel.includes("codex") || normalizedModel.startsWith("gpt-")) {
    return "codex";
  }
  return "claude-code";
}

export function resolveStaveIntentModel(args: {
  profile: StaveAutoProfile;
  intent: StaveAutoIntent;
}): string {
  const { profile, intent } = args;
  switch (intent) {
    case "plan":
      return profile.planModel;
    case "analyze":
      return profile.analyzeModel;
    case "implement":
      return profile.implementModel;
    case "quick_edit":
      return profile.quickEditModel;
    case "general":
      return profile.generalModel;
  }
}

export function resolveStaveWorkerModel(args: {
  profile: StaveAutoProfile;
  role: StaveWorkerRole;
}): string {
  const { profile, role } = args;
  switch (role) {
    case "plan":
      return profile.planModel;
    case "analyze":
      return profile.analyzeModel;
    case "implement":
      return profile.implementModel;
    case "verify":
      return profile.verifyModel?.trim() || profile.analyzeModel;
    case "general":
      return profile.generalModel;
  }
}

export function applyStaveRoleRuntimeOverrides(args: {
  profile: StaveAutoProfile;
  role: StaveAutoRoleName;
  model: string;
  runtimeOptions?: ProviderRuntimeOptions;
}): ProviderRuntimeOptions {
  const nextRuntimeOptions: ProviderRuntimeOptions = {
    ...(args.runtimeOptions ?? {}),
  };
  const overrides = args.profile.roleRuntimeOverrides?.[args.role];
  if (!overrides) {
    return nextRuntimeOptions;
  }

  const providerId = resolveStaveProviderForModel({ model: args.model });
  if (providerId === "claude-code") {
    if (overrides.claude.permissionMode !== undefined) {
      nextRuntimeOptions.claudePermissionMode = overrides.claude.permissionMode;
    }
    if (overrides.claude.thinkingMode !== undefined) {
      nextRuntimeOptions.claudeThinkingMode = overrides.claude.thinkingMode;
    }
    if (overrides.claude.effort !== undefined) {
      nextRuntimeOptions.claudeEffort = overrides.claude.effort;
    }
    if (overrides.claude.fastMode !== undefined) {
      nextRuntimeOptions.claudeFastMode = overrides.claude.fastMode;
    }
    return nextRuntimeOptions;
  }

  if (overrides.codex.approvalPolicy !== undefined) {
    nextRuntimeOptions.codexApprovalPolicy = overrides.codex.approvalPolicy;
  }
  if (overrides.codex.reasoningEffort !== undefined) {
    nextRuntimeOptions.codexReasoningEffort = overrides.codex.reasoningEffort;
  }
  if (overrides.codex.fastMode !== undefined) {
    nextRuntimeOptions.codexFastMode = overrides.codex.fastMode;
  }
  return nextRuntimeOptions;
}

import type { AppSettings } from "@/store/app.store";

export type ProviderModePresetId = "manual" | "guided" | "auto";
export type ProviderModeDisplayId = ProviderModePresetId | "custom";

export interface ProviderModePresetDefinition {
  id: ProviderModePresetId;
  label: string;
  description: string;
}

type ClaudeProviderModeSettings = Pick<
  AppSettings,
  | "claudePermissionMode"
  | "claudeAllowDangerouslySkipPermissions"
  | "claudeSandboxEnabled"
  | "claudeAllowUnsandboxedCommands"
>;

type CodexProviderModeSettings = Pick<
  AppSettings,
  | "codexFileAccess"
  | "codexApprovalPolicy"
  | "codexNetworkAccess"
  | "codexWebSearch"
>;

export interface ProviderModePresentation {
  id: ProviderModeDisplayId;
  label: string;
  description: string;
  detail: string;
  tone: "default" | "accent" | "warning";
  planNote?: string;
}

export const CLAUDE_PROVIDER_MODE_PRESETS = [
  {
    id: "manual",
    label: "Manual",
    description: "Guarded Claude mode for review, audit, and explicit checkpoints.",
  },
  {
    id: "guided",
    label: "Guided",
    description: "Balanced default for normal Claude work without forcing a fully hands-off path.",
  },
  {
    id: "auto",
    label: "Auto",
    description: "Highest-autonomy Claude mode for trusted local automation with minimal interruptions.",
  },
] as const satisfies readonly ProviderModePresetDefinition[];

export const CODEX_PROVIDER_MODE_PRESETS = [
  {
    id: "manual",
    label: "Manual",
    description: "Inspect-first Codex mode with strict checkpoints and no write access.",
  },
  {
    id: "guided",
    label: "Guided",
    description: "Recommended App Server-style baseline for day-to-day implementation work.",
  },
  {
    id: "auto",
    label: "Auto",
    description: "Highest-autonomy Codex mode for trusted runs that should move without routine approval stops.",
  },
] as const satisfies readonly ProviderModePresetDefinition[];

const CLAUDE_PROVIDER_MODE_PATCHES: Record<ProviderModePresetId, ClaudeProviderModeSettings> = {
  manual: {
    claudePermissionMode: "default",
    claudeAllowDangerouslySkipPermissions: false,
    claudeSandboxEnabled: true,
    claudeAllowUnsandboxedCommands: false,
  },
  guided: {
    claudePermissionMode: "acceptEdits",
    claudeAllowDangerouslySkipPermissions: false,
    claudeSandboxEnabled: false,
    claudeAllowUnsandboxedCommands: true,
  },
  auto: {
    claudePermissionMode: "auto",
    claudeAllowDangerouslySkipPermissions: false,
    claudeSandboxEnabled: false,
    claudeAllowUnsandboxedCommands: true,
  },
};

const CODEX_PROVIDER_MODE_PATCHES: Record<ProviderModePresetId, CodexProviderModeSettings> = {
  manual: {
    codexFileAccess: "read-only",
    codexApprovalPolicy: "on-request",
    codexNetworkAccess: false,
    codexWebSearch: "disabled",
  },
  guided: {
    codexFileAccess: "workspace-write",
    codexApprovalPolicy: "untrusted",
    codexNetworkAccess: false,
    codexWebSearch: "cached",
  },
  auto: {
    codexFileAccess: "danger-full-access",
    codexApprovalPolicy: "never",
    codexNetworkAccess: true,
    codexWebSearch: "live",
  },
};

function findPresetDefinition(
  presets: readonly ProviderModePresetDefinition[],
  presetId: ProviderModePresetId,
) {
  const fallback = presets[0];
  if (!fallback) {
    throw new Error("Provider mode presets are required.");
  }
  return presets.find((preset) => preset.id === presetId) ?? fallback;
}

function formatClaudeModeDetail(settings: ClaudeProviderModeSettings) {
  return [
    `Permission ${settings.claudePermissionMode}`,
    `Sandbox ${settings.claudeSandboxEnabled ? "on" : "off"}`,
    `Unsandboxed ${settings.claudeAllowUnsandboxedCommands ? "on" : "off"}`,
    `Dangerous Skip ${settings.claudeAllowDangerouslySkipPermissions ? "on" : "off"}`,
  ].join(" / ");
}

function formatCodexModeDetail(settings: CodexProviderModeSettings) {
  return [
    `Files ${settings.codexFileAccess}`,
    `Approvals ${settings.codexApprovalPolicy}`,
    `Network ${settings.codexNetworkAccess ? "on" : "off"}`,
    `Web ${settings.codexWebSearch}`,
  ].join(" / ");
}

function toPresentation(args: {
  presetId: ProviderModePresetId | null;
  presets: readonly ProviderModePresetDefinition[];
  detail: string;
  planNote?: string;
}): ProviderModePresentation {
  if (!args.presetId) {
    return {
      id: "custom",
      label: "Custom",
      description: "This settings combination no longer matches a built-in preset.",
      detail: args.detail,
      tone: "warning",
      planNote: args.planNote,
    };
  }

  const preset = findPresetDefinition(args.presets, args.presetId);
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    detail: args.detail,
    tone: preset.id === "guided" ? "accent" : preset.id === "auto" ? "warning" : "default",
    planNote: args.planNote,
  };
}

export function buildClaudeProviderModeSettingsPatch(args: {
  presetId: ProviderModePresetId;
}): ClaudeProviderModeSettings {
  return { ...CLAUDE_PROVIDER_MODE_PATCHES[args.presetId] };
}

export function buildCodexProviderModeSettingsPatch(args: {
  presetId: ProviderModePresetId;
}): CodexProviderModeSettings {
  return { ...CODEX_PROVIDER_MODE_PATCHES[args.presetId] };
}

export function detectClaudeProviderModePreset(args: {
  settings: ClaudeProviderModeSettings;
}): ProviderModePresetId | null {
  for (const preset of CLAUDE_PROVIDER_MODE_PRESETS) {
    const expected = CLAUDE_PROVIDER_MODE_PATCHES[preset.id];
    if (
      expected.claudePermissionMode === args.settings.claudePermissionMode
      && expected.claudeAllowDangerouslySkipPermissions === args.settings.claudeAllowDangerouslySkipPermissions
      && expected.claudeSandboxEnabled === args.settings.claudeSandboxEnabled
      && expected.claudeAllowUnsandboxedCommands === args.settings.claudeAllowUnsandboxedCommands
    ) {
      return preset.id;
    }
  }
  return null;
}

export function detectCodexProviderModePreset(args: {
  settings: CodexProviderModeSettings;
}): ProviderModePresetId | null {
  for (const preset of CODEX_PROVIDER_MODE_PRESETS) {
    const expected = CODEX_PROVIDER_MODE_PATCHES[preset.id];
    if (
      expected.codexFileAccess === args.settings.codexFileAccess
      && expected.codexApprovalPolicy === args.settings.codexApprovalPolicy
      && expected.codexNetworkAccess === args.settings.codexNetworkAccess
      && expected.codexWebSearch === args.settings.codexWebSearch
    ) {
      return preset.id;
    }
  }
  return null;
}

export function resolveClaudeProviderModePresentation(args: {
  settings: ClaudeProviderModeSettings;
  planMode?: boolean;
}): ProviderModePresentation {
  return toPresentation({
    presetId: detectClaudeProviderModePreset({ settings: args.settings }),
    presets: CLAUDE_PROVIDER_MODE_PRESETS,
    detail: formatClaudeModeDetail(args.settings),
    planNote: args.planMode
      ? "Plan is enabled for this draft, so the next Claude turn still runs in `plan` mode."
      : undefined,
  });
}

export function resolveCodexProviderModePresentation(args: {
  settings: CodexProviderModeSettings;
  planMode?: boolean;
}): ProviderModePresentation {
  return toPresentation({
    presetId: detectCodexProviderModePreset({ settings: args.settings }),
    presets: CODEX_PROVIDER_MODE_PRESETS,
    detail: formatCodexModeDetail(args.settings),
    planNote: args.planMode
      ? "Plan is enabled for this draft, so the next Codex turn is still forced to `read-only` + `never`."
      : undefined,
  });
}

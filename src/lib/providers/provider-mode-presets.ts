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

/**
 * Cursor and Kiro carry autonomy in a single field rather than a combination.
 *
 * Both runtimes take approval autonomy as process flags on the ACP subcommand,
 * not as per-turn protocol parameters, so there is nothing else for a preset to
 * coordinate. `custom` is therefore unreachable for these two providers.
 */
type CursorProviderModeSettings = Pick<AppSettings, "cursorApprovalMode">;

type KiroProviderModeSettings = Pick<AppSettings, "kiroApprovalMode">;

export type CursorApprovalMode = AppSettings["cursorApprovalMode"];

export type KiroApprovalMode = AppSettings["kiroApprovalMode"];

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
    id: "auto",
    label: "Auto",
    description:
      "Highest-autonomy Claude mode for trusted local automation with minimal interruptions.",
  },
  {
    id: "guided",
    label: "Guided",
    description:
      "Balanced default for normal Claude work without forcing a fully hands-off path.",
  },
  {
    id: "manual",
    label: "Manual",
    description:
      "Guarded Claude mode for review, audit, and explicit checkpoints.",
  },
] as const satisfies readonly ProviderModePresetDefinition[];

export const CODEX_PROVIDER_MODE_PRESETS = [
  {
    id: "auto",
    label: "Auto",
    description:
      "Highest-autonomy Codex mode for trusted runs that should move without routine approval stops.",
  },
  {
    id: "guided",
    label: "Guided",
    description:
      "Recommended App Server-style baseline for day-to-day implementation work.",
  },
  {
    id: "manual",
    label: "Manual",
    description:
      "Inspect-first Codex mode with strict checkpoints and no write access.",
  },
] as const satisfies readonly ProviderModePresetDefinition[];

export const CURSOR_PROVIDER_MODE_PRESETS = [
  {
    id: "auto",
    label: "Auto",
    description:
      "Cursor runs every tool call and MCP server without asking. Use only in trusted workspaces.",
  },
  {
    id: "guided",
    label: "Guided",
    description:
      "Cursor's own Auto-review classifier runs the calls it judges safe and asks for the rest.",
  },
  {
    id: "manual",
    label: "Manual",
    description:
      "Cursor asks before every tool call. Nothing runs without an explicit approval.",
  },
] as const satisfies readonly ProviderModePresetDefinition[];

/**
 * Kiro deliberately has no Guided tier.
 *
 * `kiro-cli acp --trust-tools` accepts unknown tool names without an error, so a
 * middle tier built on it could silently trust nothing and present as Guided.
 * Two honest tiers beat three where one cannot be verified.
 */
export const KIRO_PROVIDER_MODE_PRESETS = [
  {
    id: "auto",
    label: "Auto",
    description:
      "Kiro auto-approves every tool permission request. Use only in trusted workspaces.",
  },
  {
    id: "manual",
    label: "Manual",
    description:
      "Kiro asks before every tool call. Nothing runs without an explicit approval.",
  },
] as const satisfies readonly ProviderModePresetDefinition[];

const CLAUDE_PROVIDER_MODE_PATCHES: Record<
  ProviderModePresetId,
  ClaudeProviderModeSettings
> = {
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

const CODEX_PROVIDER_MODE_PATCHES: Record<
  ProviderModePresetId,
  CodexProviderModeSettings
> = {
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

const CURSOR_PROVIDER_MODE_PATCHES: Record<
  ProviderModePresetId,
  CursorProviderModeSettings
> = {
  manual: { cursorApprovalMode: "manual" },
  guided: { cursorApprovalMode: "guided" },
  auto: { cursorApprovalMode: "auto" },
};

const KIRO_PROVIDER_MODE_PATCHES: Record<
  KiroApprovalMode,
  KiroProviderModeSettings
> = {
  manual: { kiroApprovalMode: "manual" },
  auto: { kiroApprovalMode: "auto" },
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

function formatCursorModeDetail(settings: CursorProviderModeSettings) {
  return settings.cursorApprovalMode === "auto"
    ? "Approvals off / MCP auto-approved (--force --approve-mcps)"
    : settings.cursorApprovalMode === "guided"
      ? "Auto-review classifier (--auto-review)"
      : "Approve every tool call";
}

function formatKiroModeDetail(settings: KiroProviderModeSettings) {
  return settings.kiroApprovalMode === "auto"
    ? "Approvals off (--trust-all-tools)"
    : "Approve every tool call";
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
      description:
        "This settings combination no longer matches a built-in preset.",
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
    tone:
      preset.id === "guided"
        ? "accent"
        : preset.id === "auto"
          ? "warning"
          : "default",
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
      expected.claudePermissionMode === args.settings.claudePermissionMode &&
      expected.claudeAllowDangerouslySkipPermissions ===
        args.settings.claudeAllowDangerouslySkipPermissions &&
      expected.claudeSandboxEnabled === args.settings.claudeSandboxEnabled &&
      expected.claudeAllowUnsandboxedCommands ===
        args.settings.claudeAllowUnsandboxedCommands
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
      expected.codexFileAccess === args.settings.codexFileAccess &&
      expected.codexApprovalPolicy === args.settings.codexApprovalPolicy &&
      expected.codexNetworkAccess === args.settings.codexNetworkAccess &&
      expected.codexWebSearch === args.settings.codexWebSearch
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

export function buildCursorProviderModeSettingsPatch(args: {
  presetId: ProviderModePresetId;
}): CursorProviderModeSettings {
  return { ...CURSOR_PROVIDER_MODE_PATCHES[args.presetId] };
}

export function buildKiroProviderModeSettingsPatch(args: {
  presetId: ProviderModePresetId;
}): KiroProviderModeSettings {
  // Kiro has no Guided tier; a preset id it cannot honor resolves to Manual so
  // an imported or stale preference can never silently mean "trust everything".
  return {
    ...(KIRO_PROVIDER_MODE_PATCHES[args.presetId as KiroApprovalMode] ??
      KIRO_PROVIDER_MODE_PATCHES.manual),
  };
}

export function detectCursorProviderModePreset(args: {
  settings: CursorProviderModeSettings;
}): ProviderModePresetId | null {
  return (
    CURSOR_PROVIDER_MODE_PRESETS.find(
      (preset) =>
        CURSOR_PROVIDER_MODE_PATCHES[preset.id].cursorApprovalMode ===
        args.settings.cursorApprovalMode,
    )?.id ?? null
  );
}

export function detectKiroProviderModePreset(args: {
  settings: KiroProviderModeSettings;
}): ProviderModePresetId | null {
  return (
    KIRO_PROVIDER_MODE_PRESETS.find(
      (preset) =>
        KIRO_PROVIDER_MODE_PATCHES[preset.id as KiroApprovalMode]
          ?.kiroApprovalMode === args.settings.kiroApprovalMode,
    )?.id ?? null
  );
}

export function resolveCursorProviderModePresentation(args: {
  settings: CursorProviderModeSettings;
  planMode?: boolean;
}): ProviderModePresentation {
  return toPresentation({
    presetId: detectCursorProviderModePreset({ settings: args.settings }),
    presets: CURSOR_PROVIDER_MODE_PRESETS,
    detail: formatCursorModeDetail(args.settings),
    planNote: args.planMode
      ? "Plan is enabled for this draft, so the next Cursor turn still runs in the read-only `plan` session mode."
      : undefined,
  });
}

export function resolveKiroProviderModePresentation(args: {
  settings: KiroProviderModeSettings;
}): ProviderModePresentation {
  return toPresentation({
    presetId: detectKiroProviderModePreset({ settings: args.settings }),
    presets: KIRO_PROVIDER_MODE_PRESETS,
    detail: formatKiroModeDetail(args.settings),
  });
}

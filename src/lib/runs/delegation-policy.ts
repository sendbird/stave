import { z } from "zod";
import { agentPermissionOverrides } from "@/lib/agents/permission";

/** Only execution permissions cross this boundary; secrets, sessions and browser grants never do. */
export const DelegationPermissionOptionsSchema = z.object({
  claudePermissionMode: z
    .enum([
      "default",
      "acceptEdits",
      "bypassPermissions",
      "plan",
      "dontAsk",
      "auto",
    ])
    .optional(),
  claudePlanModeApprovalScope: z
    .enum(["strict", "bash", "bashAndTask", "bashTaskAndMcp"])
    .optional(),
  claudeAllowDangerouslySkipPermissions: z.boolean().optional(),
  claudeSandboxEnabled: z.boolean().optional(),
  claudeAllowUnsandboxedCommands: z.boolean().optional(),
  claudeSandboxCredentialFiles: z.array(z.string()).optional(),
  claudeSandboxCredentialEnvVars: z.array(z.string()).optional(),
  claudeAllowedTools: z.array(z.string()).optional(),
  claudeDisallowedTools: z.array(z.string()).optional(),
  codexFileAccess: z
    .enum(["read-only", "workspace-write", "danger-full-access"])
    .optional(),
  codexApprovalPolicy: z
    .enum(["never", "on-request", "on-failure", "untrusted"])
    .optional(),
  codexNetworkAccess: z.boolean().optional(),
  codexAutoApproveStaveLocalMcpTools: z.boolean().optional(),
});
export type DelegationPermissionOptions = z.infer<
  typeof DelegationPermissionOptionsSchema
>;
export const DelegationPermissionPolicySchema = z
  .object({
    providerId: z.enum(["claude-code", "codex"]),
    source: z.enum([
      "parent-turn",
      "provider-settings",
      "recorded-delegation",
      "provider-default",
    ]),
    requestedProfile: z.enum(["inherit", "auto", "guided", "manual"]),
    options: DelegationPermissionOptionsSchema,
  })
  .strict();
export type DelegationPermissionPolicy = z.infer<
  typeof DelegationPermissionPolicySchema
>;
export const DelegationPermissionSettingsSchema = z
  .object({
    "claude-code": DelegationPermissionOptionsSchema,
    codex: DelegationPermissionOptionsSchema,
  })
  .strict();
export type DelegationPermissionSettings = z.infer<
  typeof DelegationPermissionSettingsSchema
>;

export function permissionOptions(
  providerId: "claude-code" | "codex",
  options: unknown = {},
): DelegationPermissionOptions {
  const scoped =
    options && typeof options === "object"
      ? Object.fromEntries(
          Object.entries(options).filter(
            ([key, value]) =>
              value !== undefined &&
              key.startsWith(providerId === "codex" ? "codex" : "claude"),
          ),
        )
      : options;
  return DelegationPermissionOptionsSchema.parse(scoped);
}

/** Missing user fields use guarded defaults rather than ambient process grants. */
export function normalizedPermissionOptions(
  providerId: "claude-code" | "codex",
  raw: unknown,
): DelegationPermissionOptions {
  const options = permissionOptions(providerId, raw);
  return providerId === "codex"
    ? {
        codexApprovalPolicy: "untrusted",
        codexFileAccess: "workspace-write",
        codexNetworkAccess: false,
        codexAutoApproveStaveLocalMcpTools: false,
        ...options,
      }
    : {
        claudePermissionMode: "default",
        claudePlanModeApprovalScope:
          options.claudePermissionMode === "plan" ? "bashTaskAndMcp" : "strict",
        claudeAllowDangerouslySkipPermissions: false,
        claudeSandboxEnabled: true,
        claudeAllowUnsandboxedCommands: false,
        claudeAllowedTools: [],
        ...options,
      };
}

export function resolveDelegationPermissionPolicy(args: {
  providerId: "claude-code" | "codex";
  permissionProfile?: "inherit" | "auto" | "guided" | "manual";
  parent?: {
    providerId: "claude-code" | "codex";
    options: DelegationPermissionOptions;
  } | null;
  settings?: DelegationPermissionOptions | null;
  recorded?: DelegationPermissionPolicy | null;
  permissionCeiling?: import("@/lib/agents/schema").AgentPermission;
}): DelegationPermissionPolicy {
  const profile = args.permissionProfile ?? "inherit";
  const parent =
    args.parent?.providerId === args.providerId ? args.parent : null;
  const source = args.recorded
    ? "recorded-delegation"
    : parent
      ? "parent-turn"
      : args.settings
        ? "provider-settings"
        : "provider-default";
  let options = normalizedPermissionOptions(
    args.providerId,
    args.recorded?.options ?? parent?.options ?? args.settings ?? {},
  );
  if (args.recorded) {
    options = restrictPermissionOptions(
      options,
      normalizedPermissionOptions(
        args.providerId,
        parent?.options ?? args.settings ?? {},
      ),
    );
  }
  // Profiles are ceilings. In particular, `auto` from a model is not a grant.
  if (profile === "manual" || profile === "guided") {
    options = restrictPermissionOptions(
      options,
      agentPermissionOverrides({
        permission: profile,
        providerId: args.providerId,
        options,
      }),
    );
    if (args.providerId === "claude-code" && options.claudeAllowedTools)
      options.claudeAllowedTools = [];
    if (args.providerId === "codex")
      options.codexAutoApproveStaveLocalMcpTools = false;
  }
  if (args.permissionCeiling)
    options = restrictPermissionOptions(
      options,
      agentPermissionOverrides({
        permission: args.permissionCeiling,
        providerId: args.providerId,
        options,
      }),
    );
  if (args.permissionCeiling && args.permissionCeiling !== "auto") {
    if (args.providerId === "codex")
      options.codexAutoApproveStaveLocalMcpTools = false;
    if (args.providerId === "claude-code" && options.claudeAllowedTools)
      options.claudeAllowedTools = [];
  }
  return {
    providerId: args.providerId,
    source,
    requestedProfile: profile,
    options,
  };
}

/** Reusing a snapshot can accept a new restriction but never a new grant. */
export function restrictPermissionOptions(
  recorded: DelegationPermissionOptions,
  current: DelegationPermissionOptions,
): DelegationPermissionOptions {
  const options = { ...recorded };
  const ranks = {
    codexFileAccess: ["read-only", "workspace-write", "danger-full-access"],
    codexApprovalPolicy: ["untrusted", "on-request", "on-failure", "never"],
  } as const;
  const previousMode = options.claudePermissionMode ?? "default";
  const currentMode = current.claudePermissionMode ?? "default";
  const hasClaudePolicy = Object.keys({ ...recorded, ...current }).some((key) =>
    key.startsWith("claude"),
  );
  // Plan and deny-by-default have different automatic grants; neither is a
  // generally narrower replacement for another mode. Refuse unrepresentable caps.
  const specialMode =
    previousMode === "plan" ||
    currentMode === "plan" ||
    previousMode === "dontAsk" ||
    currentMode === "dontAsk";
  if (hasClaudePolicy && specialMode && previousMode !== currentMode) {
    const other =
      previousMode === "plan" || previousMode === "dontAsk"
        ? currentMode
        : previousMode;
    const hasPlanMode = previousMode === "plan" || currentMode === "plan";
    if (other !== "bypassPermissions" && (hasPlanMode || other !== "auto"))
      throw new Error(
        "The current Claude permission restriction cannot be combined safely with the saved mode.",
      );
    options.claudePermissionMode =
      previousMode === "plan" || previousMode === "dontAsk"
        ? previousMode
        : currentMode;
  } else if (hasClaudePolicy) {
    const automaticModes = [
      "default",
      "acceptEdits",
      "auto",
      "bypassPermissions",
    ];
    options.claudePermissionMode =
      previousMode === currentMode ||
      automaticModes.indexOf(previousMode) <=
        automaticModes.indexOf(currentMode)
        ? previousMode
        : currentMode;
  }
  const planScopes = ["strict", "bash", "bashAndTask", "bashTaskAndMcp"];
  const oldScope =
    options.claudePlanModeApprovalScope ??
    (previousMode === "plan" ? "bashTaskAndMcp" : "strict");
  if (current.claudePlanModeApprovalScope)
    options.claudePlanModeApprovalScope =
      planScopes.indexOf(current.claudePlanModeApprovalScope) <
      planScopes.indexOf(oldScope)
        ? current.claudePlanModeApprovalScope
        : oldScope;
  for (const key of Object.keys(ranks) as Array<keyof typeof ranks>) {
    const rank: readonly string[] = ranks[key];
    const old =
      options[key] ??
      (key === "codexFileAccess" ? "workspace-write" : "untrusted");
    const next = current[key];
    if (next)
      Object.assign(options, {
        [key]: rank.indexOf(next) < rank.indexOf(old) ? next : old,
      });
  }
  for (const key of [
    "claudeAllowDangerouslySkipPermissions",
    "claudeAllowUnsandboxedCommands",
    "codexNetworkAccess",
    "codexAutoApproveStaveLocalMcpTools",
  ] as const) {
    if (current[key] === false) options[key] = false;
  }
  if (current.claudeSandboxEnabled) options.claudeSandboxEnabled = true;
  if (current.claudeDisallowedTools)
    options.claudeDisallowedTools = [
      ...new Set([
        ...(options.claudeDisallowedTools ?? []),
        ...current.claudeDisallowedTools,
      ]),
    ];
  for (const key of [
    "claudeSandboxCredentialFiles",
    "claudeSandboxCredentialEnvVars",
  ] as const) {
    if (current[key])
      options[key] = [...new Set([...(options[key] ?? []), ...current[key]])];
  }
  // These are approval-skip grants. Tightening may remove them, never add them.
  if (current.claudeAllowedTools && options.claudeAllowedTools)
    options.claudeAllowedTools = options.claudeAllowedTools.filter((tool) =>
      current.claudeAllowedTools!.includes(tool),
    );
  return options;
}

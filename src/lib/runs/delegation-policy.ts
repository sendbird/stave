import { z } from "zod";
import { agentPermissionOverrides, CLAUDE_EDIT_TOOLS } from "@/lib/agents/permission";
import {
  claudeReadOnlyDelegationOptions,
  codexReadOnlyDelegationOptions,
} from "./read-only-delegation";

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
  claudeSandboxReadOnly: z.boolean().optional(),
  claudeSandboxCredentialFiles: z.array(z.string()).optional(),
  claudeSandboxCredentialEnvVars: z.array(z.string()).optional(),
  claudeGuardrails: z.array(z.enum(["G1", "G2", "G3"])).optional(),
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
/**
 * What a delegation asks for. `inherit` takes the parent's policy for the same
 * provider, otherwise the target provider's user settings. `read-only` is a
 * fixed posture that never writes and never asks, so it can run beside other
 * work in the same workspace.
 */
export const DelegationAccessSchema = z.enum(["inherit", "read-only"]);
export type DelegationAccess = z.infer<typeof DelegationAccessSchema>;
export const DelegationPermissionPolicySchema = z
  .object({
    providerId: z.enum(["claude-code", "codex"]),
    source: z.enum([
      "parent-turn",
      "provider-settings",
      "recorded-delegation",
      "provider-default",
    ]),
    /** Provenance: the profile the caller named, even one no longer applied. */
    requestedProfile: z.enum(["inherit", "auto", "guided", "manual"]),
    /** The access the policy resolved to. Absent on policies recorded before it existed. */
    access: DelegationAccessSchema.optional(),
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
  access?: DelegationAccess;
  /** Provenance only, recorded instead of `permissionProfile` when set. */
  requestedProfile?: "inherit" | "auto" | "guided" | "manual";
  parent?: {
    providerId: "claude-code" | "codex";
    options: DelegationPermissionOptions;
  } | null;
  settings?: DelegationPermissionOptions | null;
  recorded?: DelegationPermissionPolicy | null;
  permissionCeiling?: import("@/lib/agents/schema").AgentPermission;
}): DelegationPermissionPolicy {
  const profile = args.permissionProfile ?? "inherit";
  const requestedProfile = args.requestedProfile ?? profile;
  const parent =
    args.parent?.providerId === args.providerId ? args.parent : null;
  const source = args.recorded
    ? "recorded-delegation"
    : parent
      ? "parent-turn"
      : args.settings
        ? "provider-settings"
        : "provider-default";
  // Read-only is pinned once recorded: a later start may narrow to it, never widen out of it.
  if (args.access === "read-only" || args.recorded?.access === "read-only") {
    return {
      providerId: args.providerId,
      source,
      requestedProfile,
      access: "read-only",
      options: readOnlyPermissionOptions(
        args.providerId,
        normalizedPermissionOptions(
          args.providerId,
          parent?.options ?? args.settings ?? {},
        ),
        args.recorded?.options,
      ),
    };
  }
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
    requestedProfile,
    access: "inherit",
    options,
  };
}

/**
 * The read-only posture under the policy it would otherwise inherit (and the
 * one recorded for an earlier attempt). It is never wider than either: it runs
 * only reads, so the inherited mode, approvals and allowlist cannot add to it,
 * and their denials, credential deny lists and network denial carry over.
 *
 * The profile and agent ceilings are not applied on top. Each ceiling caps
 * write authority and approval-skipping; a posture that cannot write and
 * auto-runs only reads is already under every one of them, and lowering
 * `dontAsk` to `default` would only bring back the prompts — or, for a
 * `plan` or `dontAsk` parent, refuse the combination outright.
 */
function readOnlyPermissionOptions(
  providerId: "claude-code" | "codex",
  inherited: DelegationPermissionOptions,
  recorded?: DelegationPermissionOptions,
): DelegationPermissionOptions {
  if (providerId === "codex") return codexReadOnlyDelegationOptions();
  const merged = (key: "claudeDisallowedTools" | "claudeSandboxCredentialFiles" | "claudeSandboxCredentialEnvVars") =>
    [...new Set([...(inherited[key] ?? []), ...(recorded?.[key] ?? [])])];
  return claudeReadOnlyDelegationOptions({
    claudeDisallowedTools: merged("claudeDisallowedTools"),
    claudeSandboxCredentialFiles: merged("claudeSandboxCredentialFiles"),
    claudeSandboxCredentialEnvVars: merged("claudeSandboxCredentialEnvVars"),
  });
}

/**
 * Whether a resolved policy provably cannot write the workspace, which is what
 * lets its child run beside another one there. Codex proves it with its
 * read-only sandbox. Claude needs the whole read-only posture — deny-by-default
 * mode, the edit tools removed and a sandbox that denies writes — because a
 * permission mode or a profile name alone does not stop Bash from writing.
 */
export function isReadOnlyDelegationPolicy(
  providerId: "claude-code" | "codex",
  policy: Partial<Pick<DelegationPermissionPolicy, "providerId" | "options">> | null | undefined,
): boolean {
  if (!policy?.options || policy.providerId !== providerId) return false;
  const options = policy.options;
  if (providerId === "codex") return options.codexFileAccess === "read-only";
  const disallowed = new Set(options.claudeDisallowedTools ?? []);
  return (
    options.claudePermissionMode === "dontAsk" &&
    options.claudeSandboxReadOnly === true &&
    options.claudeAllowDangerouslySkipPermissions !== true &&
    CLAUDE_EDIT_TOOLS.every((tool) => disallowed.has(tool))
  );
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
  if (current.claudeSandboxReadOnly) options.claudeSandboxReadOnly = true;
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
    "claudeGuardrails",
  ] as const) {
    const next = current[key] as string[] | undefined;
    if (next)
      Object.assign(options, { [key]: [...new Set([...(options[key] ?? []), ...next])] });
  }
  // These are approval-skip grants. Tightening may remove them, never add them.
  if (current.claudeAllowedTools && options.claudeAllowedTools)
    options.claudeAllowedTools = options.claudeAllowedTools.filter((tool) =>
      current.claudeAllowedTools!.includes(tool),
    );
  return options;
}

import { z } from "zod";
import { ProviderAccountProfileIdSchema, SYSTEM_ACCOUNT_PROFILE_ID } from "./provider-accounts";

export const CodexMcpDelegationSettingsSchema = z.object({
  enabled: z.boolean(),
  claudeAccountProfileId: ProviderAccountProfileIdSchema,
}).strict();

export type CodexMcpDelegationSettings = z.infer<typeof CodexMcpDelegationSettingsSchema>;

export const DEFAULT_CODEX_MCP_DELEGATION_SETTINGS: CodexMcpDelegationSettings = {
  enabled: false,
  claudeAccountProfileId: SYSTEM_ACCOUNT_PROFILE_ID,
};

export const CodexMcpDelegationPreviewArgsSchema = z.object({
  codexAccountProfileId: ProviderAccountProfileIdSchema,
  cwd: z.string().max(4096).optional(),
  codexBinaryPath: z.string().max(4096).optional(),
}).strict();

export type CodexMcpDelegationPreviewArgs = z.infer<typeof CodexMcpDelegationPreviewArgsSchema>;
export type CodexMcpDelegationPreview =
  | { ok: true; settings: CodexMcpDelegationSettings; servers: string[] | null }
  | { ok: false };

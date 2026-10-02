import { z } from "zod";
import { ClaudeGatewaySchema, type ClaudeGateway, type ClaudeGatewayCheckResult } from "./claude-gateway";
import type { ApiConnectionKind, ApiConnectionModel } from "./api-connections";

export const SYSTEM_ACCOUNT_PROFILE_ID = "system-default";
export const MAX_PROVIDER_ACCOUNT_PROFILES = 50;
export const ProviderAccountProviderIdSchema = z.enum(["claude-code", "codex"]);
export type ProviderAccountProviderId = z.infer<
  typeof ProviderAccountProviderIdSchema
>;
export const ProviderAccountProfileIdSchema = z.union([
  z.literal(SYSTEM_ACCOUNT_PROFILE_ID),
  z.uuid(),
]);

const LabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\u0000-\u001f\u007f]+$/);
const DirectorySchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes("\0"));

export const ProviderAccountCreateArgsSchema = z
  .object({
    providerId: ProviderAccountProviderIdSchema,
    label: LabelSchema,
    /** Omit to create an app-managed directory; existing directories are registered in place. */
    configDirectory: DirectorySchema.optional(),
    gateway: ClaudeGatewaySchema.optional(),
  })
  .strict();
export const ProviderAccountRenameArgsSchema = z
  .object({
    providerId: ProviderAccountProviderIdSchema,
    id: z.uuid(),
    label: LabelSchema,
  })
  .strict();
export const ProviderAccountRemoveArgsSchema =
  ProviderAccountRenameArgsSchema.omit({ label: true });
export const ProviderAccountLoginArgsSchema = z
  .object({
    providerId: ProviderAccountProviderIdSchema,
    profileId: ProviderAccountProfileIdSchema,
    workspaceId: z.string().min(1).max(200),
    workspacePath: DirectorySchema,
    binaryPath: DirectorySchema.optional(),
    cols: z.number().int().min(1).max(1000).optional(),
    rows: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export type ProviderAccountCreateArgs = z.infer<
  typeof ProviderAccountCreateArgsSchema
>;
export type ProviderAccountRenameArgs = z.infer<
  typeof ProviderAccountRenameArgsSchema
>;
export type ProviderAccountRemoveArgs = z.infer<
  typeof ProviderAccountRemoveArgsSchema
>;
export type ProviderAccountLoginArgs = z.infer<
  typeof ProviderAccountLoginArgsSchema
>;

export interface ProviderAccountProfile {
  id: string;
  providerId: ProviderAccountProviderId;
  label: string;
  kind: "system" | "managed" | "external";
  /** Nonsecret metadata only. Never contains native credentials. */
  configDirectory?: string;
  /**
   * Set on the entry an API connection contributes to this runtime's account
   * list: this runtime's endpoint, the key reference, and the pinned model IDs.
   * Selecting the entry selects API billing.
   */
  gateway?: ClaudeGateway;
  /** The shared API connection behind a `gateway` entry; its id is this entry's id. */
  apiConnection?: { label: string; kind: ApiConnectionKind; models: ApiConnectionModel[] };
}
export type ProviderAccountListResult =
  | { ok: true; profiles: ProviderAccountProfile[] }
  | { ok: false; profiles: []; message: string };
export type ProviderAccountSaveResult =
  | { ok: true; profile: ProviderAccountProfile }
  | { ok: false; message: string };
export type ProviderAccountRemoveResult = { ok: boolean; message?: string };
export type ProviderAccountLoginResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string };

export interface ProviderAccountsBridgeApi {
  checkGateway: (args: ProviderAccountRemoveArgs) => Promise<ClaudeGatewayCheckResult>;
  list: () => Promise<ProviderAccountListResult>;
  create: (
    args: ProviderAccountCreateArgs,
  ) => Promise<ProviderAccountSaveResult>;
  rename: (
    args: ProviderAccountRenameArgs,
  ) => Promise<ProviderAccountSaveResult>;
  remove: (
    args: ProviderAccountRemoveArgs,
  ) => Promise<ProviderAccountRemoveResult>;
  /** Native login runs in a PTY; attach/read/write/close through the terminal bridge. */
  login: (
    args: ProviderAccountLoginArgs,
  ) => Promise<ProviderAccountLoginResult>;
}

export const PROVIDER_ACCOUNT_IPC = {
  checkGateway: "provider-accounts:check-gateway",
  list: "provider-accounts:list",
  create: "provider-accounts:create",
  rename: "provider-accounts:rename",
  remove: "provider-accounts:remove",
  login: "provider-accounts:login",
} as const;

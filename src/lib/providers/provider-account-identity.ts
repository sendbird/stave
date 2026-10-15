import { i18n } from "@/i18n/runtime";
import { z } from "zod";
import {
  ProviderAccountProfileIdSchema,
  ProviderAccountProviderIdSchema,
} from "./provider-accounts";

/**
 * Who an account is signed in as. Only an email and a plan label cross the
 * bridge: the probe runs in Electron main and never returns a token, a key, or
 * raw CLI output.
 */
export const PROVIDER_ACCOUNT_IDENTITY_IPC = {
  identity: "provider-accounts:identity",
} as const;

export const ProviderAccountIdentityArgsSchema = z
  .object({
    providerId: ProviderAccountProviderIdSchema,
    profileId: ProviderAccountProfileIdSchema,
    /** Skip the cache, for example right after the sign-in terminal closed. */
    refresh: z.boolean().optional(),
    /** The binary path from Settings, as the sign-in terminal receives it. */
    binaryPath: z.string().trim().min(1).max(4096).optional(),
  })
  .strict();
export type ProviderAccountIdentityArgs = z.infer<typeof ProviderAccountIdentityArgsSchema>;

/**
 * - `cli-missing`: the provider's CLI was not found, so nothing was checked.
 * - `failed`: the check did not finish (timeout, crash, no output).
 * - `unreadable`: the CLI answered in a shape Stave does not recognise.
 */
export type ProviderAccountIdentityUnknownReason = "cli-missing" | "failed" | "unreadable";

export type ProviderAccountIdentity =
  | { state: "signed-in"; email: string | null; plan: string | null; checkedAt: number }
  | { state: "signed-out"; checkedAt: number }
  | { state: "unknown"; reason: ProviderAccountIdentityUnknownReason; checkedAt: number };

export type ProviderAccountIdentityResult =
  | { ok: true; identity: ProviderAccountIdentity }
  | { ok: false; message: string };

export interface ProviderAccountIdentityBridgeApi {
  identity: (args: ProviderAccountIdentityArgs) => Promise<ProviderAccountIdentityResult>;
}

/** Where an account's identity is cached: one entry per provider and profile. */
export function providerAccountIdentityKey(providerId: string, profileId: string) {
  return `${providerId}:${profileId}`;
}

/**
 * Whether a sign-in account of this provider that is still registered answered
 * "signed in". Identities are cached by profile and outlive a removed
 * account, so the registry is the list to read them through, never the cache.
 * API connections have no sign-in and are not counted.
 */
export function registeredAccountSignedIn(args: {
  providerId: string;
  profiles: readonly { id: string; providerId: string; gateway?: unknown; apiConnection?: unknown }[];
  identities: Readonly<Record<string, ProviderAccountIdentity | undefined>>;
}) {
  return args.profiles.some(
    (profile) =>
      profile.providerId === args.providerId &&
      !profile.gateway &&
      !profile.apiConnection &&
      args.identities[providerAccountIdentityKey(profile.providerId, profile.id)]?.state === "signed-in",
  );
}

export interface ProviderAccountIdentityLine {
  text: string;
  /** `attention` for states that need the reader to act; `quiet` otherwise. */
  tone: "quiet" | "attention";
}

/**
 * The one sentence every surface shows for an account's sign-in. Short and
 * plain: the Settings row, the status bar switch and the tests read it from
 * here so the copy cannot drift.
 */
export function describeProviderAccountIdentity(
  identity: ProviderAccountIdentity | undefined,
  providerName: string,
): ProviderAccountIdentityLine {
  if (!identity) return { text: i18n.t("providers:providerAccountIdentity.checkingSignIn"), tone: "quiet" };
  switch (identity.state) {
    case "signed-in": {
      const who = identity.email ? `Signed in as ${identity.email}` : "Signed in";
      return { text: identity.plan ? `${who} · ${identity.plan}` : who, tone: "quiet" };
    }
    case "signed-out":
      return { text: i18n.t("providers:mcpManagement.notSignedIn"), tone: "attention" };
    case "unknown":
      return {
        text: identity.reason === "cli-missing" ? i18n.t("providers:providerAccountIdentity.cliNotFound", { value1: providerName }) : i18n.t("providers:providerAccountIdentity.canTCheckSignIn"),
        tone: "attention",
      };
  }
}

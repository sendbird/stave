import type { TarsConversationSettings } from "./conversation";
import type { TarsIdentity } from "./types";

/** The `updatedAt` of an identity no one has saved yet: the row the store creates for a new profile. */
export const TARS_IDENTITY_UNSAVED_AT = "1970-01-01T00:00:00.000Z";

/**
 * A profile that has never used Tars: its identity was never saved, it has no
 * standing instructions and its conversation was never configured (no message
 * sent, no settings saved). Only such a profile receives the default standing
 * instructions by itself; anyone else is offered them in settings.
 */
export function isTarsNewProfile(identity: Pick<TarsIdentity, "updatedAt" | "instructions">, settings: TarsConversationSettings | null) {
  return identity.updatedAt === TARS_IDENTITY_UNSAVED_AT && !identity.instructions.trim() && settings === null;
}

/** Whether `instructions` is one of the offered defaults (any language), ignoring surrounding whitespace. */
export function isTarsDefaultInstructions(instructions: string, defaults: readonly string[]) {
  const value = instructions.trim();
  return defaults.some((text) => text.trim() === value);
}

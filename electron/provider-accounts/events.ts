import type { BridgeEvent, StreamTurnArgs } from "../providers/types";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "../../src/lib/providers/provider-accounts";
import { currentProviderAccountId } from "./runtime-scope";

/** Capture once: terminal events can be synthesized after the native runtime exits. */
export function providerAccountEventMapper(args: Pick<StreamTurnArgs, "providerId" | "runtimeOptions">) {
  const provider = args.providerId;
  const profileId = provider === "codex"
    ? args.runtimeOptions?.codexAccountProfileId ?? currentProviderAccountId(provider)
    : provider === "claude-code"
      ? args.runtimeOptions?.claudeAccountProfileId ?? currentProviderAccountId(provider)
      : SYSTEM_ACCOUNT_PROFILE_ID;
  return (event: BridgeEvent): BridgeEvent =>
    profileId !== SYSTEM_ACCOUNT_PROFILE_ID && (event.type === "provider_session" || event.type === "done")
      ? { ...event, accountProfileId: profileId }
      : event;
}

import type { ProviderId, ProviderRuntimeOptions } from "./provider.types";
import type { ToolingStatusEntry } from "../tooling-status";
import { selectedProviderAccount } from "./provider-account-selection";

export type OptionalProviderId = "cursor" | "kiro" | "opencode";

export function isOptionalProvider(id: ProviderId): id is OptionalProviderId {
  return id === "cursor" || id === "kiro" || id === "opencode";
}

export function providerConfigurationKey(
  id: ProviderId,
  options?: ProviderRuntimeOptions,
) {
  if (id === "claude-code" || id === "codex") {
    return JSON.stringify([
      selectedProviderAccount(id, options),
      (id === "claude-code" ? options?.claudeBinaryPath : options?.codexBinaryPath)?.trim() || "",
    ]);
  }
  return (
    (id === "cursor"
      ? options?.cursorBinaryPath
      : id === "kiro"
        ? options?.kiroBinaryPath
        : options?.opencodeBinaryPath
    )?.trim() || ""
  );
}

/**
 * `not-required` covers a provider whose own CLI owns per-model
 * authentication (OpenCode): Stave has no login to verify, and the CLI
 * reports a missing credential when a turn or catalog read needs one.
 */
export function toolingAllowsProviderReads(tool?: ToolingStatusEntry) {
  return (
    tool?.state === "ready" &&
    tool.available &&
    (tool.authState === "authenticated" || tool.authState === "not-required")
  );
}

export function isTransientToolingFailure(tool: ToolingStatusEntry) {
  return (
    tool.state === "unknown" || (tool.available && tool.authState === "unknown")
  );
}

import type { ProviderId, ProviderRuntimeOptions } from "./provider.types";
import type { ToolingStatusEntry } from "../tooling-status";

export type OptionalProviderId = "cursor" | "kiro";

export function isOptionalProvider(id: ProviderId): id is OptionalProviderId {
  return id === "cursor" || id === "kiro";
}

export function providerConfigurationKey(
  id: OptionalProviderId,
  options?: ProviderRuntimeOptions,
) {
  return (
    (id === "cursor"
      ? options?.cursorBinaryPath
      : options?.kiroBinaryPath
    )?.trim() || ""
  );
}

export function toolingAllowsProviderReads(tool?: ToolingStatusEntry) {
  return (
    tool?.state === "ready" &&
    tool.available &&
    tool.authState === "authenticated"
  );
}

export function isTransientToolingFailure(tool: ToolingStatusEntry) {
  return (
    tool.state === "unknown" || (tool.available && tool.authState === "unknown")
  );
}

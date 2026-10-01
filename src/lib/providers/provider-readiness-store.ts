import { create } from "zustand";
import type { ProviderId, ProviderRuntimeOptions } from "./provider.types";
import type { ToolingStatusEntry } from "../tooling-status";
import {
  isOptionalProvider,
  isTransientToolingFailure,
  providerConfigurationKey,
  toolingAllowsProviderReads,
  type OptionalProviderId,
} from "./provider-readiness";

export interface ProviderReadiness {
  tool: ToolingStatusEntry;
  configurationKey: string;
  checkedAt: number;
  generation: number;
  stale: boolean;
}

type ReadinessMap = Partial<Record<OptionalProviderId, ProviderReadiness>>;

// Ephemeral: an authenticated result from a previous app run is never trusted.
export const useProviderReadinessStore = create<{ providers: ReadinessMap }>(
  () => ({ providers: {} }),
);

export function publishProviderTooling(
  tool: ToolingStatusEntry,
  options?: ProviderRuntimeOptions,
) {
  if (tool.id !== "cursor" && tool.id !== "kiro") return;
  const id = tool.id;
  const configurationKey = providerConfigurationKey(id, options);
  const checkedAt = Date.parse(tool.checkedAt ?? "") || Date.now();
  useProviderReadinessStore.setState(({ providers }) => {
    const previous = providers[id];
    if (
      previous?.configurationKey === configurationKey &&
      previous.checkedAt > checkedAt
    )
      return {};
    const sameConfiguration = previous?.configurationKey === configurationKey;
    const stale = Boolean(
      sameConfiguration &&
        (toolingAllowsProviderReads(previous?.tool) || previous?.stale) &&
        isTransientToolingFailure(tool),
    );
    const changed =
      !sameConfiguration ||
      previous?.stale !== stale ||
      previous?.tool.state !== tool.state ||
      previous?.tool.authState !== tool.authState ||
      previous?.tool.available !== tool.available;
    return {
      providers: {
        ...providers,
        [id]: {
          tool,
          configurationKey,
          checkedAt,
          generation: (previous?.generation ?? 0) + (changed ? 1 : 0),
          stale,
        },
      },
    };
  });
}

export function providerReadiness(
  id: ProviderId,
  options?: ProviderRuntimeOptions,
) {
  if (!isOptionalProvider(id)) return undefined;
  const value = useProviderReadinessStore.getState().providers[id];
  return value?.configurationKey === providerConfigurationKey(id, options)
    ? value
    : undefined;
}

export function providerReadsAllowed(
  id: ProviderId,
  options?: ProviderRuntimeOptions,
) {
  return (
    !isOptionalProvider(id) ||
    toolingAllowsProviderReads(providerReadiness(id, options)?.tool)
  );
}

export function providerSurfaceVisible(
  id: ProviderId,
  options?: ProviderRuntimeOptions,
) {
  const value = providerReadiness(id, options);
  return (
    !isOptionalProvider(id) ||
    toolingAllowsProviderReads(value?.tool) ||
    value?.stale === true
  );
}

import type { StoreApi } from "zustand";
import type { AppState } from "./app-store.types";
import { mergeRateLimitsSnapshots } from "@/lib/providers/account-usage-block";
import { listProviderIds } from "@/lib/providers/model-catalog";
import { isOptionalProvider } from "@/lib/providers/provider-readiness";
import { providerToolingStatePatch } from "@/store/provider-tooling";
import {
  providerReadiness,
  providerReadsAllowed,
  publishProviderTooling,
} from "@/lib/providers/provider-readiness-store";
import { createEmptyProviderRuntimeCapabilities } from "@/lib/providers/runtime-capabilities";

export function createProviderSupportActions(args: {
  set: StoreApi<AppState>["setState"];
  get: StoreApi<AppState>["getState"];
}): Pick<AppState, "refreshRateLimits" | "refreshProviderAvailability"> {
  const { set, get } = args;
  let providerAvailabilityRefreshInFlight: Promise<void> | null = null;
  return {
    refreshRateLimits: async (args) => {
      const getSnapshot = window.api?.provider?.getRateLimitsSnapshot;
      if (!getSnapshot) {
        return;
      }
      const requestedAt = Date.now();
      const runtimeOptions = {
        cursorBinaryPath: get().settings.cursorBinaryPath || undefined,
        kiroBinaryPath: get().settings.kiroBinaryPath || undefined,
        codexBinaryPath: get().settings.codexBinaryPath || undefined,
      };
      const requestedProviders = (
        args?.providers?.length ? args.providers : listProviderIds()
      ).filter((id) => providerReadsAllowed(id, runtimeOptions));
      if (requestedProviders.length === 0) return;
      const generations = new Map(
        requestedProviders.map((id) => [
          id,
          providerReadiness(id, runtimeOptions)?.generation,
        ]),
      );
      set({ rateLimitsLoading: true, rateLimitsError: null });
      try {
        const snapshot = await getSnapshot({
          providers: requestedProviders,
          runtimeOptions,
          ...(args?.force ? { force: true } : {}),
          ...(args?.reason ? { reason: args.reason } : {}),
        });
        set((state) => {
          const providers = requestedProviders.filter(
            (providerId) =>
              providerReadsAllowed(providerId, runtimeOptions) &&
              generations.get(providerId) ===
                providerReadiness(providerId, runtimeOptions)?.generation &&
              (providerId === "cursor"
                ? (state.settings.cursorBinaryPath || undefined) ===
                  runtimeOptions.cursorBinaryPath
                : providerId === "kiro"
                  ? (state.settings.kiroBinaryPath || undefined) ===
                    runtimeOptions.kiroBinaryPath
                  : providerId === "codex"
                    ? (state.settings.codexBinaryPath || undefined) ===
                      runtimeOptions.codexBinaryPath
                    : true) &&
              requestedAt >=
                (state.rateLimitsUpdatedAtByProvider[providerId] ?? 0),
          );
          if (providers.length === 0) return { rateLimitsLoading: false };
          return {
            rateLimitsSnapshot: mergeRateLimitsSnapshots({
              current: state.rateLimitsSnapshot,
              incoming: snapshot,
              providers,
            }),
            rateLimitsUpdatedAtByProvider: {
              ...state.rateLimitsUpdatedAtByProvider,
              ...Object.fromEntries(
                providers.map((providerId) => [providerId, requestedAt]),
              ),
            },
            rateLimitsLoading: false,
          };
        });
      } catch (error) {
        set({
          rateLimitsLoading: false,
          rateLimitsError:
            error instanceof Error ? error.message : String(error),
        });
      }
    },
    refreshProviderAvailability: () => {
      const checkAvailability = window.api?.provider?.checkAvailability;
      if (!checkAvailability) {
        return Promise.resolve();
      }
      if (providerAvailabilityRefreshInFlight) {
        return providerAvailabilityRefreshInFlight;
      }
      const settings = get().settings;
      const runtimeOptions = {
        claudeBinaryPath: settings.claudeBinaryPath || undefined,
        codexBinaryPath: settings.codexBinaryPath || undefined,
        cursorBinaryPath: settings.cursorBinaryPath || undefined,
        kiroBinaryPath: settings.kiroBinaryPath || undefined,
      };
      const settingsAreCurrent = () => {
        const current = get().settings;
        return Object.entries(runtimeOptions).every(
          ([key, value]) =>
            (current[key as keyof typeof runtimeOptions] || undefined) ===
            value,
        );
      };
      const refresh = Promise.all(
        listProviderIds().map(async (providerId) => {
          try {
            const result = await checkAvailability({
              providerId,
              runtimeOptions,
            });
            if (!result.ok || !settingsAreCurrent()) return;
            if (
              isOptionalProvider(providerId) &&
              result.toolingStatus &&
              (providerReadiness(providerId, runtimeOptions)?.checkedAt ?? 0) >
                Date.parse(result.toolingStatus.checkedAt ?? "")
            )
              return;
            if (result.toolingStatus)
              publishProviderTooling(result.toolingStatus, runtimeOptions);
            if (isOptionalProvider(providerId))
              set(providerToolingStatePatch(get()));
            // A slow or unavailable sibling must not hold back ready models.
            // Keep the user's selected model and update only this provider.
            set((state) => ({
              providerAvailability: {
                ...state.providerAvailability,
                [providerId]: isOptionalProvider(providerId)
                  ? providerReadsAllowed(providerId, runtimeOptions)
                  : result.available,
              },
              providerRuntimeCapabilities: {
                ...state.providerRuntimeCapabilities,
                [providerId]:
                  result.capabilities ??
                  createEmptyProviderRuntimeCapabilities(),
              },
            }));
          } catch {
            if (isOptionalProvider(providerId) && settingsAreCurrent()) {
              const previous = providerReadiness(
                providerId,
                runtimeOptions,
              )?.tool;
              if (previous)
                publishProviderTooling(
                  {
                    ...previous,
                    state: "unknown",
                    authState: "unknown",
                    checkedAt: new Date().toISOString(),
                    summary: "Provider status could not be verified.",
                    detail: "Retry the status check in Settings > Tooling.",
                  },
                  runtimeOptions,
                );
              set((state) => ({
                providerAvailability: {
                  ...state.providerAvailability,
                  [providerId]: false,
                },
              }));
            }
            // A failed read cannot establish that a provider was uninstalled.
            // Preserve its last known state until discovery succeeds.
          }
        }),
      )
        .then(() => undefined)
        .finally(() => {
          if (providerAvailabilityRefreshInFlight === refresh) {
            providerAvailabilityRefreshInFlight = null;
            if (!settingsAreCurrent())
              return get().refreshProviderAvailability();
          }
        });
      providerAvailabilityRefreshInFlight = refresh;
      return refresh;
    },
  };
}

import { useMemo, useState } from "react";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  isOptionalProvider,
  toolingAllowsProviderReads,
  type OptionalProviderId,
} from "@/lib/providers/provider-readiness";
import {
  readinessForConfiguration,
  useProviderReadinessStore,
  type ProviderReadinessMap,
} from "@/lib/providers/provider-readiness-store";
import { useAppStore } from "@/store/app.store";

/**
 * Which providers get their own Settings areas (tabs, default-model rows, MCP
 * columns, provider pickers). Claude Code and Codex always do. Cursor, Kiro
 * and OpenCode do only once their CLI is installed and signed in (or needs no
 * Stave sign-in), so a provider the user never set up stays out of the way.
 * Visibility only: runtimes, saved values and routing are unchanged.
 */

type OptionalProviderPaths = Pick<
  ProviderRuntimeOptions,
  "cursorBinaryPath" | "kiroBinaryPath" | "opencodeBinaryPath"
>;

const PROVIDER_ORDER = listProviderIds();
const FALLBACK_TAB: ProviderId = "claude-code";

// One frozen array per provider set, so equal results are the same reference
// and memoized consumers do not re-render when readiness re-publishes.
const internedProviderIds = new Map<string, readonly ProviderId[]>();

function internProviderIds(ids: readonly ProviderId[]): readonly ProviderId[] {
  const key = ids.join("\u0000");
  const existing = internedProviderIds.get(key);
  if (existing) return existing;
  const frozen = Object.freeze([...ids]);
  internedProviderIds.set(key, frozen);
  return frozen;
}

export function listSettingsVisibleProviderIds(args: {
  availability: Partial<Record<ProviderId, boolean>>;
  readiness: ProviderReadinessMap;
  runtimeOptions?: OptionalProviderPaths;
}): readonly ProviderId[] {
  return internProviderIds(
    PROVIDER_ORDER.filter(
      (id) =>
        !isOptionalProvider(id) ||
        (args.availability[id] === true &&
          toolingAllowsProviderReads(
            readinessForConfiguration(args.readiness, id, args.runtimeOptions)
              ?.tool,
          )),
    ),
  );
}

/**
 * `visible` plus a saved choice that is hidden, in the usual provider order,
 * so editing an existing preset, macro, rule or agent never drops its value.
 * Returns `visible` itself when nothing needs adding.
 */
export function keepSavedProviderVisible(
  visible: readonly ProviderId[],
  saved: string | null | undefined,
): readonly ProviderId[] {
  if (!saved || visible.includes(saved as ProviderId)) return visible;
  if (!PROVIDER_ORDER.includes(saved as ProviderId)) return visible;
  return internProviderIds(
    PROVIDER_ORDER.filter((id) => id === saved || visible.includes(id)),
  );
}

/**
 * Where an optional provider's CLI stands for Settings > Accounts.
 * `checking` until a probe for the current CLI path has answered.
 */
export type OptionalProviderSetup = "checking" | "not-installed" | "installed";

export function optionalProviderSetup(args: {
  readiness: ProviderReadinessMap;
  providerId: OptionalProviderId;
  runtimeOptions?: OptionalProviderPaths;
}): OptionalProviderSetup {
  const tool = readinessForConfiguration(
    args.readiness,
    args.providerId,
    args.runtimeOptions,
  )?.tool;
  if (!tool) return "checking";
  if (tool.available) return "installed";
  return tool.state === "unknown" ? "checking" : "not-installed";
}

/** The optional providers' CLI paths, memoized so the object stays stable. */
export function useOptionalProviderPaths(): OptionalProviderPaths {
  const cursorBinaryPath = useAppStore((state) => state.settings.cursorBinaryPath);
  const kiroBinaryPath = useAppStore((state) => state.settings.kiroBinaryPath);
  const opencodeBinaryPath = useAppStore(
    (state) => state.settings.opencodeBinaryPath,
  );
  return useMemo(
    () => ({ cursorBinaryPath, kiroBinaryPath, opencodeBinaryPath }),
    [cursorBinaryPath, kiroBinaryPath, opencodeBinaryPath],
  );
}

/** Settings-visible providers, in provider order; the same array while unchanged. */
export function useSettingsVisibleProviderIds(): readonly ProviderId[] {
  const availability = useAppStore((state) => state.providerAvailability);
  const readiness = useProviderReadinessStore((state) => state.providers);
  const runtimeOptions = useOptionalProviderPaths();
  return useMemo(
    () =>
      listSettingsVisibleProviderIds({ availability, readiness, runtimeOptions }),
    [availability, readiness, runtimeOptions],
  );
}

/**
 * Active tab of a per-provider tab strip over the Settings-visible providers.
 * A tab that becomes hidden falls back to Claude Code. The active optional tab
 * stays while its CLI is being checked again (right after its path changed),
 * so the panel does not jump away mid-edit.
 */
export function useSettingsProviderTab() {
  const visible = useSettingsVisibleProviderIds();
  const readiness = useProviderReadinessStore((state) => state.providers);
  const runtimeOptions = useOptionalProviderPaths();
  const [active, setActive] = useState<ProviderId>(FALLBACK_TAB);
  const keepActive =
    isOptionalProvider(active) &&
    optionalProviderSetup({ readiness, providerId: active, runtimeOptions }) ===
      "checking";
  const providerIds = keepActive
    ? keepSavedProviderVisible(visible, active)
    : visible;
  const value = providerIds.includes(active) ? active : FALLBACK_TAB;
  // Adjusting state while rendering: React re-renders before committing.
  if (value !== active) setActive(value);
  return {
    providerIds,
    value,
    onValueChange: (next: unknown) => setActive(next as ProviderId),
  };
}

/** Settings-visible providers plus `saved` when it is hidden. */
export function useSettingsProviderIdsWithSaved(
  saved: string | null | undefined,
): readonly ProviderId[] {
  const visible = useSettingsVisibleProviderIds();
  return useMemo(() => keepSavedProviderVisible(visible, saved), [visible, saved]);
}

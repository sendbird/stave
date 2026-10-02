import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProviderReadinessStore } from "@/lib/providers/provider-readiness-store";
import { listInstalledStandaloneCliTabIds } from "@/lib/terminal/standalone-cli";
import { useAppStore } from "@/store/app.store";

/** The Standalone CLI tabs whose CLI is installed on this machine. */
export function useStandaloneCliInstalledTabIds() {
  const [providerAvailability, cursorBinaryPath, kiroBinaryPath] = useAppStore(
    useShallow(
      (state) =>
        [
          state.providerAvailability,
          state.settings.cursorBinaryPath,
          state.settings.kiroBinaryPath,
        ] as const,
    ),
  );
  const optionalProviders = useProviderReadinessStore(
    (state) => state.providers,
  );

  // Derived outside the selectors: selectors must never return fresh arrays.
  return useMemo(
    () =>
      listInstalledStandaloneCliTabIds({
        providerAvailability,
        optionalProviders,
        runtimeOptions: { cursorBinaryPath, kiroBinaryPath },
      }),
    [cursorBinaryPath, kiroBinaryPath, optionalProviders, providerAvailability],
  );
}

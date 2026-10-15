import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProviderReadinessStore } from "@/lib/providers/provider-readiness-store";
import { listInstalledStandaloneCliTabIds } from "@/lib/terminal/standalone-cli";
import { useAppStore } from "@/store/app.store";
import { useAccountRuntimeOptions } from "@/lib/providers/use-provider-accounts";

/** The Standalone CLI tabs whose CLI is installed on this machine. */
export function useStandaloneCliInstalledTabIds() {
  const [providerAvailability, claudeBinaryPath, codexBinaryPath, cursorBinaryPath, kiroBinaryPath, opencodeBinaryPath] = useAppStore(
    useShallow(
      (state) =>
        [
          state.providerAvailability,
          state.settings.claudeBinaryPath,
          state.settings.codexBinaryPath,
          state.settings.cursorBinaryPath,
          state.settings.kiroBinaryPath,
          state.settings.opencodeBinaryPath,
        ] as const,
    ),
  );
  const optionalProviders = useProviderReadinessStore(
    (state) => state.providers,
  );
  const paths = useMemo(() => ({ claudeBinaryPath, codexBinaryPath, cursorBinaryPath, kiroBinaryPath, opencodeBinaryPath }), [claudeBinaryPath, codexBinaryPath, cursorBinaryPath, kiroBinaryPath, opencodeBinaryPath]);
  const runtimeOptions = useAccountRuntimeOptions(paths);

  // Derived outside the selectors: selectors must never return fresh arrays.
  return useMemo(
    () =>
      listInstalledStandaloneCliTabIds({
        providerAvailability,
        optionalProviders,
        runtimeOptions,
      }),
    [runtimeOptions, optionalProviders, providerAvailability],
  );
}

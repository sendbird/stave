import { useShallow } from "zustand/react/shallow";
import {
  providerBrowserModeSettingsPatch,
  resolveProviderBrowserMode,
} from "@/lib/provider-browser";
import { useAppStore } from "@/store/app.store";
import { SectionStack } from "../settings-dialog.shared";
import { ProviderBrowserAccessSettingsCard } from "../ProviderBrowserAccessSettingsCard";

/** When the agent may use the provider's Chrome, with or without `@web`. */
export function MentionsSection() {
  const [autoFallback, alwaysOn, autoArm, autoFallbackDomains, backend] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.providerBrowserAutoFallback,
          state.settings.providerBrowserAlwaysOn,
          state.settings.providerBrowserAutoArm,
          state.settings.providerBrowserAutoFallbackDomains,
          state.settings.providerBrowserBackend,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const browserMode = resolveProviderBrowserMode({ autoFallback, alwaysOn });

  return (
    <SectionStack>
      <ProviderBrowserAccessSettingsCard
        backend={backend}
        onBackendChange={(value) => updateSettings({ patch: { providerBrowserBackend: value } })}
        mode={browserMode}
        autoArm={autoArm}
        onAutoArmChange={(value) =>
          updateSettings({ patch: { providerBrowserAutoArm: value } })
        }
        onModeChange={(mode) =>
          updateSettings({ patch: providerBrowserModeSettingsPatch(mode) })
        }
        autoFallbackDomains={autoFallbackDomains}
        onAutoFallbackDomainsChange={(value) =>
          updateSettings({
            patch: { providerBrowserAutoFallbackDomains: value },
          })
        }
      />
    </SectionStack>
  );
}

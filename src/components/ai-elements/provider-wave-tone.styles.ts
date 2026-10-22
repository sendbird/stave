import { sx } from "@/components/ads/utils/stylex";
import { providerInkStyles } from "@/components/system/provider-ink.styles";
import { getProviderWaveTone } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * The provider-wave ink as a class. `getProviderWaveTone` returns the semantic
 * key; `providerInkStyles` paints the themed provider token for it, so every
 * loader and mark stays on one mapping. A user-authored row takes the accent.
 */
export function toProviderWaveToneClass(args: {
  providerId: ProviderId | "user";
  model?: string;
}) {
  if (args.providerId === "user") {
    return sx(providerInkStyles.accent);
  }
  return sx(
    providerInkStyles[
      getProviderWaveTone({
        providerId: args.providerId,
        model: args.model,
      })
    ],
  );
}

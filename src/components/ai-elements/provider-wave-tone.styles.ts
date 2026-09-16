import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { getProviderWaveTone } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * Shared provider-wave ink. `getProviderWaveTone` returns the semantic key;
 * these styles paint the themed CSS variables so every loader and mark stays
 * on one mapping.
 */
export const providerWaveToneStyles = stylex.create({
  claude: { color: "var(--provider-claude)" },
  codex: { color: "var(--provider-codex)" },
  cursor: { color: "var(--provider-cursor)" },
  kiro: { color: "var(--provider-kiro)" },
  accent: { color: vars["--ads-color-accent"] },
});

export const providerWaveToneFillStyles = stylex.create({
  claude: { backgroundColor: "var(--provider-claude)" },
  codex: { backgroundColor: "var(--provider-codex)" },
  cursor: { backgroundColor: "var(--provider-cursor)" },
  kiro: { backgroundColor: "var(--provider-kiro)" },
  accent: { backgroundColor: vars["--ads-color-accent"] },
});

export function toProviderWaveToneClass(args: {
  providerId: ProviderId | "user";
  model?: string;
}) {
  if (args.providerId === "user") {
    return sx(providerWaveToneStyles.accent);
  }
  return sx(
    providerWaveToneStyles[
      getProviderWaveTone({
        providerId: args.providerId,
        model: args.model,
      })
    ],
  );
}

export function toProviderWaveToneFillClass(args: {
  providerId: ProviderId;
  model?: string;
}) {
  return sx(
    providerWaveToneFillStyles[
      getProviderWaveTone({
        providerId: args.providerId,
        model: args.model,
      })
    ],
  );
}

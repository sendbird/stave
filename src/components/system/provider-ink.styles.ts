import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Each provider's ink: the theme token its identity names
 * (`src/lib/providers/provider-identity.ts`, `token`), keyed by `hue`, plus
 * the ADS accent for a presentation that is not a provider. The one StyleX
 * map of provider colors; loaders, model names and marks all take their ink
 * from here. StyleX needs the values written out, so
 * `tests/provider-identity.test.ts` holds this map to the registry.
 */
export const providerInkStyles = stylex.create({
  claude: { color: "var(--provider-claude)" },
  codex: { color: "var(--provider-codex)" },
  cursor: { color: "var(--provider-cursor)" },
  kiro: { color: "var(--provider-kiro)" },
  opencode: { color: "var(--provider-opencode)" },
  accent: { color: vars["--ads-color-accent"] },
});

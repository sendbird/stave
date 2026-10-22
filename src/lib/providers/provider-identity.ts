import { i18n } from "@/i18n/runtime";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * Which provider's ink a mark, a loader or a model name takes. The theme
 * defines one `--provider-<hue>` token per hue for light, dark and every
 * built-in theme (`src/lib/themes`).
 */
export type ProviderHue = "claude" | "codex" | "cursor" | "kiro" | "opencode";

/** The theme token that holds a provider's ink. */
export type ProviderColorToken = `provider-${ProviderHue}`;

/**
 * How Stave shows one provider: its names, the theme token for its ink, its
 * mark, and the letters drawn where there is no mark. Every surface that draws
 * a provider reads it from here (`ProviderMark`, the provider ink styles, the
 * model catalog's descriptors).
 */
export interface ProviderIdentity {
  providerId: ProviderId;
  /** Product name: `Claude Code`. */
  label: string;
  /** Short name for tight places: `Claude`. */
  shortLabel: string;
  hue: ProviderHue;
  token: ProviderColorToken;
  /** The vendor's mark, or null where the provider ships none. */
  markUrl: string | null;
  /** Drawn, tinted with the provider's ink, when there is no mark or it fails. */
  monogram: string;
}

function assetUrl(file: string) {
  return `${import.meta.env.BASE_URL}${file}`;
}

export const PROVIDER_IDENTITIES: Readonly<Record<ProviderId, ProviderIdentity>> = {
  "claude-code": {
    providerId: "claude-code",
    label: "Claude Code",
    shortLabel: "Claude",
    hue: "claude",
    token: "provider-claude",
    markUrl: assetUrl("claude-color.svg"),
    // i18n-ignore: provider initials
    monogram: "C",
  },
  codex: {
    providerId: "codex",
    label: "Codex",
    shortLabel: "Codex",
    hue: "codex",
    token: "provider-codex",
    markUrl: assetUrl("codex-color.svg"),
    // i18n-ignore: provider initials
    monogram: "O",
  },
  cursor: {
    providerId: "cursor",
    get label() { return i18n.t("settings:taskPresetEditor.cursorAgent"); },
    shortLabel: "Cursor",
    hue: "cursor",
    token: "provider-cursor",
    markUrl: assetUrl("cursor-color.svg"),
    // i18n-ignore: provider initials
    monogram: "Cu",
  },
  kiro: {
    providerId: "kiro",
    label: "Kiro CLI",
    shortLabel: "Kiro",
    hue: "kiro",
    token: "provider-kiro",
    markUrl: assetUrl("kiro-color.svg"),
    // i18n-ignore: provider initials
    monogram: "Ki",
  },
  opencode: {
    providerId: "opencode",
    label: "OpenCode",
    shortLabel: "OpenCode",
    hue: "opencode",
    token: "provider-opencode",
    markUrl: null,
    // i18n-ignore: provider initials
    monogram: "Oc",
  },
};

/** The identity of a known provider; null for an id Stave does not know. */
export function findProviderIdentity(
  providerId: string | null | undefined,
): ProviderIdentity | null {
  return providerId && Object.hasOwn(PROVIDER_IDENTITIES, providerId)
    ? PROVIDER_IDENTITIES[providerId as ProviderId]
    : null;
}

/**
 * The provider's ink as a CSS value (`var(--provider-claude)`), for inline
 * styles and SVG paint. StyleX surfaces use `providerInkStyles`.
 */
export function providerInkColor(providerId: ProviderId): string {
  const identity = findProviderIdentity(providerId);
  return identity ? `var(--${identity.token})` : "var(--primary)";
}

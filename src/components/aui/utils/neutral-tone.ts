/**
 * The neutral tone's internal key.
 *
 * `tone` is the semantic colour axis (design-direction §2), and its resting
 * value — "no semantic status" — is spelled `neutral` everywhere. `Button`,
 * the field family, `Text`, `Progress`, `Gauge` and the menu items shipped the
 * same value as `default`; that second spelling was removed (2026-11-08).
 *
 * `neutral` still resolves to the internal key `default`, because it is also
 * the `data-tone` value those components reflect. The attribute is a
 * product-theme selector contract (`[data-tone="default"]`), so a brand rule
 * written against it keeps matching; moving the DOM value is a major-version
 * change, not an alias.
 */

/**
 * Fold `neutral` onto the internal/DOM key `default`; every other tone passes
 * through unchanged.
 */
export function resolveNeutralTone<Tone extends string>(
  tone: Tone,
): Exclude<Tone, "neutral"> | "default" {
  return (tone === "neutral" ? "default" : tone) as
    | Exclude<Tone, "neutral">
    | "default";
}

/**
 * Re-export of the `border-beam` library
 * (https://beam.jakubantalik.com/, MIT © Jakub Antalik).
 *
 * We use the library's own style presets intentionally — the previous
 * local implementation overlaid a conic-gradient styled with our theme
 * tokens (`--color-primary`, `--color-ring`), which flattened the beam's
 * palette. Do not layer theme tokens back onto the beam here; user-facing
 * controls for `size` / `colorVariant` / `strength` / `theme` live in
 * `AppSettings` and the "Motion" card of the settings dialog.
 */
export { BorderBeam } from "border-beam";
export type {
  BorderBeamColorVariant,
  BorderBeamProps,
  BorderBeamSize,
  BorderBeamTheme,
} from "border-beam";

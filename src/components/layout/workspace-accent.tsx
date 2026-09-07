import { Layers } from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "./layout-shell.styles";

/**
 * Workspace identity tones.
 *
 * Deliberately NOT sourced from `vars.chart1..6`. `system/ads-theme.ts` leaves
 * the `chart*` ramp unmapped on purpose — it is categorical DATA ink whose
 * steps are picked against ADS's own contrast floors and CVD separation, and
 * Stave only owns five chart hues, so a partial remap would break both the
 * ordering guarantee and ADS's colour gate. Reading `chart1..6` here would also
 * change what this component means: the ramp's first six slots are blue,
 * orange, green, purple, yellow, red, so a hash over workspace names would
 * paint identity marks in six different hues instead of the six blue steps
 * below, and it would collide with any real chart rendered beside them.
 *
 * These stay as literals until Stave owns a theme-scoped identity ramp. They
 * are a single-hue family (blue, L 0.65-0.74) so they are stable across the
 * light/dark surfaces they mix into.
 */
const WORKSPACE_BLUE_TONES = [
  "oklch(0.69 0.12 245)",
  "oklch(0.72 0.1 235)",
  "oklch(0.67 0.13 230)",
  "oklch(0.74 0.09 252)",
  "oklch(0.7 0.11 220)",
  "oklch(0.65 0.12 240)",
] as const;

/**
 * All six mixes below interpolate `in oklab`, never `in oklch`: OKLCH
 * interpolates HUE, and mixing a blue tone 58% into a near-neutral
 * `--foreground` that still carries a nominal hue dragged the identity colour
 * off its own hue (the same defect documented on `colorAccentHover` in
 * `system/ads-theme.ts`) — so two workspaces one slot apart in the ramp could
 * land on the same-looking mark. OKLAB is rectangular, so the mix moves
 * lightness and leaves hue where the tone put it.
 */
export function getWorkspaceAccentTone(args: { workspaceName: string; isDefault?: boolean }) {
  if (args.isDefault) {
    return {
      background: "color-mix(in oklab, var(--muted) 82%, var(--card))",
      foreground: "color-mix(in oklab, var(--muted-foreground) 78%, var(--foreground))",
      border: "color-mix(in oklab, var(--muted-foreground) 16%, var(--border))",
    };
  }

  let hash = 0;
  for (let index = 0; index < args.workspaceName.length; index += 1) {
    hash = (hash * 31 + args.workspaceName.charCodeAt(index)) | 0;
  }
  const accent = WORKSPACE_BLUE_TONES[Math.abs(hash) % WORKSPACE_BLUE_TONES.length]!;
  return {
    background: `color-mix(in oklab, ${accent} 18%, var(--card))`,
    foreground: `color-mix(in oklab, ${accent} 58%, var(--foreground))`,
    border: `color-mix(in oklab, ${accent} 24%, var(--border))`,
  };
}

export function WorkspaceIdentityMark(args: { workspaceName: string; isDefault?: boolean; className?: string; iconClassName?: string }) {
  const tone = getWorkspaceAccentTone({ workspaceName: args.workspaceName, isDefault: args.isDefault });
  return (
    <span
      className={cx(sx(layoutShellStyles.identityMark), args.className)}
      style={{
        backgroundColor: tone.background,
        color: tone.foreground,
        borderColor: tone.border,
      }}
    >
      <Layers className={cx(sx(layoutShellStyles.workspaceIcon), args.iconClassName)} />
    </span>
  );
}

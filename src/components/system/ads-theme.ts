import type { CSSProperties } from "react";
import { vars } from "../ads/tokens/tokens.stylex";

/** Saved Stave themes remain the color authority during source migration. */
const roles = {
  colorCanvas: "var(--background)",
  colorCanvasSubtle: "var(--muted)",
  colorGround: "var(--sidebar)",
  colorSurface: "var(--card)",
  colorSurfaceRaised: "var(--popover)",
  colorSurfaceTint: "var(--muted)",
  colorText: "var(--foreground)",
  colorTextMuted: "var(--muted-foreground)",
  colorTextSubtle: "var(--muted-foreground)",
  colorTextPlaceholder: "var(--muted-foreground)",
  colorTextInverted: "var(--background)",
  colorBorder: "var(--border)",
  colorBorderSubtle: "color-mix(in oklch, var(--border) 60%, transparent)",
  colorBorderStrong: "var(--muted-foreground)",
  colorBorderFocus: "var(--ring)",
  colorAccent: "var(--primary)",
  colorAccentHover:
    "color-mix(in oklch, var(--primary) 90%, var(--primary-foreground))",
  colorAccentSoft: "var(--accent)",
  colorAccentText: "var(--primary-foreground)",
  colorSelectionFill: "var(--accent)",
  colorDanger: "var(--destructive)",
  colorDangerHover:
    "color-mix(in oklch, var(--destructive) 90%, var(--foreground))",
  colorDangerText: "var(--destructive)",
  colorDangerBorder: "var(--destructive)",
  colorDangerSoft: "color-mix(in oklch, var(--destructive) 12%, var(--card))",
  colorMixInk: "var(--foreground)",
  colorMixLift: "var(--background)",
  zIndexSticky: "1",
  zIndexPanel: "10",
  zIndexAppChrome: "30",
  zIndexOverlay: "79",
  zIndexModal: "80",
  zIndexDropdown: "90",
  zIndexToast: "120",
  colorSuccess: "var(--success)",
  colorSuccessText: "var(--success)",
  colorSuccessSoft: "color-mix(in oklch, var(--success) 12%, var(--card))",
  colorSuccessBorder: "var(--success)",
  colorWarning: "var(--warning)",
  colorWarningText: "var(--warning)",
  colorWarningSoft: "color-mix(in oklch, var(--warning) 12%, var(--card))",
  colorWarningBorder: "var(--warning)",
  colorInfo: "var(--info)",
  colorInfoText: "var(--info)",
  colorInfoSoft: "color-mix(in oklch, var(--info) 12%, var(--card))",
  colorInfoBorder: "var(--info)",
  fontSans: "var(--font-sans)",
  fontMono: "var(--font-mono)",
} satisfies Partial<
  Record<Extract<keyof typeof vars, `color${string}` | `font${string}` | `zIndex${string}`>, string>
>;

// StyleX exports CSS var() references, so the canonical hashes stay authoritative.
export const adsThemeVariables = Object.fromEntries(
  Object.entries(roles).map(([role, value]) => [
    vars[role as keyof typeof roles].slice(4, -1),
    value,
  ]),
) as CSSProperties & Record<string, string>;

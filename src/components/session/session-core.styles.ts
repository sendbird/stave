import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

// Tailwind used to supply the global `spin` keyframes; it is gone, so the
// rotation is authored locally like every other spinner in the app.
const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

export const sessionCoreStyles = stylex.create({
  workspaceBar: { display: "flex", minWidth: 0, alignItems: "center", gap: vars.space8, overflow: "hidden" },
  project: { maxWidth: "10rem", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  branchGroup: { display: "inline-flex", minWidth: 0, alignItems: "center", gap: 6 },
  branchIcon: { width: 12, height: 12, flexShrink: 0 },
  monoTruncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: vars.fontMono },
  macroInitial: { display: "flex", width: 16, height: 16, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "0.25rem", backgroundColor: vars.colorSurfaceTint, fontSize: "0.625rem", lineHeight: 1, fontWeight: vars.fontWeightSemibold, textTransform: "uppercase" },
  statusIcon: { marginTop: vars.space2, width: 14, height: 14, flexShrink: 0 },
  pass: { color: vars.colorSuccessText }, fail: { color: vars.colorDangerText }, muted: { color: vars.colorTextMuted }, mutedSoft: { color: vars.colorTextMuted, opacity: 0.6 },
  spinning: {
    animationDuration: {
      default: vars.motionDurationLoop,
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
});

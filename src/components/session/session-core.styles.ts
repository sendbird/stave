import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

// Tailwind used to supply the global `spin` keyframes; it is gone, so the
// rotation is authored locally like every other spinner in the app.
const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

export const sessionCoreStyles = stylex.create({
  workspaceBar: { display: "flex", minWidth: 0, alignItems: "center", gap: vars["--ads-space-8"], overflow: "hidden" },
  project: { maxWidth: "10rem", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  branchGroup: { display: "inline-flex", minWidth: 0, alignItems: "center", gap: 6 },
  branchIcon: { width: 12, height: 12, flexShrink: 0 },
  monoTruncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: vars["--ads-font-mono"] },
  macroInitial: { display: "flex", width: 16, height: 16, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "0.25rem", backgroundColor: vars["--ads-color-surface-tint"], fontSize: vars["--ads-font-size-micro"], lineHeight: 1, fontWeight: vars["--ads-font-weight-semibold"], textTransform: "uppercase" },
  statusIcon: { marginTop: vars["--ads-space-2"], width: 14, height: 14, flexShrink: 0 },
  pass: { color: vars["--ads-color-success-text"] }, fail: { color: vars["--ads-color-danger-text"] }, muted: { color: vars["--ads-color-text-muted"] }, mutedSoft: { color: vars["--ads-color-text-muted"], opacity: 0.6 },
  spinning: {
    animationDuration: {
      default: vars["--ads-motion-duration-loop"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
});

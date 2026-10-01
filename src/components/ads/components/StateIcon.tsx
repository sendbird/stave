import { cx, sx, type XstyleProp } from "../utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../tokens/tokens.stylex";
import { Loader } from "./Loader";
import { WORK_STATE, type WorkState } from "./state-vocabulary";

/** Glyph size in px. */
export type StateIconSize = "xs" | "sm" | "md";
const SIZE_PX: Record<StateIconSize, number> = { xs: 12, sm: 14, md: 16 };
const LOADER_SIZE = { xs: "xs", sm: "xs", md: "sm" } as const;

/**
 * The glyph of a work state, in its tone. `working` is the activity mark and
 * every other state a static shape. Decorative: the caller pairs it with the
 * state word (or passes `label` when it stands alone).
 */
export function StateIcon({
  state,
  size = "sm",
  label,
  xstyle,
  className,
}: { state: WorkState; size?: StateIconSize; label?: string; className?: string } & XstyleProp) {
  const visual = WORK_STATE[state];
  const px = SIZE_PX[size];
  const a11y = label ? ({ role: "img", "aria-label": label } as const) : ({ "aria-hidden": true } as const);
  if (state === "working") {
    return (
      <span {...a11y} className={cx(sx(styles.wrap, toneStyles[visual.tone], xstyle), className)}>
        <Loader aria-hidden size={LOADER_SIZE[size]} variant="pulse" />
      </span>
    );
  }
  const Icon = visual.icon;
  return (
    <span {...a11y} className={cx(sx(styles.wrap, toneStyles[visual.tone], xstyle), className)}>
      <Icon aria-hidden width={px} height={px} />
    </span>
  );
}

const styles = stylex.create({
  wrap: { alignItems: "center", display: "inline-flex", flexShrink: 0 },
});

const toneStyles = stylex.create({
  neutral: { color: vars["--ads-color-text-subtle"] },
  muted: { color: vars["--ads-color-text-muted"] },
  accent: { color: vars["--ads-color-accent"] },
  info: { color: vars["--ads-color-info"] },
  warning: { color: vars["--ads-color-warning"] },
  success: { color: vars["--ads-color-success"] },
  danger: { color: vars["--ads-color-danger"] },
});

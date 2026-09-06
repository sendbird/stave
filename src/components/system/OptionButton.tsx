import { focusRing } from "../ads/recipes/focus-ring";
import { transition } from "../ads/recipes/transition";
import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/** A selectable, wrapping option row shared by task execution menus. */
export function OptionButton({
  selected,
  density = "comfortable",
  className,
  children,
  ...props
}: Omit<Button.Props, "className"> & {
  selected: boolean;
  density?: "compact" | "comfortable";
  className?: string;
}) {
  const compiled = stylex.props(
    styles.base,
    focusRing.ringInset, transition.control,
    styles[density],
    selected && styles.selected,
  );
  return (
    <Button
      {...props}
      {...compiled}
      aria-pressed={selected}
      className={[compiled.className, className].filter(Boolean).join(" ")}
    >
      {children}
    </Button>
  );
}

const styles = stylex.create({
  base: {
    display: "flex",
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: vars.space8,
    borderRadius: vars.radiusControl,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: { default: "transparent", ":hover": vars.colorSurfaceTint },
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    whiteSpace: "normal",
    textAlign: "start",
    cursor: "pointer",
    opacity: { default: 1, ":disabled": 0.5 },
  },
  compact: { minHeight: vars.controlHeightSm, paddingBlock: 6, paddingInline: 10 },
  comfortable: { minHeight: 44, paddingBlock: 8, paddingInline: 12 },
  selected: { borderColor: vars.colorAccent, backgroundColor: vars.colorSurfaceTint },
});

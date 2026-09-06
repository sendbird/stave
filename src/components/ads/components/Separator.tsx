import * as stylex from "@stylexjs/stylex";

import { SeparatorRoot, type SeparatorRootProps } from "../headless/separator";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type SeparatorProps = Omit<SeparatorRootProps, "className"> & {
  className?: string;
};

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) {
  return (
    <SeparatorRoot
      {...props}
      className={cx(
        sx(styles.root, orientation === "vertical" && styles.vertical),
        className,
      )}
      orientation={orientation}
    />
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: vars.colorBorder,
    blockSize: 1,
    inlineSize: "100%",
  },
  vertical: {
    blockSize: "100%",
    inlineSize: 1,
    minBlockSize: 24,
  },
});

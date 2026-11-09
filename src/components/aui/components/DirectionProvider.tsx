import {
  DirectionProvider as BaseDirectionProvider,
  useDirection,
  type TextDirection,
} from "@base-ui/react/direction-provider";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { cx, sx, type XstyleProp } from "../utils/stylex";

export type { TextDirection };
export { useDirection };

export type DirectionProviderProps = Omit<
  React.ComponentProps<"div">,
  "dir"
> & {
  direction?: TextDirection;
} & XstyleProp;

export function DirectionProvider({
  children,
  className,
  direction = "ltr",
  xstyle,
  ...props
}: DirectionProviderProps) {
  return (
    <BaseDirectionProvider direction={direction}>
      <div
        {...props}
        className={cx(sx(styles.root, xstyle), className)}
        dir={direction}
      >
        {children}
      </div>
    </BaseDirectionProvider>
  );
}

const styles = stylex.create({
  root: {
    minInlineSize: 0,
  },
});

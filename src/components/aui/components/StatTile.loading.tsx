import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";
import { Skeleton } from "./Skeleton";

/**
 * `Progress`'s anatomy while a `StatTile` value is in flight: its label row in
 * the same two type sizes (body label, caption mono ratio, baseline-aligned)
 * and its 8px track, so the tile is as tall loading as it is loaded — hiding
 * the bar used to cost a 50px jump when the numbers landed.
 */
export function StatTileProgressSkeleton() {
  return (
    <div aria-hidden className={sx(styles.root)}>
      <div className={sx(styles.header)}>
        <span className={sx(styles.label)}>
          <Skeleton as="span" variant="text" width="3.5em" />
        </span>
        <span className={sx(styles.ratio)}>
          <Skeleton as="span" variant="text" width="2.5em" />
        </span>
      </div>
      <Skeleton height={8} radius={vars["--aui-radius-full"]} variant="block" />
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: "grid",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
  },
  header: {
    alignItems: "baseline",
    display: "flex",
    justifyContent: "space-between",
  },
  label: {
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-body"],
  },
  ratio: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
  },
});

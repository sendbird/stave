import { sx } from "../utils/stylex";
import { reasoningLoaderStyles as styles } from "./Loader.reasoning-styles";

/** Abstract activity, never a measured stage count or progress estimate. */
export function ReasoningLoaderMark({
  variant,
}: {
  variant: "reason" | "think";
}) {
  if (variant === "think") {
    // A single living form: the halo breathes while the core slowly changes
    // shape. Reduced motion leaves a filled circle inside a faint ring.
    return (
      <span className={sx(styles.orbMark)} data-ads-loader-anatomy="think">
        <span className={sx(styles.halo)} />
        <span className={sx(styles.orb)} />
      </span>
    );
  }

  // A reasoning trace read top to bottom: each node lights, its thought line
  // writes out, and the spine carries the result down to the next step.
  return (
    <svg
      className={sx(styles.mark)}
      data-ads-loader-anatomy="reason"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path className={sx(styles.rail)} d="M5 5V19" />
      <path
        className={sx(styles.stroke, styles.firstSpine)}
        d="M5 7.5V9.5"
        pathLength="1"
      />
      <path
        className={sx(styles.stroke, styles.secondSpine)}
        d="M5 14.5V16.5"
        pathLength="1"
      />
      <path
        className={sx(styles.stroke, styles.firstLine)}
        d="M9.5 5H20"
        pathLength="1"
      />
      <path
        className={sx(styles.stroke, styles.secondLine)}
        d="M9.5 12H16"
        pathLength="1"
      />
      <path
        className={sx(styles.stroke, styles.thirdLine)}
        d="M9.5 19H18.5"
        pathLength="1"
      />
      <circle
        className={sx(styles.node, styles.firstNode)}
        cx="5"
        cy="5"
        r="2"
      />
      <circle
        className={sx(styles.node, styles.secondNode)}
        cx="5"
        cy="12"
        r="2"
      />
      <circle
        className={sx(styles.node, styles.thirdNode)}
        cx="5"
        cy="19"
        r="2"
      />
    </svg>
  );
}

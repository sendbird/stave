import * as stylex from "@stylexjs/stylex";
import { CircleCheck, CircleX, LoaderCircle, TriangleAlert } from "lucide-react";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { PreStartCheck, PreStartCheckState } from "@/lib/missions/pre-start-checks";

const ICONS = {
  pass: CircleCheck,
  warn: TriangleAlert,
  fail: CircleX,
  pending: LoaderCircle,
} as const satisfies Record<PreStartCheckState, unknown>;

/**
 * The checks the Start sheet runs, one row each: a mark, what was checked,
 * and what was found. A warning that needs a decision carries its checkbox.
 */
export function PreStartChecks(props: {
  checks: readonly PreStartCheck[];
  dirtyAcknowledged: boolean;
  onAcknowledgeDirty: (value: boolean) => void;
}) {
  return (
    <ul className={sx(styles.list)} aria-label="Before you start">
      {props.checks.map((check) => {
        const Icon = ICONS[check.state];
        return (
          <li key={check.id} className={sx(styles.row)} data-check={check.id} data-state={check.state}>
            <Icon
              aria-hidden
              className={sx(styles.icon, TONES[check.state], check.state === "pending" && styles.spin)}
            />
            <div className={sx(styles.body)}>
              <span className={sx(styles.label)}>
                {check.label}
                <span className={sx(styles.stateWord)}> — {STATE_WORDS[check.state]}</span>
              </span>
              <span className={sx(styles.detail)}>{check.detail}</span>
              {check.id === "workspace" && check.state === "warn" ? (
                <Checkbox
                  label="Start on top of these changes"
                  checked={props.dirtyAcknowledged}
                  onCheckedChange={(value) => props.onAcknowledgeDirty(value === true)}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const STATE_WORDS: Record<PreStartCheckState, string> = {
  pass: "ready",
  warn: "check this",
  fail: "blocks the start",
  pending: "checking",
};

const spin = stylex.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"], margin: 0, padding: 0, listStyle: "none" },
  row: {
    display: "grid",
    gridTemplateColumns: "16px minmax(0, 1fr)",
    columnGap: vars["--ads-space-8"],
    alignItems: "start",
  },
  icon: { width: 16, height: 16, marginTop: 1 },
  spin: {
    animationName: { default: spin, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  body: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  label: { fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  stateWord: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
  },
  detail: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
});

const TONES = stylex.create({
  pass: { color: vars["--ads-color-success-text"] },
  warn: { color: vars["--ads-color-warning-text"] },
  fail: { color: vars["--ads-color-danger-text"] },
  pending: { color: vars["--ads-color-text-subtle"] },
});

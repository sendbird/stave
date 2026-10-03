import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  PanelRightOpen,
  PictureInPicture2,
} from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import type {
  ShelfRunTone,
  ShelfSegment,
  ShelfTodoProgress,
  ShelfTurnAlert,
} from "./composer-shelf.utils";
import { shelfStyles as styles } from "./composer-shelf.styles";

export type ShelfLabelTone = "default" | "waiting" | "danger" | "accent";

const LABEL_TONES: Record<ShelfLabelTone, StyleXValue | null> = {
  default: null,
  waiting: styles.labelWaiting,
  danger: styles.labelDanger,
  accent: styles.labelAccent,
};

/** The ink each turn tone writes its label in. */
export const SHELF_RUN_TONE_INK: Record<ShelfRunTone, ShelfLabelTone> = {
  active: "default",
  waiting: "waiting",
  steering: "accent",
  stalled: "waiting",
  retrying: "waiting",
  failed: "danger",
  done: "default",
  stopped: "default",
};

/**
 * `Stalled · No updates for 2m · Esc stops it…` as parts for a run's line,
 * written as the turn's own line writes them: the label in the tone's ink, the
 * headline plain, the hint muted.
 */
export function shelfTurnAlertParts(alert: ShelfTurnAlert): ReactNode[] {
  return [
    <span
      key="label"
      data-testid="shelf-turn-alert"
      data-tone={alert.tone}
      className={sx(styles.label, LABEL_TONES[SHELF_RUN_TONE_INK[alert.tone]])}
    >
      {alert.label}
    </span>,
    alert.text ? <span key="text" className={sx(styles.strong)}>{alert.text}</span> : null,
    alert.detail,
  ];
}

/** The same alert in plain words, for a line's title and announcement. */
export function describeShelfTurnAlert(alert: ShelfTurnAlert): string {
  return [alert.label, alert.text, alert.detail].filter(Boolean).join(" · ");
}

export interface ShelfRunDetailToggle {
  kind: "inline" | "floating";
  open: boolean;
  onToggle: () => void;
}

export interface ShelfRunPanelButton {
  label: string;
  onOpen: () => void;
  /** `wide` gives the button up when the composer is narrow. */
  keep: "always" | "wide";
}

/**
 * One line of the composer shelf: a mark, the words (which truncate from the
 * end, so the label survives and the step goes first), the progress (only when
 * there is room), a fixed elapsed slot, the actions, and the way to the
 * details. The turn and an agent run both draw through it, so the two never
 * disagree about where anything is.
 */
export function ShelfRunLine(props: {
  testId: string;
  ariaLabel: string;
  mark: ReactNode;
  /** The words; compose them with `ShelfRunText`. */
  text: ReactNode;
  progress?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  panel?: ShelfRunPanelButton | null;
  detail?: ShelfRunDetailToggle | null;
  /** Read once per change by assistive technology; the text itself is not live. */
  announcement?: string;
  /** Hooks for tests and the preview: the line's state, not its look. */
  dataState?: string;
}) {
  return (
    <div
      className={sx(styles.line)}
      data-testid={props.testId}
      data-state={props.dataState}
      role="group"
      aria-label={props.ariaLabel}
    >
      <span className={sx(styles.mark)}>{props.mark}</span>
      {props.text}
      {props.progress}
      {props.meta ? <span className={sx(styles.meta)}>{props.meta}</span> : null}
      {props.actions ? (
        <span className={sx(styles.actions)}>{props.actions}</span>
      ) : null}
      {props.panel || props.detail ? (
        <span className={sx(styles.actions)}>
          {props.panel ? <ShelfPanelButton {...props.panel} /> : null}
          {props.detail ? <ShelfDetailButton {...props.detail} /> : null}
        </span>
      ) : null}
      {props.announcement ? (
        <span className={sx(styles.visuallyHidden)} aria-live="polite">
          {props.announcement}
        </span>
      ) : null}
    </div>
  );
}

/**
 * `Label · part · part`: the label in the tone's ink, the rest muted. Parts
 * are plain nodes so a caller can shimmer the live step or keep a narrow-only
 * part beside it.
 */
export function ShelfRunText(props: {
  label: ReactNode;
  tone?: ShelfLabelTone;
  /**
   * Shown right after the label only when the composer is too narrow for the
   * progress segment, so the words take over what the track was saying.
   */
  narrow?: string | null;
  parts?: readonly ReactNode[];
  /** The whole line in words, for when it is truncated. */
  title?: string;
}) {
  return (
    <p className={sx(styles.text)} title={props.title}>
      <span className={sx(styles.label, LABEL_TONES[props.tone ?? "default"])}>
        {props.label}
      </span>
      {props.narrow ? (
        <span className={sx(styles.narrowOnly)}>{` · ${props.narrow}`}</span>
      ) : null}
      {props.parts?.map((part, index) =>
        part == null || part === false || part === "" ? null : (
          <span key={index}>
            {typeof part === "string" ? ` · ${part}` : <>{" · "}{part}</>}
          </span>
        ),
      )}
    </p>
  );
}

const SEGMENT_STYLES: Record<ShelfSegment, StyleXValue | null> = {
  done: styles.segmentDone,
  active: styles.segmentActive,
  pending: null,
};

/** `▮▮▮▯▯ 3/7` for the turn's to-do list; hidden when the composer is narrow. */
export function ShelfTodoProgressView(props: { progress: ShelfTodoProgress }) {
  const { done, total, segments } = props.progress;
  return (
    <span
      className={sx(styles.progress)}
      data-testid="composer-shelf-todo-progress"
      role="img"
      aria-label={`${done} of ${total} to-dos done`}
    >
      <span className={sx(styles.segments)} aria-hidden>
        {segments.map((segment, index) => (
          <span
            key={index}
            className={sx(styles.segment, SEGMENT_STYLES[segment])}
          />
        ))}
      </span>
      <span className={sx(styles.count)} aria-hidden>
        {done}/{total}
      </span>
    </span>
  );
}

function ShelfPanelButton(props: ShelfRunPanelButton) {
  return (
    <span className={props.keep === "wide" ? sx(styles.wideOnly) : undefined}>
      <Tooltip content={props.label}>
        <Button
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={props.label}
          onClick={props.onOpen}
          xstyle={styles.quiet}
        >
          <PanelRightOpen aria-hidden />
        </Button>
      </Tooltip>
    </span>
  );
}

function ShelfDetailButton(props: ShelfRunDetailToggle) {
  if (props.kind === "floating") {
    const label = props.open ? "Hide the activity card" : "Show the activity card";
    return (
      <Tooltip content={label}>
        <Button
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={label}
          aria-pressed={props.open}
          onClick={props.onToggle}
          xstyle={props.open ? styles.pressed : styles.quiet}
        >
          <PictureInPicture2 aria-hidden />
        </Button>
      </Tooltip>
    );
  }
  const label = props.open ? "Hide activity details" : "Show activity details";
  return (
    <Button
      variant="quiet"
      size="xs"
      iconOnly
      aria-label={label}
      title={label}
      aria-expanded={props.open}
      onClick={props.onToggle}
      xstyle={styles.quiet}
    >
      {props.open ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
    </Button>
  );
}

import { Children, createContext, isValidElement, useContext, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { Ban, type LucideIcon } from "lucide-react";
import { StateMark } from "@/components/aui/components/StateMark";
import { StatusDot, type StatusDotTone } from "@/components/aui/components/StatusDot";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import { formatTime } from "@/i18n/format";
import type { TarsRecordStyle } from "@/lib/tars/transcript-layout";
import { tarsRecordStyles as styles } from "./tars-record.styles";
import { tarsRecordCard, tarsRecordQuiet, tarsRecordRail, tarsRecordRailParts as railParts } from "./tars-record-variants.styles";
import { TarsRecordStyleContext, useTarsRecordStyle } from "./tars-transcript-layout-context";

/**
 * Where a record stands. Each state has its own glyph in the work-state
 * vocabulary, so a record never reads as plain text: applied is the check,
 * pending the clock, running the one moving ring, refused a ban sign in the
 * halted color (a host rule said no, nothing broke), failed the cross,
 * proposed the hand that waits on you, stopped and halted their state glyphs,
 * skipped the minus of something that no longer applies, and `info` a domain
 * glyph the caller names.
 */
export type TarsRecordState = "applied" | "pending" | "running" | "refused" | "failed" | "proposed" | "stopped" | "halted" | "skipped" | "info";

const MARK: Record<TarsRecordState, { state: WorkState; icon?: LucideIcon }> = {
  applied: { state: "ready" }, pending: { state: "waiting" }, running: { state: "working" }, refused: { state: "halted", icon: Ban },
  failed: { state: "failed" }, proposed: { state: "needs-you" }, stopped: { state: "stopped" }, halted: { state: "halted" },
  skipped: { state: "skipped" }, info: { state: "idle" },
};

const STATUS_STYLE = {
  applied: styles.statusApplied, pending: styles.statusPending, running: styles.statusRunning, refused: styles.statusRefused,
  failed: styles.statusFailed, proposed: styles.statusRefused, stopped: styles.statusPending, halted: styles.statusRefused,
  skipped: styles.statusPending, info: styles.statusPending,
} as const satisfies Record<TarsRecordState, unknown>;

/** Each design option's parts over the default row; the default (`current`) adds none. */
const VARIANT = { current: null, quiet: tarsRecordQuiet, card: tarsRecordCard, rail: tarsRecordRail } as const satisfies Record<TarsRecordStyle, unknown>;

/**
 * The rail's dot per state: the expected outcomes stay quiet and the
 * exceptions carry the warning or danger hue, so a scan stops on them.
 */
const RAIL_TONE: Record<Exclude<TarsRecordState, "running">, StatusDotTone> = {
  applied: "success", pending: "muted", refused: "warning", failed: "danger", proposed: "warning", stopped: "neutral", halted: "warning",
  skipped: "neutral", info: "neutral",
};

/** A row's place in its record list; null outside one. */
const TarsRecordPosition = createContext<number | null>(null);

/** A state's mark alone, decorative: the row says its state in words. */
export function TarsRecordMark({ state, icon, size = "sm" }: { state: TarsRecordState; icon?: LucideIcon; size?: "xs" | "sm" }) {
  const mark = MARK[state];
  return <StateMark state={mark.state} icon={icon ?? mark.icon} size={size} motion={state === "running" ? "moving" : "still"} />;
}

export interface TarsRecordRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  state: TarsRecordState;
  /** A domain glyph in place of the state's (an automatic follow-up, a re-ask); it keeps the state's color. */
  icon?: LucideIcon;
  /** What was done, in strong ink: "Pause", "Delegate", "Draft PR #12 opened". */
  lead?: ReactNode;
  /** What it was done to: the work's title, a question. */
  subject?: ReactNode;
  /** Where it came from, quiet: "click", "Fleet", "Agent: release-manager". */
  meta?: ReactNode;
  /** The outcome in its state's color: "Applied", "Not applied", "Accepted for execution". */
  status?: ReactNode;
  /** Lines under it: why it was refused, where words for a busy run stand. */
  detail?: ReactNode;
  /** Controls that act on the record (open the pull request, retry). */
  actions?: ReactNode;
  /** Takes focus programmatically (a decision card that folded while focused), with the visible focus ring. */
  focusable?: boolean;
  /** When it happened; the rail option shows it at the trailing edge. */
  at?: string;
  /** The record design; absent, the surrounding transcript's (`TarsRecordStyleContext`). */
  variant?: TarsRecordStyle;
  ref?: Ref<HTMLDivElement>;
}

/**
 * One record as a tint row: mark · what was done and to what · where it came
 * from · outcome, then its detail lines. It draws no surface of its own; the
 * list it sits in owns the wash, so the same row also sits in a raised panel
 * row (the side view's timeline) without a nested box.
 */
export function TarsRecordRow({ state, icon, lead, subject, meta, status, detail, actions, focusable, at, variant, ref, ...rest }: TarsRecordRowProps) {
  const style = useTarsRecordStyle(variant);
  const parts = VARIANT[style];
  const rail = style === "rail";
  const position = useContext(TarsRecordPosition);
  // The rail draws a dot for a state and keeps a domain glyph or the moving ring, which say more than a dot.
  const mark = rail && !icon && state !== "running"
    ? <span aria-hidden="true" className={sx(railParts.dot)}><StatusDot tone={RAIL_TONE[state]} size="md" /></span>
    : <TarsRecordMark state={state} icon={icon} />;
  const time = rail && at ? <time dateTime={at} className={sx(railParts.time, Boolean(position) && railParts.timeLater)} data-tars-record-time="">
    {formatTime(at, { hour: "numeric", minute: "2-digit" })}</time> : null;
  return <div {...rest} ref={ref} tabIndex={focusable ? -1 : undefined} className={sx(styles.row, parts?.row, rail && railParts.row, focusable && focusRing.ring)} data-tars-record-state={state}
    data-tars-record-style={style === "current" ? undefined : style}>
    <span className={sx(styles.markSlot, parts?.markSlot)}>{mark}</span>
    <div className={sx(styles.body)}>
      <div className={sx(styles.line)}>
        <span className={sx(styles.main, parts?.main)}>
          {lead ? <span className={sx(styles.lead, parts?.lead)}>{lead}</span> : null}
          {subject ? <span className={sx(styles.subject, parts?.subject)}>{subject}</span> : null}
        </span>
        {meta || status || actions || time ? <span className={sx(styles.trail)}>
          {meta ? <span className={sx(styles.meta)}>{meta}</span> : null}
          {status ? <span className={sx(styles.status, STATUS_STYLE[state])} data-tars-record-status="">{status}</span> : null}
          {actions ? <span className={sx(styles.actions)}>{actions}</span> : null}
          {time}
        </span> : null}
      </div>
      {detail}
    </div>
  </div>;
}

/** A reason or note under a record, in readable ink. */
export function TarsRecordDetail({ children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...rest} className={sx(styles.detail)}>{children}</p>;
}

/** A follow-on step under a record with its own small mark, such as where words for a busy run stand. */
export function TarsRecordSub({ state, children, ...rest }: { state: TarsRecordState; children: ReactNode } & Omit<HTMLAttributes<HTMLParagraphElement>, "children">) {
  return <p {...rest} className={sx(styles.detail, styles.sub)}>
    <span className={sx(styles.markSlot)}><TarsRecordMark state={state} size="xs" /></span>
    <span className={sx(styles.subText)}>{children}</span>
  </p>;
}

/** A diagnostic in the tool's own words (git's, gh's), shown as written. */
export function TarsRecordDiagnostic({ children, title }: { children: ReactNode; title?: string }) {
  return <span className={sx(styles.diagnostic)} title={title}>{children}</span>;
}

/**
 * A run of records on one wash. Each child is one row; empty children are
 * dropped, and an empty run renders nothing.
 */
export function TarsRecordList({ children, variant, ...rest }: { children: ReactNode; variant?: TarsRecordStyle } & Omit<HTMLAttributes<HTMLUListElement>, "children">) {
  const inherited = useTarsRecordStyle();
  const style = variant ?? inherited;
  const parts = VARIANT[style];
  const items = Children.toArray(children);
  if (!items.length) return null;
  const rail = style === "rail";
  const list = <ul {...rest} className={sx(styles.list, parts?.list)} data-tars-records="" data-tars-record-style={style === "current" ? undefined : style}>
    {items.map((child, index) => <li key={isValidElement(child) && child.key != null ? child.key : index} className={sx(styles.item, parts?.item)}>
      {/* The rail joins one row's dot to the next; it starts at the first dot and ends at the last. */}
      {rail && index > 0 ? <span aria-hidden="true" className={sx(railParts.above)} /> : null}
      {rail && index < items.length - 1 ? <span aria-hidden="true" className={sx(railParts.below)} /> : null}
      <TarsRecordPosition value={index}>{child}</TarsRecordPosition>
    </li>)}
  </ul>;
  // Its rows draw in the list's style, so a list given its own `variant` never holds rows of another.
  return style === inherited ? list : <TarsRecordStyleContext value={style}>{list}</TarsRecordStyleContext>;
}

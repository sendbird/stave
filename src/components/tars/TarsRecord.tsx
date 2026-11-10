import { Children, isValidElement, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { Ban, type LucideIcon } from "lucide-react";
import { StateMark } from "@/components/aui/components/StateMark";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import { tarsRecordStyles as styles } from "./tars-record.styles";

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
  /** The outcome in its state's color: "Work added", "Paused", "Not applied". */
  status?: ReactNode;
  /** Lines under it: why it was refused, where words for a busy run stand. */
  detail?: ReactNode;
  /** Controls that act on the record (open the pull request, retry). */
  actions?: ReactNode;
  /** Takes focus programmatically (a decision card that folded while focused), with the visible focus ring. */
  focusable?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * One record as a tint row: mark · what was done and to what · where it came
 * from · outcome, then its detail lines. It draws no surface of its own; the
 * list it sits in owns the wash, so the same row also sits in a raised panel
 * row (the side view's timeline) without a nested box.
 */
export function TarsRecordRow({ state, icon, lead, subject, meta, status, detail, actions, focusable, ref, ...rest }: TarsRecordRowProps) {
  return <div {...rest} ref={ref} tabIndex={focusable ? -1 : undefined} className={sx(styles.row, focusable && focusRing.ring)} data-tars-record-state={state}>
    <span className={sx(styles.markSlot)}><TarsRecordMark state={state} icon={icon} /></span>
    <div className={sx(styles.body)}>
      <div className={sx(styles.line)}>
        <span className={sx(styles.main)}>
          {lead ? <span className={sx(styles.lead)}>{lead}</span> : null}
          {subject ? <span className={sx(styles.subject)}>{subject}</span> : null}
        </span>
        {meta || status || actions ? <span className={sx(styles.trail)}>
          {meta ? <span className={sx(styles.meta)}>{meta}</span> : null}
          {status ? <span className={sx(styles.status, STATUS_STYLE[state])} data-tars-record-status="">{status}</span> : null}
          {actions ? <span className={sx(styles.actions)}>{actions}</span> : null}
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
export function TarsRecordList({ children, ...rest }: { children: ReactNode } & Omit<HTMLAttributes<HTMLUListElement>, "children">) {
  const items = Children.toArray(children);
  if (!items.length) return null;
  return <ul {...rest} className={sx(styles.list)} data-tars-records="">
    {items.map((child, index) => <li key={isValidElement(child) && child.key != null ? child.key : index} className={sx(styles.item)}>{child}</li>)}
  </ul>;
}

import { Children, createContext, isValidElement, useContext, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { Ban, CalendarClock, PanelRightOpen, UserRound, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { StateMark } from "@/components/aui/components/StateMark";
import { Tooltip } from "@/components/aui/components/Tooltip";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import { formatTime } from "@/i18n/format";
import { useTranslation } from "@/i18n";
import { TarsMark } from "./TarsMark";
import { tarsRecordStyles as styles } from "./tars-record.styles";

/**
 * Where a record stands. Each state has its own glyph in the work-state
 * vocabulary, drawn on the rail: applied is the check, pending the clock,
 * running the one moving ring, refused a ban sign in the halted color (a host
 * rule said no, nothing broke), failed the cross, proposed the hand that waits
 * on you, stopped and halted their state glyphs, skipped the minus of
 * something that no longer applies, and `info` a domain glyph the caller names.
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

/** A row's place in its record list; null outside one. */
const TarsRecordPosition = createContext<number | null>(null);

/**
 * Opens a piece of work from a record's work chip. The conversation provides
 * it (the side view's brief); elsewhere a work chip is a plain value, never a
 * control that does nothing.
 */
export const TarsRecordOpenWorkContext = createContext<((responsibilityId: string) => void) | null>(null);

/** A state's mark alone, decorative: the row says its state in words. */
export function TarsRecordMark({ state, icon, size = "sm" }: { state: TarsRecordState; icon?: LucideIcon; size?: "xs" | "sm" }) {
  const mark = MARK[state];
  return <StateMark state={mark.state} icon={icon ?? mark.icon} size={size} motion={state === "running" ? "moving" : "still"} />;
}

/**
 * Who did what a record says. `you`: the user did it directly (a click in
 * Tars, a key, a short answer, Fleet, the task view, a drag). `tars`: Tars
 * did it from the user's message. `schedule`: a schedule started it at its
 * time; nobody typed it and Tars did not decide it. `hint` says it in a
 * sentence, for the tooltip and for assistive technology.
 */
export interface TarsRecordActor { by: "you" | "tars" | "schedule"; hint: string }

/** The actor's glyph with its sentence on hover and for assistive technology. It explains; it is not a control. */
function TarsRecordActorMark({ actor }: { actor: TarsRecordActor }) {
  const Icon = actor.by === "you" ? UserRound : actor.by === "schedule" ? CalendarClock : TarsMark;
  return <Tooltip content={actor.hint}>
    <span role="img" aria-label={actor.hint} className={sx(styles.actor, actor.by === "tars" && styles.actorTars)} data-tars-record-actor={actor.by}>
      <Icon aria-hidden="true" className={sx(styles.actorIcon)} />
    </span>
  </Tooltip>;
}

/**
 * A value on a record, such as a priority, an agent or a branch: an AUI badge
 * in the row's own type. It is a value, not a control: no hover, no pointer.
 */
export function TarsRecordChip({ icon: Icon, tone = "neutral", hint, children, ...rest }: {
  icon?: LucideIcon; tone?: BadgeTone; hint?: string; children: ReactNode;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  const chip = <Badge {...rest} tone={tone} xstyle={styles.chip}>
    {Icon ? <Icon aria-hidden="true" className={sx(styles.chipIcon)} /> : null}
    <span className={sx(styles.chipText)}>{children}</span>
  </Badge>;
  return hint ? <Tooltip content={hint}>{chip}</Tooltip> : chip;
}

/**
 * The work a record is about, as a chip. Where the conversation can open the
 * work (`TarsRecordOpenWorkContext`) it is a button that opens its brief in
 * the side view; elsewhere it is a plain value. A long title ellipsizes and
 * its tooltip gives it in full.
 */
export function TarsWorkChip({ title, responsibilityId }: { title: string; responsibilityId?: string }) {
  const { t } = useTranslation(["shell"]);
  const open = useContext(TarsRecordOpenWorkContext);
  if (!open || !responsibilityId) return <TarsRecordChip hint={title} data-tars-record-work="">{title}</TarsRecordChip>;
  return <Tooltip content={t("shell:tars.record.openWork", { title })}>
    <Button type="button" variant="outline" size="2xs" layout="host" xstyle={styles.chipButton}
      data-tars-record-work="" data-tars-record-open={responsibilityId} aria-label={t("shell:tars.record.openWork", { title })}
      onClick={() => open(responsibilityId)}>
      <span className={sx(styles.chipText)}>{title}</span>
      <PanelRightOpen aria-hidden="true" className={sx(styles.chipIcon)} />
    </Button>
  </Tooltip>;
}

export interface TarsRecordRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  state: TarsRecordState;
  /** A domain glyph in place of the state's (an automatic follow-up, a re-ask); it keeps the state's color. */
  icon?: LucideIcon;
  /** Who did it, when the record is an action someone took. */
  actor?: TarsRecordActor;
  /** What was done, in strong ink: "Pause", "Delegate", "Draft PR #12 opened". */
  lead?: ReactNode;
  /** What it was done to, as text: a question, a sentence. A piece of work goes in `values` as a `TarsWorkChip`. */
  subject?: ReactNode;
  /** The values it was done with, as chips: the work, a priority, an agent, a branch, the pull request. */
  values?: ReactNode;
  /** The outcome in its state's color: "Work added", "Paused", "Not applied". */
  status?: ReactNode;
  /** Lines under it: why it was refused, where words for a busy run stand. */
  detail?: ReactNode;
  /** Controls that act on the record (retry). */
  actions?: ReactNode;
  /** Takes focus programmatically (a decision card that folded while focused), with the visible focus ring. */
  focusable?: boolean;
  /** When it happened, at the trailing edge: a run's first row shows it, later rows on hover or focus. */
  at?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * One record on the rail: its state mark · who did it · what was done · the
 * values it was done to · the outcome and the time, then its detail lines.
 * It draws no surface of its own, so the same row also sits in a raised panel
 * row (the side view's timeline) without a nested box.
 */
export function TarsRecordRow({ state, icon, actor, lead, subject, values, status, detail, actions, focusable, at, ref, ...rest }: TarsRecordRowProps) {
  const position = useContext(TarsRecordPosition);
  const time = at ? <time dateTime={at} className={sx(styles.time, Boolean(position) && styles.timeLater)} data-tars-record-time="">
    {formatTime(at, { hour: "numeric", minute: "2-digit" })}</time> : null;
  return <div {...rest} ref={ref} tabIndex={focusable ? -1 : undefined} className={sx(styles.row, focusable && focusRing.ring)} data-tars-record-state={state}>
    <span className={sx(styles.markSlot)}><TarsRecordMark state={state} icon={icon} /></span>
    <div className={sx(styles.body)}>
      <div className={sx(styles.line)}>
        <span className={sx(styles.main)}>
          <span className={sx(styles.text)}>
            {/* The actor's glyph opens the first text, inside it, so a long sentence wraps after the glyph instead of leaving it alone on a line. */}
            {lead ? <span className={sx(styles.lead)} data-tars-record-lead="">{actor ? <TarsRecordActorMark actor={actor} /> : null}{lead}</span> : null}
            {subject ? <span className={sx(styles.subject)} data-tars-record-subject="">{!lead && actor ? <TarsRecordActorMark actor={actor} /> : null}{subject}</span> : null}
            {!lead && !subject && actor ? <TarsRecordActorMark actor={actor} /> : null}
          </span>
          {values ? <span className={sx(styles.values)}>{values}</span> : null}
        </span>
        {status || actions || time ? <span className={sx(styles.trail)}>
          {status ? <span className={sx(styles.status, STATUS_STYLE[state])} data-tars-record-status="">{status}</span> : null}
          {actions ? <span className={sx(styles.actions)}>{actions}</span> : null}
          {time}
        </span> : null}
      </div>
      {detail}
    </div>
  </div>;
}

/**
 * A record that heads what came of it: an automatic follow-up (or a re-ask)
 * and the reply Tars wrote for it. `head` is one `TarsRecordRow`, the reply's
 * origin label; `children` hang from its mark on the rail's text column, with
 * the rail running on beside them, so the head is never read as a separate
 * record. Without children it is the head alone, one compact item.
 */
export function TarsRecordThread({ head, children, ...rest }: { head: ReactNode; children?: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const body = Children.toArray(children);
  return <div {...rest} className={sx(styles.thread)} data-tars-record-thread="">
    {body.length ? <span aria-hidden="true" className={sx(styles.threadRail)} /> : null}
    {head}
    {body.length ? <div className={sx(styles.threadBody)} data-tars-record-thread-body="">{body}</div> : null}
  </div>;
}

/** A reason or note under a record, in readable ink. */
export function TarsRecordDetail({ children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...rest} className={sx(styles.detail)}>{children}</p>;
}

/** A follow-on step under a record with its own small mark, such as where words for a busy run stand. */
export function TarsRecordSub({ state, children, ...rest }: { state: TarsRecordState; children: ReactNode } & Omit<HTMLAttributes<HTMLParagraphElement>, "children">) {
  return <p {...rest} className={sx(styles.detail, styles.sub)}>
    <span className={sx(styles.subMark)}><TarsRecordMark state={state} size="xs" /></span>
    <span className={sx(styles.subText)}>{children}</span>
  </p>;
}

/** A diagnostic in the tool's own words, shown as written. */
export function TarsRecordDiagnostic({ children, title }: { children: ReactNode; title?: string }) {
  return <span className={sx(styles.diagnostic)} title={title}>{children}</span>;
}

/**
 * A run of records on one stretch of the rail. Each child is one row; empty
 * children are dropped, and an empty run renders nothing.
 */
export function TarsRecordList({ children, standalone = false, ...rest }: {
  children: ReactNode;
  /** A run between exchanges in the transcript: it takes an exchange's block padding, so every gap between two entries is the same. */
  standalone?: boolean;
} & Omit<HTMLAttributes<HTMLUListElement>, "children">) {
  const items = Children.toArray(children);
  if (!items.length) return null;
  return <ul {...rest} className={sx(styles.list, standalone && styles.listStandalone)} data-tars-records="">
    {items.map((child, index) => <li key={isValidElement(child) && child.key != null ? child.key : index} className={sx(styles.item)}>
      {/* The rail joins one row's mark to the next; it starts at the first mark and ends at the last. */}
      {index > 0 ? <span aria-hidden="true" className={sx(styles.railAbove)} /> : null}
      {index < items.length - 1 ? <span aria-hidden="true" className={sx(styles.railBelow)} /> : null}
      <TarsRecordPosition value={index}>{child}</TarsRecordPosition>
    </li>)}
  </ul>;
}

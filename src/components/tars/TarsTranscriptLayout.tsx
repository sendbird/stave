import type { ReactElement, ReactNode } from "react";
import { getIntlLocale, i18n, useTranslation } from "@/i18n";
import { formatDate, formatDateTime, formatTime } from "@/i18n/format";
import { RelativeTime } from "@/components/aui/components/RelativeTime";
import { Separator } from "@/components/aui/components/Separator";
import { sx } from "@/components/aui/utils/stylex";
import { splitTarsTranscript, tarsDaysAgo, type TarsTranscriptLayout } from "@/lib/tars/transcript-layout";
import { TarsRecordList } from "./TarsRecord";
import { tarsTranscriptStyles as styles } from "./tars-transcript.styles";

const CLOCK: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** A day's name: Today, Yesterday, then the weekday and date ("Fri, Nov 7"; another year adds it). */
export function tarsDayLabel(at: string, now: number = Date.now()): string {
  const days = tarsDaysAgo(at, now);
  if (days === 0) return i18n.t("common:time.today");
  if (days === 1) return i18n.t("common:time.yesterday");
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return formatDate(at, sameYear ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

/**
 * A clock time for the transcript: "2:32 PM" ("오후 2:32"). Without day
 * breaks to say which day, a time from another day carries it: "Yesterday,
 * 2:32 PM", then "Fri, Nov 7, 2:32 PM".
 */
export function tarsClockLabel(at: string | Date, { withDay, now = Date.now() }: { withDay: boolean; now?: number }): string {
  const days = tarsDaysAgo(at, now);
  if (!withDay || days === 0) return formatTime(at, CLOCK);
  if (days === 1) return i18n.t("shell:tars.conversation.time.yesterdayAt", { time: formatTime(at, CLOCK) });
  return formatDateTime(at, { weekday: "short", month: "short", day: "numeric", ...CLOCK });
}

/** A transcript time as a focusable button whose card gives the full local and UTC time, like the message time. */
export function TarsClockTime({ at, withDay }: { at: string; withDay: boolean }) {
  useTranslation();
  return <RelativeTime date={at} locale={getIntlLocale()} utcLabel={i18n.t("common:time.utc")} formatRelative={(date) => tarsClockLabel(date, { withDay })} />;
}

/** `edge`: the time beside a user's bubble or on a follow-up's line, shown on hover or focus. */
export function TarsEdgeTime({ at, withDay }: { at: string; withDay: boolean }) {
  return <span className={sx(styles.edgeTime)} data-tars-message-time="edge"><TarsClockTime at={at} withDay={withDay} /></span>;
}

/** A day break: a centred label in a rule, or a pill that stays at the top while its day scrolls. */
function TarsDayBreak({ at, style }: { at: string; style: "rule" | "pill" }) {
  useTranslation();
  const label = tarsDayLabel(at);
  return style === "pill"
    ? <div role="separator" aria-label={label} className={sx(styles.pill)} data-tars-day-separator="pill">{label}</div>
    : <Separator label={<span className={sx(styles.ruleLabel)}>{label}</span>} aria-label={label} xstyle={styles.rule} data-tars-day-separator="rule" />;
}

export type TarsTranscriptEntry = { id: string; at: string; node: ReactNode | { record: ReactElement } };

const isRecord = (node: TarsTranscriptEntry["node"]): node is { record: ReactElement } => Boolean(node && typeof node === "object" && "record" in node);

/**
 * Records that follow each other in the timeline (controls, publish outcomes,
 * notices) share one record list, so a run of them reads as one log block
 * between messages instead of a column of separate lines.
 */
export function groupTarsRecordRuns(entries: Array<TarsTranscriptEntry["node"]>): ReactNode[] {
  const out: ReactNode[] = [];
  let run: ReactElement[] = [];
  const flush = () => { if (run.length) out.push(<TarsRecordList key={`records:${run[0]!.key}`}>{run}</TarsRecordList>); run = []; };
  for (const entry of entries) {
    if (isRecord(entry)) { run.push(entry.record); continue; }
    flush();
    out.push(entry);
  }
  flush();
  return out;
}

/**
 * The transcript's entries, in time order, laid out for the chosen options:
 * a day break before each local day, and a run's time above its first entry
 * (`grouped`) or under its last (`run`). A break or a time ends a run of
 * records, so a record list never spans one.
 */
export function layoutTarsTranscript(entries: readonly TarsTranscriptEntry[], layout: Pick<TarsTranscriptLayout, "timeStyle" | "daySeparator">): ReactNode[] {
  const { timeStyle, daySeparator } = layout;
  if (daySeparator === "none" && timeStyle !== "run" && timeStyle !== "grouped") return groupTarsRecordRuns(entries.map((entry) => entry.node));
  const withDay = daySeparator === "none";
  return splitTarsTranscript(entries).flatMap((day) => {
    const nodes: Array<TarsTranscriptEntry["node"]> = [];
    for (const run of day.runs) {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      if (timeStyle === "grouped") nodes.push(<div key={`time:${first.id}`} className={sx(styles.groupTime)} data-tars-run-time="grouped"><TarsClockTime at={first.at} withDay={withDay} /></div>);
      nodes.push(...run.map((entry) => entry.node));
      if (timeStyle === "run") nodes.push(<div key={`time:${last.id}`} className={sx(styles.runTime)} data-tars-run-time="run"><TarsClockTime at={last.at} withDay={withDay} /></div>);
    }
    const body = groupTarsRecordRuns(nodes);
    if (daySeparator === "none") return body;
    if (daySeparator === "rule") return [<TarsDayBreak key={`day:${day.key}`} at={day.at} style="rule" />, ...body];
    return [<section key={`day:${day.key}`} className={sx(styles.day)} data-tars-day={day.key}><TarsDayBreak at={day.at} style="pill" />{body}</section>];
  });
}

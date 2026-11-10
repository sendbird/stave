import type { ReactElement, ReactNode } from "react";
import { getIntlLocale, i18n, useTranslation } from "@/i18n";
import { formatDate, formatTime } from "@/i18n/format";
import { RelativeTime } from "@/components/aui/components/RelativeTime";
import { Separator } from "@/components/aui/components/Separator";
import { sx } from "@/components/aui/utils/stylex";
import { splitTarsTranscriptDays, tarsDaysAgo } from "@/lib/tars/transcript-layout";
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

/** A transcript time: "2:32 PM" ("오후 2:32"). The day rule above it says which day. */
export function tarsClockLabel(at: string | Date): string {
  return formatTime(at, CLOCK);
}

/**
 * When a message was sent, beside the user's bubble (or at the end of an
 * automatic follow-up's line), shown while its exchange is hovered or holds
 * focus. It is a button, so the keyboard reaches it and its card gives the
 * full local and UTC time.
 */
export function TarsEdgeTime({ at }: { at: string }) {
  useTranslation();
  return <span className={sx(styles.edgeTime)} data-tars-message-time="edge">
    <RelativeTime date={at} locale={getIntlLocale()} utcLabel={i18n.t("common:time.utc")} formatRelative={(date) => tarsClockLabel(date)} />
  </span>;
}

/** A day break: the day's name centred in a thin rule. */
function TarsDayRule({ at }: { at: string }) {
  useTranslation();
  const label = tarsDayLabel(at);
  return <Separator label={<span className={sx(styles.ruleLabel)} data-tars-day-label="">{label}</span>} aria-label={label} xstyle={styles.rule} data-tars-day-separator="rule" />;
}

export type TarsTranscriptEntry = { id: string; at: string; node: ReactNode | { record: ReactElement } };

const isRecord = (node: TarsTranscriptEntry["node"]): node is { record: ReactElement } => Boolean(node && typeof node === "object" && "record" in node);

/**
 * Records that follow each other in the timeline (controls, publish outcomes,
 * notices) share one record list, so a run of them reads as one stretch of
 * the rail between messages instead of a column of separate lines.
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
 * The transcript's entries, in time order: a day rule before each local day.
 * A rule ends a run of records, so a record list never spans midnight.
 */
export function layoutTarsTranscript(entries: readonly TarsTranscriptEntry[]): ReactNode[] {
  return splitTarsTranscriptDays(entries).flatMap((day) => [
    <TarsDayRule key={`day:${day.key}`} at={day.at} />,
    ...groupTarsRecordRuns(day.entries.map((entry) => entry.node)),
  ]);
}

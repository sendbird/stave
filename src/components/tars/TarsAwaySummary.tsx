import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { ArrowDown, GitPullRequest, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { useConversationFrameHost } from "@/components/ai-elements/conversation";
import type { TarsConversation } from "@/lib/tars/conversation";
import type { TarsDecisionView } from "@/lib/tars/decisions";
import type { TarsPublishProposalView } from "@/lib/tars/publish-model";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import {
  buildTarsAwaySummary, placeTarsAwayCard, type TarsAwayGroupKind, type TarsAwayItem, type TarsAwayLink, type TarsAwaySummary,
} from "@/lib/tars/away-summary";
import { TarsRecordMark, TarsWorkChip, type TarsRecordState } from "./TarsRecord";
import { layoutTarsTranscript, type TarsTranscriptEntry } from "./TarsTranscriptLayout";
import { tarsAwaySummaryStyles as styles } from "./tars-away-summary.styles";
import { useTarsAwaySummary } from "./use-tars-away-summary";

/** Within this many pixels of the bottom the transcript counts as scrolled to its end, as the conversation's own scroll button judges it. */
const AT_END_PX = 40;

/** How long an arrival waits for the conversation's own read before deciding there is nothing to show. */
const ARRIVAL_GRACE_MS = 5_000;

/** Each group's mark, in the record rail's states: the hand that waits on you, the stop, the check, and the pull request. */
const GROUP_MARK: Record<TarsAwayGroupKind, { state: TarsRecordState; icon?: LucideIcon }> = {
  waiting: { state: "proposed" }, blocked: { state: "halted" }, finished: { state: "applied" }, pullRequests: { state: "info", icon: GitPullRequest },
};

/** Which words an item's link wears: the side view it opens, or the place in the conversation it goes to. */
function linkKind(link: TarsAwayLink): "report" | "timeline" | "decision" | "conversation" {
  if (link.kind === "decision" || link.kind === "publishCard") return "decision";
  if (link.kind === "publishRecord") return "conversation";
  return link.target.kind === "timeline" ? "timeline" : "report";
}

/** The card or record an item's link goes to, in the transcript. */
function linkSelector(link: Exclude<TarsAwayLink, { kind: "side" }>) {
  if (link.kind === "decision") return `[data-tars-decision="${CSS.escape(link.decisionId)}"]`;
  if (link.kind === "publishCard") return `[data-tars-publish-card="${CSS.escape(link.requestId)}"]`;
  return `[data-tars-publish-request="${CSS.escape(link.requestId)}"]`;
}

/**
 * Brings a place in the transcript to the top of view and puts focus on it,
 * so the keyboard continues from there. A place that takes no focus by itself
 * takes it for this once.
 */
function goToTranscriptPlace(target: Element | null | undefined, markUserScrollIntent: (() => void) | undefined) {
  if (!(target instanceof HTMLElement)) return;
  // The reader asked for this scroll: the conversation must not pull back to its end.
  markUserScrollIntent?.();
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
    target.tabIndex = -1;
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
}

function TarsAwayItemRow({ item, onOpenSide, onGoTo }: {
  item: TarsAwayItem;
  onOpenSide?: (target: TarsSideViewTarget) => void;
  onGoTo: (link: Exclude<TarsAwayLink, { kind: "side" }>) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const { link } = item;
  const kind = linkKind(link);
  const name = item.title ?? item.question ?? "";
  const open = link.kind === "side" ? (onOpenSide ? () => onOpenSide(link.target) : null) : () => onGoTo(link);
  return <li className={sx(styles.item)} data-tars-away-item={item.key}>
    {item.title ? <TarsWorkChip title={item.title} responsibilityId={item.responsibilityId ?? undefined} />
      : <span className={sx(styles.question)} title={item.question ?? undefined}>{item.question}</span>}
    {item.trouble ? <span className={sx(styles.note)} data-tars-away-trouble={item.trouble}>{t(`shell:tars.away.trouble.${item.trouble}`)}</span> : null}
    {item.pullRequest ? <span className={sx(styles.note)}>{t("shell:tars.publish.record.pullRequest", { number: item.pullRequest })}</span> : null}
    {open ? <Button type="button" variant="ghost" size="2xs" data-tars-away-link={kind} aria-label={t(`shell:tars.away.linkFor.${kind}`, { title: name })} onClick={open}>
      {t(`shell:tars.away.link.${kind}`)}</Button> : null}
  </li>;
}

/**
 * The summary card: when the user left, then each group as a count over the
 * work it names, each with a link to its report, its timeline or its own card
 * in the conversation. It changes nothing: the records it summarizes stay
 * below it.
 */
export function TarsAwaySummaryCard({ summary, onOpenSide, onGoTo, onJump, onDismiss, ref }: {
  summary: TarsAwaySummary;
  onOpenSide?: (target: TarsSideViewTarget) => void;
  onGoTo: (link: Exclude<TarsAwayLink, { kind: "side" }>) => void;
  /** Absent when nothing follows the card. */
  onJump?: () => void;
  onDismiss: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const { t } = useTranslation(["shell"]);
  const titleId = useId();
  return <section ref={ref} className={sx(styles.card)} aria-labelledby={titleId} data-tars-away="" data-tars-away-total={summary.total}>
    <div className={sx(styles.header)}>
      <div className={sx(styles.heading)}>
        <h3 id={titleId} className={sx(styles.title)}>{t("shell:tars.away.title")}</h3>
        <p className={sx(styles.since)}><time dateTime={summary.since}>{t("shell:tars.away.since", { time: formatDateTime(summary.since) })}</time></p>
      </div>
      <Button type="button" variant="ghost" size="2xs" xstyle={styles.dismiss} data-tars-away-dismiss="" onClick={onDismiss}>{t("shell:tars.away.dismiss")}</Button>
    </div>
    <ul className={sx(styles.groups)}>
      {summary.groups.map((group) => <li key={group.kind} className={sx(styles.group)} data-tars-away-group={group.kind} data-tars-away-count={group.count}>
        <span className={sx(styles.markSlot)}><TarsRecordMark state={GROUP_MARK[group.kind].state} icon={GROUP_MARK[group.kind].icon} /></span>
        <p className={sx(styles.count)}>{t(`shell:tars.away.group.${group.kind}`, { count: group.count })}</p>
        <ul className={sx(styles.items)}>
          {group.items.map((item) => <TarsAwayItemRow key={item.key} item={item} onOpenSide={onOpenSide} onGoTo={onGoTo} />)}
          {group.more > 0 ? <li className={sx(styles.more)} data-tars-away-more={group.more}>{t("shell:tars.away.more", { count: group.more })}</li> : null}
        </ul>
      </li>)}
    </ul>
    {onJump ? <div className={sx(styles.footer)}>
      <Button type="button" variant="secondary" size="xs" data-tars-away-jump="" onClick={onJump}>
        <ArrowDown aria-hidden="true" className={sx(styles.jumpIcon)} />{t("shell:tars.away.jump")}</Button>
    </div> : null}
  </section>;
}

/**
 * The transcript's entries with the "while you were away" card where the user
 * left. It is the conversation's one mount point for the summary: it tracks
 * when the end was last seen, builds the summary from the conversation the
 * window already holds, and lays the entries out as before. Without a summary
 * the layout is exactly the entries'.
 */
export function TarsAwayTranscript({ entries, conversation, decisions, publishProposals, titleOf, onOpenSide }: {
  entries: readonly TarsTranscriptEntry[];
  conversation: TarsConversation | null;
  decisions: readonly TarsDecisionView[];
  publishProposals?: readonly TarsPublishProposalView[];
  titleOf?: (responsibilityId: string) => string | undefined;
  onOpenSide?: (target: TarsSideViewTarget) => void;
}) {
  const host = useConversationFrameHost();
  const container = host?.scrollContainer ?? null;
  const markUserScrollIntent = host?.markUserScrollIntent;
  const isAtEnd = useCallback(() => Boolean(container?.isConnected && container.clientHeight > 0
    && container.scrollHeight - container.scrollTop - container.clientHeight < AT_END_PX), [container]);
  const bridge = typeof window !== "undefined" ? window.api?.tars : undefined;
  const away = useTarsAwaySummary(bridge, isAtEnd, entries.at(-1)?.id ?? "");
  const summary = useMemo(() => buildTarsAwaySummary({ span: away.span, conversation, decisions, publishProposals, titleOf }),
    [away.span, conversation, decisions, publishProposals, titleOf]);
  const card = useRef<HTMLElement>(null);
  const { arrived, settle } = away;
  const loaded = conversation !== null;
  const shown = summary !== null;
  // The card this arrival opened is brought into view once, after the conversation's own scroll to its end has run.
  useEffect(() => {
    if (!arrived || !loaded) return;
    // Nothing to show yet: the read that coming back started may still bring what happened, so the wait ends only after a moment.
    if (!shown) { const timer = setTimeout(settle, ARRIVAL_GRACE_MS); return () => clearTimeout(timer); }
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
      const element = card.current;
      const view = container?.getBoundingClientRect();
      const box = element?.getBoundingClientRect();
      if (element && view && box && (box.top < view.top || box.bottom > view.bottom)) {
        markUserScrollIntent?.();
        element.scrollIntoView({ block: "start" });
      }
      settle();
    }); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [arrived, container, loaded, markUserScrollIntent, settle, shown]);
  if (!summary) return <>{layoutTarsTranscript(entries)}</>;
  const goTo = (link: Exclude<TarsAwayLink, { kind: "side" }>) => goToTranscriptPlace(container?.querySelector(linkSelector(link)), markUserScrollIntent);
  /** The first thing after the card that is not a day rule: the first entry the user has not seen. */
  const jump = () => {
    let next = card.current?.nextElementSibling;
    while (next?.hasAttribute("data-tars-day-separator")) next = next.nextElementSibling;
    goToTranscriptPlace(next, markUserScrollIntent);
  };
  return <>{layoutTarsTranscript(placeTarsAwayCard(entries, summary.since, (at, firstNewId): TarsTranscriptEntry => ({ id: `away:${summary.since}`, at,
    node: <TarsAwaySummaryCard key={`away:${summary.since}`} ref={card} summary={summary} onOpenSide={onOpenSide} onGoTo={goTo}
      onJump={firstNewId === null ? undefined : jump} onDismiss={away.dismiss} /> })))}</>;
}

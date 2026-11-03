import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { RotateCcw } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { StateMark } from "@/components/ads/components/StateMark";
import { Textarea } from "@/components/ads/components/Textarea";
import { ToggleGroup } from "@/components/ads/components/ToggleGroup";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import { ActionButton } from "@/components/system/ActionButton";
import { RelativeTime } from "@/components/system/RelativeTime";
import { formatDuration, formatNumber } from "@/i18n/format";
import type { I18nKey } from "@/i18n/runtime";
import {
  isDelegationExchangeLive,
  resolveExchangeElapsedMs,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import { describeExchangeStatus } from "@/lib/delegation/format";
import {
  countSubagentFilters,
  SUBAGENT_FILTER_WORK_STATE,
  SUBAGENT_FILTERS,
  subagentFilterOf,
  subagentNeedsUser,
  type SubagentFilter,
} from "@/lib/delegation/subagent-list";
import { subagentResultLine, subagentWorkState } from "@/lib/delegation/subagent-summary";

/** One row of the Subagents list, already resolved by its container. */
export interface SubagentListItem {
  exchange: DelegationExchange;
  /** Who the subagent is: its agent, model or label. */
  who: string;
  /** What it was asked to do. */
  what: string;
  canStop: boolean;
  busy: boolean;
  error?: string;
  onOpen?: () => void;
  onStop?: () => void;
  onView?: () => void;
  /**
   * Starts a new attempt with these instructions and settles `false` when the
   * retry was refused (the row shows why). Set only on a failed delegated task
   * the user may retry; an in-turn subagent is retried by the turn that called
   * it, and a managed task's subagents are read-only.
   */
  onRetry?: (prompt: string) => boolean | Promise<boolean>;
}

type SubagentListFilter = "all" | SubagentFilter;

const FILTER_LABEL_KEYS = {
  "needs-you": "session:subagentsSection.filter.needsYou",
  failed: "session:subagentsSection.filter.failed",
  running: "session:subagentsSection.filter.running",
  done: "session:subagentsSection.filter.done",
  stopped: "session:subagentsSection.filter.stopped",
} as const satisfies Record<SubagentFilter, I18nKey>;

/**
 * The Subagents list, free of the store so a test can render it: a tray that
 * counts the children by state and filters the list by one of them, retries
 * every failed delegated task at once and opens the first child waiting on
 * the user in one click; then the rows in the order `orderSubagentList` gives
 * them (children that need the user first). `nowMs` fixes the clock for a
 * deterministic render; live rows otherwise tick their elapsed time each
 * second.
 */
export function SubagentsList(props: {
  items: readonly SubagentListItem[];
  nowMs?: number;
  /** Shown between the summary tray and the rows, such as the files children share. */
  afterTray?: ReactNode;
}) {
  useTranslation();
  const [selected, setSelected] = useState<SubagentListFilter>("all");
  const counts = countSubagentFilters(props.items.map((item) => item.exchange));
  // A filter whose last row moved on falls back to every row, never an empty list.
  const filter: SubagentListFilter = selected !== "all" && counts[selected] === 0 ? "all" : selected;
  const shown = filter === "all" ? props.items : props.items.filter((item) => subagentFilterOf(item.exchange) === filter);
  return (
    <>
      <SubagentsTray items={props.items} counts={counts} filter={filter} onFilter={setSelected} />
      {props.afterTray}
      <ul aria-label={i18n.t("session:subagentsSection.ariaLabel")} className={sx(styles.list)} data-testid="subagents-list">
        {shown.map((item) => (
          <SubagentRow key={item.exchange.id} item={item} nowMs={props.nowMs} />
        ))}
      </ul>
    </>
  );
}

/**
 * The parent's view of its children: `All 6 · Needs you 1 · Failed 2 ·
 * Running 2 · Done 1` as one pressed filter, `Retry failed (1)` for the failed
 * delegated tasks, and the first child that waits on the user one click away.
 * With every child in one state the counts are a sentence, not a filter.
 */
function SubagentsTray(props: {
  items: readonly SubagentListItem[];
  counts: Record<SubagentFilter, number>;
  filter: SubagentListFilter;
  onFilter: (filter: SubagentListFilter) => void;
}) {
  useTranslation();
  const { counts } = props;
  // What the last "Retry failed" did, said once; it outlives the button, which
  // goes away when nothing is left to retry.
  const [notice, setNotice] = useState<{ started: number; refused: number } | null>(null);
  const present = SUBAGENT_FILTERS.filter((filter) => counts[filter] > 0);
  if (present.length === 0) return null;
  const first = props.items.find((item) => item.onOpen && subagentNeedsUser(item.exchange));
  const retryable = props.items.filter((item) => item.onRetry && subagentFilterOf(item.exchange) === "failed");
  return (
    <div className={sx(styles.tray)}>
      {present.length > 1 ? (
        <ToggleGroup
          aria-label={i18n.t("session:subagentsSection.filterLabel")}
          density="compact"
          data-testid="subagents-filter"
          value={[props.filter]}
          items={[
            { value: "all", label: <FilterLabel label={i18n.t("session:subagentsSection.filter.all")} count={props.items.length} /> },
            ...present.map((filter) => ({
              value: filter,
              icon: <StateMark state={SUBAGENT_FILTER_WORK_STATE[filter]} motion="still" />,
              label: <FilterLabel label={i18n.t(FILTER_LABEL_KEYS[filter])} count={counts[filter]} />,
            })),
          ]}
          onValueChange={(next) => {
            // Pressing the pressed filter again shows every row.
            const value = next[0] as SubagentListFilter | undefined;
            props.onFilter(value ?? "all");
          }}
        />
      ) : (
        <p className={sx(styles.summaryText)}>{describeFilterCount(present[0]!, counts[present[0]!])}</p>
      )}
      {retryable.length > 0 || first ? (
        <SubagentsTrayActions retryable={retryable} first={first} onRetried={setNotice} onRetryOpen={() => setNotice(null)} />
      ) : null}
      <VisuallyHidden role="status" aria-live="polite">
        {notice ? describeRetryNotice(notice) : ""}
      </VisuallyHidden>
    </div>
  );
}

/** `Retrying 2 failed tasks. 1 could not be retried; its row says why.` */
function describeRetryNotice(notice: { started: number; refused: number }): string {
  return [
    notice.started > 0 ? i18n.t("session:subagentsSection.retryFailedStarted", { count: notice.started }) : null,
    notice.refused > 0 ? i18n.t("session:subagentsSection.retryFailedRefused", { count: notice.refused }) : null,
  ].filter((part): part is string => part !== null).join(" ");
}

/** `3 running`: the tray's sentence when every child is in one state. */
function describeFilterCount(filter: SubagentFilter, count: number): string {
  switch (filter) {
    case "needs-you": return i18n.t("session:subagentsSection.countNeedsYou", { count });
    case "failed": return i18n.t("agentRuns:subagentSummary.folded.failed", { count });
    case "running": return i18n.t("session:subagentsSection.countRunning", { value: count });
    case "done": return i18n.t("agentRuns:subagentSummary.folded.done", { count });
    case "stopped": return i18n.t("agentRuns:subagentSummary.folded.stopped", { count });
  }
}

/** A filter's word and how many rows it holds, read as one name (`Failed 2`). */
function FilterLabel(props: { label: string; count: number }) {
  return (
    <>
      {props.label}
      {" "}
      <span className={sx(styles.filterCount)}>{formatNumber(props.count)}</span>
    </>
  );
}

/**
 * `Retry failed (N)` opens one set of instructions for every failed delegated
 * task, then starts their retries one after another through the same path a
 * row's own Retry takes; refusals land on the rows they belong to.
 */
function SubagentsTrayActions(props: {
  retryable: readonly SubagentListItem[];
  first?: SubagentListItem;
  onRetried: (notice: { started: number; refused: number }) => void;
  onRetryOpen: () => void;
}) {
  useTranslation();
  const [composing, setComposing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const composerId = useId();
  const count = props.retryable.length;
  const submit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || running || count === 0) return;
    const targets = [...props.retryable];
    setRunning(true);
    let started = 0;
    try {
      for (const item of targets) {
        if ((await item.onRetry?.(trimmed)) !== false) started += 1;
      }
    } finally {
      setRunning(false);
      setComposing(false);
      setPrompt("");
      props.onRetried({ started, refused: targets.length - started });
    }
  };
  return (
    <>
      <div className={sx(styles.trayActions)}>
        {count > 0 ? (
          <ActionButton
            size="md"
            weight="secondary"
            xstyle={styles.target}
            aria-expanded={composing}
            aria-controls={composing ? composerId : undefined}
            disabled={running}
            data-testid="subagents-retry-failed"
            onClick={() => {
              setComposing((open) => !open);
              props.onRetryOpen();
            }}
          >
            <RotateCcw aria-hidden />
            {i18n.t("session:subagentsSection.retryFailed", { count })}
          </ActionButton>
        ) : null}
        {props.first ? <OpenFirstNeedsYou item={props.first} /> : null}
      </div>
      {composing && count > 0 ? (
        <form
          id={composerId}
          className={sx(styles.composer)}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Textarea
            autoFocus
            size="sm"
            label={i18n.t("session:subagentsSection.retryFailedLabel")}
            description={i18n.t("session:subagentsSection.retryFailedHint")}
            placeholder={i18n.t("session:subagentsSection.retryFailedPlaceholder")}
            value={prompt}
            disabled={running}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <div className={sx(styles.composerActions)}>
            <ActionButton type="submit" size="md" weight="primary" xstyle={styles.target} disabled={running || !prompt.trim()}>
              {i18n.t("session:subagentsSection.retryFailedSubmit", { count })}
            </ActionButton>
            <ActionButton
              type="button"
              size="md"
              weight="quiet"
              xstyle={styles.target}
              onClick={() => {
                setComposing(false);
                setPrompt("");
              }}
            >
              {i18n.t("session:subagentsSection.retryFailedCancel")}
            </ActionButton>
          </div>
        </form>
      ) : null}
    </>
  );
}

/** One click to the child that waits on the user, named and marked by why. */
function OpenFirstNeedsYou(props: { item: SubagentListItem }) {
  useTranslation();
  const { item } = props;
  const state = subagentWorkState(item.exchange);
  const reason = item.exchange.outcome.progress?.at(-1) ?? item.exchange.outcome.error ?? WORK_STATE[state].label;
  return (
    <ActionButton
      size="md"
      weight="secondary"
      xstyle={[styles.target, styles.summaryOpen]}
      title={i18n.t("session:subagentsSection.openFirstNeedsYouTitle", { name: item.who, reason })}
      onClick={item.onOpen}
    >
      <StateMark state={state} size="xs" />
      <span className={sx(styles.summaryOpenLabel)}>
        {i18n.t("session:subagentsSection.openFirstNeedsYou", { name: item.who })}
      </span>
    </ActionButton>
  );
}

function SubagentRow(props: { item: SubagentListItem; nowMs?: number }) {
  useTranslation();
  const { item } = props;
  const { exchange } = item;
  const { error, result } = exchange.outcome;
  const live = isDelegationExchangeLive(exchange);
  // Stand-in timestamps (a turn rebuilt from saved messages) give no end time
  // and no ticking clock; the row shows only a duration the provider measured.
  const observed = exchange.timing.observed !== false;
  const endedAt = live || !observed ? undefined : exchange.timing.endedAt;
  // Row-local clock: a live row's elapsed time ticks each second, a settled
  // row only refreshes its "ago"; nothing else in the list re-renders.
  const clock = useNow(
    props.nowMs === undefined && observed && (live || endedAt !== undefined),
    live ? 1_000 : 30_000,
  );
  const now = props.nowMs ?? clock;
  const elapsedMs = resolveExchangeElapsedMs(exchange, now);
  const needsUser = subagentNeedsUser(exchange);
  const workState = subagentWorkState(exchange);
  const status = describeExchangeStatus(exchange.outcome.status);
  // The answer renders like the conversation, and only once it is opened, so
  // a long list never parses every answer it folds away.
  const [answerOpen, setAnswerOpen] = useState(false);
  return (
    <li
      className={sx(styles.row)}
      data-subagent-kind={exchange.kind}
      data-subagent-state={workState}
      data-needs-user={needsUser ? "true" : undefined}
    >
      <div className={sx(styles.head)}>
        <span className={sx(styles.who)}>{item.who}</span>
        <span className={sx(styles.status)} data-exchange-status={exchange.outcome.status}>
          <StateMark state={workState} size="xs" showLabel label={status.label} motion={live ? "moving" : "still"} />
          {elapsedMs === null ? null : (
            <span className={sx(styles.elapsed)}>{` · ${formatDuration(elapsedMs)}`}</span>
          )}
        </span>
        {endedAt !== undefined ? (
          <span className={sx(styles.when)}>
            <RelativeTime date={endedAt} now={new Date(now)} past />
          </span>
        ) : null}
      </div>
      {item.what !== item.who ? <p className={sx(styles.what)}>{item.what}</p> : null}
      {exchange.outcome.progress?.at(-1) ? <p className={sx(styles.what)}>{exchange.outcome.progress.at(-1)}</p> : null}
      {subagentResultLine(exchange) ? <p className={sx(styles.what)} title={error ?? result}>{subagentResultLine(exchange)}</p> : null}
      {(error ?? result) && !live ? (
        <details
          className={sx(styles.answer)}
          onToggle={(event) => setAnswerOpen(event.currentTarget.open)}
        >
          <summary className={sx(styles.answerSummary)}>
            {error ? i18n.t("session:subagentsSection.subagentRow") : i18n.t("session:subagentsSection.subagentRow2")}
          </summary>
          {error ? (
            <p className={sx(styles.answerText)}>{error}</p>
          ) : answerOpen && result ? (
            <div className={sx(styles.answerBody)}>
              <CollapsibleResponse text={result} label={i18n.t("session:remaining.presentationCopy283", { v1: item.who })} />
            </div>
          ) : null}
        </details>
      ) : null}
      {item.error ? <p role="alert" className={sx(styles.error)}>{item.error}</p> : null}
      {item.onOpen || item.canStop || item.onView ? (
        <div className={sx(styles.actions)}>
          {item.onView ? (
            <ActionButton size="md" weight="quiet" xstyle={styles.target} onClick={item.onView}>
              {i18n.t("session:subagentsSection.subagentRow3")}</ActionButton>
          ) : null}
          {item.onOpen ? (
            <ActionButton size="md" weight="quiet" xstyle={styles.target} onClick={item.onOpen}>
              {i18n.t("session:subagentsSection.subagentRow4")}</ActionButton>
          ) : null}
          {item.canStop && item.onStop ? (
            <ActionButton size="md" weight="quiet" tone="danger" xstyle={styles.target} disabled={item.busy} onClick={item.onStop}>
              {i18n.t("session:subagentsSection.subagentRow5")}</ActionButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const styles = stylex.create({
  tray: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBlockEnd: vars["--ads-space-8"],
    minWidth: 0,
  },
  summaryText: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    minWidth: 0,
  },
  filterCount: {
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
  trayActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
    minWidth: 0,
  },
  composer: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  composerActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  summaryOpen: { gap: vars["--ads-space-4"], maxWidth: "100%" },
  summaryOpenLabel: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    paddingBlock: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  who: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  status: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
    whiteSpace: "nowrap",
  },
  elapsed: {
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "pre",
  },
  when: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    whiteSpace: "nowrap",
  },
  what: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
  answer: { minWidth: 0 },
  answerSummary: {
    cursor: "pointer",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  answerBody: { minWidth: 0, marginBlockStart: vars["--ads-space-4"] },
  answerText: {
    margin: 0,
    marginBlockStart: vars["--ads-space-4"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
  error: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-danger-text"],
  },
  // Three controls do not fit a narrow rail on one line; they wrap instead of
  // cutting their labels.
  actions: { display: "flex", flexWrap: "wrap", columnGap: vars["--ads-space-8"] },
  // Row controls are used often from a narrow rail: keep a 40px target.
  target: { minBlockSize: 40 },
});

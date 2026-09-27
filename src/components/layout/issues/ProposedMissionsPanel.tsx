import * as stylex from "@stylexjs/stylex";
import { CalendarClock, CircleDot, ExternalLink, GitPullRequest, Inbox, Play, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { formatAge } from "@/lib/missions/mission-view";
import { PROPOSED_SOURCE_LABELS, type ProposedMission, type ProposedMissionSource } from "@/lib/missions/proposed";

const SOURCE_ICONS: Record<ProposedMissionSource, LucideIcon> = {
  issue: CircleDot,
  "pull-request": GitPullRequest,
  schedule: CalendarClock,
  triage: Inbox,
};

/** Where Start takes a proposal, as the row shows it. */
export interface ProposalStartTarget {
  label: string;
  /** "in web-app": where it runs, when that is known. */
  where: string | null;
  /** Set when it cannot start from here, e.g. no workspace is open. */
  disabledReason: string | null;
}

export interface ProposedMissionsPanelProps {
  pending: readonly ProposedMission[];
  recent: readonly ProposedMission[];
  loaded: boolean;
  now: Date;
  /** What the playbooks watch ("2 playbooks — assigned issues, a schedule"), or null when nothing is. */
  watching?: string | null;
  startTarget: (proposal: ProposedMission) => ProposalStartTarget;
  onStart: (proposal: ProposedMission) => void;
  onDismiss: (proposal: ProposedMission) => void;
  onOpenLink: (url: string) => void;
  onOpenMission: (proposal: ProposedMission) => void;
  onOpenPlaybooks: () => void;
}

const age = (now: Date, at: string) => formatAge(now.getTime() - Date.parse(at));

/** "Checks failed on PR #612 · Fix CI · in web-app · 2h", with quiet separators. */
function MetaLine(props: { parts: ReadonlyArray<string | null>; emphasis?: number }) {
  const parts = props.parts.filter((part): part is string => Boolean(part));
  return (
    <p className={sx(styles.meta)}>
      {parts.map((part, index) => (
        <span key={index} className={sx(styles.metaPart)}>
          {index > 0 ? (
            <span aria-hidden className={sx(styles.separator)}>
              ·
            </span>
          ) : null}
          <span className={sx(index === props.emphasis && styles.playbook)}>{part}</span>
        </span>
      ))}
    </p>
  );
}

function SourceMark(props: { source: ProposedMissionSource; quiet?: boolean }) {
  const Icon = SOURCE_ICONS[props.source];
  return (
    <span className={sx(styles.mark, props.quiet && styles.markQuiet)} title={PROPOSED_SOURCE_LABELS[props.source]}>
      <Icon aria-hidden className={sx(styles.markIcon)} />
    </span>
  );
}

function PendingRow(
  props: Omit<ProposedMissionsPanelProps, "pending" | "recent" | "loaded" | "watching" | "onOpenPlaybooks" | "onOpenMission"> & {
    proposal: ProposedMission;
  },
) {
  const { proposal } = props;
  const target = props.startTarget(proposal);
  return (
    <li className={sx(styles.row, transition.colors)}>
      <SourceMark source={proposal.source} />
      <div className={sx(styles.body)}>
        <p className={sx(styles.title)} title={proposal.title}>
          {proposal.title}
        </p>
        <MetaLine
          emphasis={1}
          parts={[
            proposal.detail ?? PROPOSED_SOURCE_LABELS[proposal.source],
            proposal.playbookName,
            target.where,
            age(props.now, proposal.createdAt),
          ]}
        />
      </div>
      <div className={sx(styles.actions)}>
        {proposal.url ? (
          <Button
            type="button"
            size="sm"
            variant="quiet"
            iconOnly
            aria-label="Open the source"
            title="Open the source"
            onClick={() => props.onOpenLink(proposal.url!)}
          >
            <ExternalLink aria-hidden />
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="quiet" onClick={() => props.onDismiss(proposal)}>
          Dismiss
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={target.disabledReason !== null}
          title={target.disabledReason ?? undefined}
          xstyle={styles.primaryAction}
          onClick={() => props.onStart(proposal)}
        >
          <Play aria-hidden />
          {target.label}
        </Button>
      </div>
    </li>
  );
}

function RecentRow(props: { proposal: ProposedMission; now: Date; onOpenMission: (proposal: ProposedMission) => void }) {
  const { proposal } = props;
  const started = proposal.state === "started";
  return (
    <li className={sx(styles.row, styles.recentRow, transition.colors)}>
      <SourceMark source={proposal.source} quiet />
      <div className={sx(styles.body)}>
        <p className={sx(styles.title, styles.recentTitle)} title={proposal.title}>
          {proposal.title}
        </p>
        <MetaLine emphasis={0} parts={[proposal.playbookName, PROPOSED_SOURCE_LABELS[proposal.source], age(props.now, proposal.updatedAt)]} />
      </div>
      <div className={sx(styles.actions)}>
        <Badge size="sm" variant="soft" tone={started ? "success" : "neutral"}>
          {started ? "Started" : "Dismissed"}
        </Badge>
        {started && proposal.missionId ? (
          <Button type="button" size="sm" variant="quiet" onClick={() => props.onOpenMission(proposal)}>
            Open
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Issues → Proposed: missions a playbook's start condition or a triage
 * mission proposed. Each waits for Start or Dismiss; below them, the ones
 * decided recently, including any a playbook started on its own.
 */
export function ProposedMissionsPanel(props: ProposedMissionsPanelProps) {
  return (
    <div className={sx(styles.scroll)} data-testid="proposed-missions">
      <div className={sx(styles.page)}>
        <header className={sx(styles.intro)}>
          <p className={sx(styles.lead)}>
            Missions your playbooks proposed — for an assigned issue, a pull request in trouble, a schedule, or a request
            a triage mission found. Nothing runs until you start it, unless a playbook starts on its own.
          </p>
          <Button type="button" size="sm" variant="quiet" xstyle={styles.introAction} onClick={props.onOpenPlaybooks}>
            Start conditions
          </Button>
        </header>

        {!props.loaded ? (
          <p className={sx(styles.note)}>Reading proposals…</p>
        ) : props.pending.length === 0 ? (
          <div className={sx(styles.empty)}>
            <Sparkles aria-hidden className={sx(styles.emptyIcon)} />
            <p className={sx(styles.emptyTitle)}>Nothing proposed right now</p>
            {props.watching ? (
              <p className={sx(styles.emptyText)}>
                Watching: {props.watching}. What they propose waits here.
              </p>
            ) : (
              <p className={sx(styles.emptyText)}>
                Give a playbook a start condition under <strong>Starts when</strong>, and the missions it proposes wait here.
              </p>
            )}
            <Button type="button" size="sm" variant="secondary" onClick={props.onOpenPlaybooks}>
              Open playbooks
            </Button>
          </div>
        ) : (
          <section aria-label="Waiting for you">
            <h3 className={sx(styles.sectionTitle)}>
              Waiting for you <span className={sx(styles.sectionCount)}>{props.pending.length}</span>
            </h3>
            <ul className={sx(styles.list)}>
              {props.pending.map((proposal) => (
                <PendingRow
                  key={proposal.id}
                  proposal={proposal}
                  now={props.now}
                  startTarget={props.startTarget}
                  onStart={props.onStart}
                  onDismiss={props.onDismiss}
                  onOpenLink={props.onOpenLink}
                />
              ))}
            </ul>
          </section>
        )}

        {props.recent.length > 0 ? (
          <section aria-label="Decided recently">
            <h3 className={sx(styles.sectionTitle)}>Decided recently</h3>
            <ul className={sx(styles.list)}>
              {props.recent.map((proposal) => (
                <RecentRow key={proposal.id} proposal={proposal} now={props.now} onOpenMission={props.onOpenMission} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

const styles = stylex.create({
  scroll: { height: "100%", overflowY: "auto" },
  page: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
    maxWidth: "56rem",
    marginInline: "auto",
    paddingBlock: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-20"],
  },
  intro: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-16"], justifyContent: "space-between" },
  introAction: { flexShrink: 0 },
  lead: {
    margin: 0,
    maxWidth: "44rem",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    color: vars["--ads-color-text-muted"],
  },
  sectionTitle: {
    display: "flex",
    alignItems: "baseline",
    gap: vars["--ads-space-8"],
    margin: 0,
    marginBottom: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-subtle"],
  },
  sectionCount: { fontVariantNumeric: "tabular-nums", color: vars["--ads-color-text-muted"] },
  list: {
    display: "flex",
    flexDirection: "column",
    margin: 0,
    padding: 0,
    listStyle: "none",
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
    overflow: "hidden",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: vars["--ads-space-12"],
    minHeight: 60,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    borderTopWidth: { default: vars["--ads-border-width-hairline"], ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-surface-tint"] },
  },
  recentRow: { minHeight: 48 },
  mark: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: vars["--ads-color-surface-tint"],
    color: vars["--ads-color-text-muted"],
  },
  // Same box as the pending mark, so titles line up across both lists.
  markQuiet: { backgroundColor: "transparent", color: vars["--ads-color-text-subtle"] },
  markIcon: { width: 16, height: 16 },
  body: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  title: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  recentTitle: { fontWeight: vars["--ads-font-weight-regular"], color: vars["--ads-color-text-muted"] },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    margin: 0,
    minWidth: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-subtle"],
  },
  metaPart: { display: "inline-flex", alignItems: "center", minWidth: 0 },
  separator: { paddingInline: vars["--ads-space-4"], color: vars["--ads-color-text-subtle"] },
  playbook: { color: vars["--ads-color-text-muted"], fontWeight: vars["--ads-font-weight-medium"] },
  actions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: vars["--ads-space-4"] },
  // One width for Start and Kick off, so Dismiss lines up down the list.
  primaryAction: { minWidth: "6.5rem", justifyContent: "center" },
  note: { margin: 0, fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-subtle"] },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-32"],
    paddingInline: vars["--ads-space-24"],
    textAlign: "center",
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--ads-color-border"],
  },
  emptyIcon: { width: 20, height: 20, color: vars["--ads-color-text-subtle"] },
  emptyTitle: { margin: 0, fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  emptyText: {
    margin: 0,
    marginBottom: vars["--ads-space-4"],
    maxWidth: "30rem",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    color: vars["--ads-color-text-muted"],
  },
});

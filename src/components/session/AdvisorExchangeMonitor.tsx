import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  History,
  SkipForward,
  TriangleAlert,
} from "lucide-react";
import {
  buildAdvisorChecks,
  describeAdvisorExchangeBadge,
  describeAdvisorExchangeStatus,
  describeAdvisorEffort,
  describeAdvisorIsolation,
  describeAdvisorParticipant,
  describeAdvisorPhase,
  formatAdvisorDuration,
  resolveAdvisorExchangeTone,
  resolveAdvisorExchangeVisibility,
  resolveAdvisorLaneSegments,
  resolveAdvisorRemainingMs,
} from "@/components/session/advisor-exchange.utils";
import { AdvisorCheckIcon } from "@/components/session/AdvisorCheckIcon";
import { SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME } from "@/components/session/plan-viewer.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import {
  advisorConsultLogEntryKey,
  selectAdvisorConsultLog,
} from "@/lib/providers/advisor-consult-log";
import { getProviderWaveTone } from "@/lib/providers/model-catalog";
import { cx, sx } from "@/components/ads/utils/stylex";
import {
  advisorExchangeMonitorStyles as styles,
  advisorExchangeProviderBar,
  advisorExchangeTone,
  advisorExchangeToneBadge,
  advisorExchangeWaveTone,
} from "./advisor-exchange-monitor.styles";
import type { ProviderId } from "@/lib/providers/provider.types";
import { UI_ELEVATION_CLASS } from "@/lib/ui-layers";
import { useAppStore } from "@/store/app.store";

/**
 * The card only animates a clock while something is actually moving, so an
 * idle session pays nothing for this surface being mounted.
 */
const ADVISOR_TICK_MS = 200;

function useAdvisorClock(active: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNowMs(Date.now());
    const handle = setInterval(() => {
      setNowMs(Date.now());
    }, ADVISOR_TICK_MS);
    return () => {
      clearInterval(handle);
    };
  }, [active]);
  return nowMs;
}

function providerBarStyle(providerId: ProviderId | undefined) {
  if (providerId === "claude-code") {
    return advisorExchangeProviderBar.claude;
  }
  if (providerId === "codex") {
    return advisorExchangeProviderBar.codex;
  }
  return advisorExchangeProviderBar.fallback;
}

function ParticipantChip(props: {
  role: string;
  providerId?: ProviderId;
  model?: string;
  active: boolean;
}) {
  return (
    <div className={sx(styles.chip)}>
      <span className={sx(styles.chipRole)}>{props.role}</span>
      <span
        className={sx(
          styles.chipName,
          props.providerId
            ? advisorExchangeWaveTone[
                getProviderWaveTone({ providerId: props.providerId })
              ]
            : styles.chipNameMuted,
          props.active && styles.chipNameActive,
        )}
        title={describeAdvisorParticipant({
          providerId: props.providerId,
          model: props.model,
        })}
      >
        {describeAdvisorParticipant({
          providerId: props.providerId,
          model: props.model,
        })}
      </span>
    </div>
  );
}

/** Exported so the Lens harness can render the real card from real snapshots. */
export function AdvisorExchangeCard(props: {
  snapshot: AdvisorExchangeSnapshot;
  nowMs: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSkip: () => void;
  onDismiss: () => void;
  canSkip: boolean;
  /**
   * Opens the session consult log. The card shows one consult and clears on a
   * linger timer, so this is the only way back to the ones it replaced.
   */
  onOpenLog?: () => void;
  consultLogCount?: number;
}) {
  const { snapshot } = props;
  const tone = resolveAdvisorExchangeTone(snapshot);
  const lanes = resolveAdvisorLaneSegments({ snapshot, nowMs: props.nowMs });
  const remainingMs = resolveAdvisorRemainingMs({
    snapshot,
    nowMs: props.nowMs,
  });
  const checks = useMemo(() => buildAdvisorChecks(snapshot), [snapshot]);
  const failedChecks = checks.filter((check) => check.status === "fail").length;
  const running = snapshot.outcome === "pending";
  // While the consult runs the baton sits on the advisor's side of the track;
  // it returns to the primary the moment the advice comes back.
  const batonAtAdvisor = running;

  return (
    <div
      data-testid="advisor-exchange-card"
      data-outcome={snapshot.outcome}
      className={cx(UI_ELEVATION_CLASS.floating, sx(styles.card))}
    >
      <div className={sx(styles.header)}>
        {running ? (
          <Loader
            aria-hidden
            className={sx(styles.headerLoader, advisorExchangeTone[tone])}
            size="xs"
            variant="handoff"
          />
        ) : (
          <ArrowLeftRight
            className={sx(styles.headerIcon, advisorExchangeTone[tone])}
          />
        )}
        <span className={sx(styles.headerTitle)}>
          {snapshot.consultIndex !== undefined &&
          snapshot.consultLimit !== undefined
            ? `Advisor consult ${snapshot.consultIndex}/${snapshot.consultLimit}`
            : "Advisor exchange"}
        </span>
        {failedChecks > 0 && !running ? (
          <TriangleAlert
            className={sx(styles.headerWarn)}
            aria-label={`${failedChecks} checks failed`}
          />
        ) : null}
        <span
          data-testid="advisor-exchange-outcome"
          className={sx(styles.outcomeBadge, advisorExchangeToneBadge[tone])}
        >
          {describeAdvisorExchangeBadge(snapshot)}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-expanded={props.expanded}
          aria-label={
            props.expanded
              ? "Collapse advisor exchange"
              : "Expand advisor exchange"
          }
          onClick={props.onToggleExpanded}
        >
          {props.expanded ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      <div className={sx(styles.participantRow)}>
        <ParticipantChip
          role="Primary"
          providerId={snapshot.primaryProviderId}
          model={snapshot.primaryModel}
          active={!batonAtAdvisor && running}
        />
        <div className={sx(styles.batonTrack)}>
          <div className={sx(styles.batonRail)} />
          <span
            data-testid="advisor-exchange-baton"
            className={sx(
              styles.baton,
              providerBarStyle(
                batonAtAdvisor
                  ? snapshot.advisorProviderId
                  : snapshot.primaryProviderId,
              ),
            )}
            style={{ left: batonAtAdvisor ? "calc(100% - 0.375rem)" : "0" }}
          />
        </div>
        <ParticipantChip
          role="Advisor"
          providerId={snapshot.advisorProviderId}
          model={snapshot.advisorModel}
          active={batonAtAdvisor}
        />
      </div>

      {/* Latency split. The blocked span is the advisor's real cost to the turn. */}
      <div className={sx(styles.laneTrack)}>
        <div
          data-testid="advisor-exchange-advisor-lane"
          className={sx(
            styles.lane,
            providerBarStyle(snapshot.advisorProviderId),
          )}
          style={{ width: `${lanes.advisorFraction * 100}%` }}
        />
        <div
          className={sx(styles.laneBlocked)}
          style={{
            width: `${Math.max(0, lanes.blockedFraction - lanes.advisorFraction) * 100}%`,
          }}
        />
      </div>

      <div className={sx(styles.statusRow)}>
        <p className={sx(styles.statusText)}>
          {describeAdvisorExchangeStatus(snapshot)}
        </p>
        <span className={sx(styles.statusElapsed)}>
          {formatAdvisorDuration(lanes.elapsedMs)}
        </span>
      </div>

      {props.canSkip ? (
        <div className={sx(styles.skipRow)}>
          <span className={sx(styles.skipText)}>
            {remainingMs === null
              ? "The primary is waiting on this consult."
              : `Deadline in ${formatAdvisorDuration(remainingMs)}.`}
          </span>
          <Button
            variant="ghost"
            size="xs"
            xstyle={styles.skipButton}
            onClick={props.onSkip}
          >
            <SkipForward />
            Cancel consult
          </Button>
        </div>
      ) : null}

      {props.expanded ? (
        <div className={sx(styles.expanded)}>
          <p className={sx(styles.sectionLabel)}>
            Did the advisor system work?
          </p>
          <ul className={sx(styles.checkList)}>
            {checks.map((check) => (
              <li key={check.id} className={sx(styles.checkItem)}>
                <AdvisorCheckIcon status={check.status} />
                <div className={sx(styles.checkBody)}>
                  <p
                    className={sx(
                      styles.checkLabel,
                      check.status === "fail" && styles.checkLabelFail,
                    )}
                  >
                    {check.label}
                  </p>
                  <p className={sx(styles.checkDetail)}>{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          {snapshot.question ? (
            <>
              <p className={sx(styles.sectionLabelSpaced)}>Question asked</p>
              <p className={sx(styles.prose)}>{snapshot.question}</p>
            </>
          ) : null}

          {snapshot.advice ? (
            <>
              <p className={sx(styles.sectionLabelSpaced)}>Advice returned</p>
              <p className={sx(styles.prose)}>{snapshot.advice}</p>
            </>
          ) : null}

          <p className={sx(styles.sectionLabelSpaced)}>Lifecycle</p>
          <ol className={sx(styles.lifecycleList)}>
            {snapshot.stages.map((stage, index) => (
              <li
                key={`${stage.phase}:${stage.at}:${index}`}
                className={sx(styles.lifecycleItem)}
              >
                <span className={sx(styles.lifecycleAt)}>
                  +{formatAdvisorDuration(stage.at - snapshot.startedAt)}
                </span>
                <span className={sx(styles.lifecycleLabel)}>
                  {describeAdvisorPhase(stage.phase)}
                  {stage.detail ? ` — ${stage.detail}` : ""}
                </span>
              </li>
            ))}
          </ol>

          <dl className={sx(styles.metaGrid)}>
            <div className={sx(styles.metaCell)}>
              <dt className={sx(styles.metaTerm)}>Isolation</dt>
              <dd className={sx(styles.metaValue)}>
                {describeAdvisorIsolation(snapshot.isolation)}
              </dd>
            </div>
            <div className={sx(styles.metaCell)}>
              <dt className={sx(styles.metaTerm)}>Effort</dt>
              <dd
                className={sx(styles.metaValue)}
                data-testid="advisor-exchange-effort"
              >
                {describeAdvisorEffort(snapshot.advisorEffort)}
              </dd>
            </div>
            <div className={sx(styles.metaCell)}>
              <dt className={sx(styles.metaTerm)}>Deadline</dt>
              <dd className={sx(styles.metaValue)}>
                {snapshot.timeoutMs === undefined
                  ? "Not reported"
                  : formatAdvisorDuration(snapshot.timeoutMs)}
              </dd>
            </div>
          </dl>

          {!props.canSkip && snapshot.outcome !== "pending" ? (
            <div className={sx(styles.footerRow)}>
              {props.onOpenLog && (props.consultLogCount ?? 0) > 0 ? (
                <Button
                  variant="ghost"
                  size="xs"
                  xstyle={styles.logButton}
                  data-testid="advisor-open-consult-log"
                  onClick={props.onOpenLog}
                >
                  <History />
                  View all consults ({props.consultLogCount})
                </Button>
              ) : null}
              <Button variant="ghost" size="xs" onClick={props.onDismiss}>
                Dismiss
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const AdvisorExchangeCardMemo = memo(AdvisorExchangeCard);

export function AdvisorExchangeMonitor() {
  const taskId = useScopedTaskId();
  const snapshot = useAppStore(
    (state) => state.advisorExchangeByTask[taskId] ?? null,
  );
  const skipTaskAdvisor = useAppStore((state) => state.skipTaskAdvisor);
  const dismissAdvisorExchange = useAppStore(
    (state) => state.dismissAdvisorExchange,
  );
  const openAdvisorConsultLog = useAppStore(
    (state) => state.openAdvisorConsultLog,
  );
  // A primitive, not the entry array: the card re-renders on a 200ms clock and
  // must not also re-render whenever an unrelated consult is archived.
  const consultLogCount = useAppStore(
    (state) =>
      selectAdvisorConsultLog(state.advisorConsultLogByTask, taskId).length,
  );

  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const turnRef = useRef<string | null>(null);
  // Expanding is a per-exchange choice: carrying it into the next turn would
  // reopen a large card over the transcript without the user asking.
  if (snapshot && turnRef.current !== snapshot.turnId) {
    turnRef.current = snapshot.turnId;
    if (expanded) {
      setExpanded(false);
    }
    if (hovered) {
      setHovered(false);
    }
  }

  const pinned = expanded || hovered;
  const clockActive = Boolean(
    snapshot && (snapshot.outcome === "pending" || !pinned),
  );
  const nowMs = useAdvisorClock(clockActive);

  const visible = resolveAdvisorExchangeVisibility({
    snapshot,
    nowMs,
    pinned,
  });
  if (!snapshot || !visible) {
    return null;
  }

  const canSkip = snapshot.outcome === "pending";

  return (
    <div
      className={cx(
        SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
        // Clear the conversation turn rail, which owns `right-2` at `w-12`.
        sx(styles.wrapper),
      )}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      <AdvisorExchangeCardMemo
        snapshot={snapshot}
        nowMs={nowMs}
        expanded={expanded}
        canSkip={canSkip}
        onToggleExpanded={() => {
          setExpanded((value) => !value);
        }}
        onSkip={() => {
          skipTaskAdvisor({ taskId });
        }}
        onDismiss={() => {
          dismissAdvisorExchange({ taskId });
        }}
        consultLogCount={consultLogCount}
        onOpenLog={() => {
          // Opens focused on the consult the card is showing, so "view all"
          // never loses the one the user was already reading.
          openAdvisorConsultLog({
            taskId,
            entryKey: advisorConsultLogEntryKey(snapshot),
          });
        }}
      />
    </div>
  );
}

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  History,
  LoaderCircle,
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
  type AdvisorExchangeTone,
} from "@/components/session/advisor-exchange.utils";
import { AdvisorCheckIcon } from "@/components/session/AdvisorCheckIcon";
import { SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME } from "@/components/session/plan-viewer.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { Button } from "@/components/ui/button";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import {
  advisorConsultLogEntryKey,
  selectAdvisorConsultLog,
} from "@/lib/providers/advisor-consult-log";
import { getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { UI_ELEVATION_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";
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

const TONE_ACCENT_CLASS: Record<AdvisorExchangeTone, string> = {
  neutral: "text-muted-foreground",
  active: "text-info",
  positive: "text-success",
  caution: "text-warning",
  danger: "text-destructive",
};

const TONE_BADGE_CLASS: Record<AdvisorExchangeTone, string> = {
  neutral: "border-border/60 bg-muted/40 text-muted-foreground",
  active: "border-info/40 bg-info/10 text-info",
  positive: "border-success/40 bg-success/10 text-success",
  caution: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
};

function providerBarClass(providerId: ProviderId | undefined) {
  if (providerId === "claude-code") {
    return "bg-provider-claude";
  }
  if (providerId === "codex") {
    return "bg-provider-codex";
  }
  return "bg-muted-foreground";
}

function ParticipantChip(props: {
  role: string;
  providerId?: ProviderId;
  model?: string;
  active: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {props.role}
      </span>
      <span
        className={cn(
          "truncate text-[0.8125rem] font-medium",
          props.providerId
            ? getProviderWaveToneClass({ providerId: props.providerId })
            : "text-muted-foreground",
          props.active && "motion-safe:animate-pulse",
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
      className={cn(
        UI_ELEVATION_CLASS.floating,
        "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2",
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        {running ? (
          <LoaderCircle
            className={cn(
              "size-3.5 shrink-0 motion-safe:animate-spin",
              TONE_ACCENT_CLASS[tone],
            )}
          />
        ) : (
          <ArrowLeftRight
            className={cn("size-3.5 shrink-0", TONE_ACCENT_CLASS[tone])}
          />
        )}
        <span className="flex-1 truncate text-[0.8125rem] font-medium">
          {snapshot.consultIndex !== undefined &&
          snapshot.consultLimit !== undefined
            ? `Advisor consult ${snapshot.consultIndex}/${snapshot.consultLimit}`
            : "Advisor exchange"}
        </span>
        {failedChecks > 0 && !running ? (
          <TriangleAlert
            className="size-3.5 shrink-0 text-destructive"
            aria-label={`${failedChecks} checks failed`}
          />
        ) : null}
        <span
          data-testid="advisor-exchange-outcome"
          className={cn(
            "shrink-0 rounded border px-1 text-[10px] leading-4 font-medium tracking-wide",
            TONE_BADGE_CLASS[tone],
          )}
        >
          {describeAdvisorExchangeBadge(snapshot)}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-expanded={props.expanded}
          aria-label={props.expanded ? "Collapse advisor exchange" : "Expand advisor exchange"}
          onClick={props.onToggleExpanded}
        >
          {props.expanded ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </Button>
      </div>

      <div className="flex shrink-0 items-end gap-2 px-3 pt-2.5">
        <ParticipantChip
          role="Primary"
          providerId={snapshot.primaryProviderId}
          model={snapshot.primaryModel}
          active={!batonAtAdvisor && running}
        />
        <div className="relative mb-1 h-3 w-12 shrink-0">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
          <span
            data-testid="advisor-exchange-baton"
            className={cn(
              "absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full",
              providerBarClass(
                batonAtAdvisor
                  ? snapshot.advisorProviderId
                  : snapshot.primaryProviderId,
              ),
              "motion-safe:transition-[left] motion-safe:duration-700 motion-safe:ease-out",
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
      <div className="mt-2.5 flex h-1 w-full shrink-0 overflow-hidden bg-border/40">
        <div
          data-testid="advisor-exchange-advisor-lane"
          className={cn(
            "h-full",
            providerBarClass(snapshot.advisorProviderId),
            "transition-[width] duration-200 ease-out motion-reduce:transition-none",
          )}
          style={{ width: `${lanes.advisorFraction * 100}%` }}
        />
        <div
          className="h-full bg-muted-foreground/30 transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{
            width: `${Math.max(0, lanes.blockedFraction - lanes.advisorFraction) * 100}%`,
          }}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <p className="min-w-0 flex-1 text-[0.75rem] leading-[1.5] text-muted-foreground">
          {describeAdvisorExchangeStatus(snapshot)}
        </p>
        <span className="shrink-0 text-[0.75rem] tabular-nums text-muted-foreground">
          {formatAdvisorDuration(lanes.elapsedMs)}
        </span>
      </div>

      {props.canSkip ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
            {remainingMs === null
              ? "The primary is waiting on this consult."
              : `Deadline in ${formatAdvisorDuration(remainingMs)}.`}
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0 gap-1"
            onClick={props.onSkip}
          >
            <SkipForward className="size-3" />
            Cancel consult
          </Button>
        </div>
      ) : null}

      {props.expanded ? (
        <div className="min-h-0 max-h-[min(24rem,45vh)] overflow-y-auto overscroll-contain border-t border-border/60 bg-muted/10 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Did the advisor system work?
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2">
                <AdvisorCheckIcon status={check.status} />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[0.75rem] leading-[1.45]",
                      check.status === "fail"
                        ? "font-medium text-destructive"
                        : "text-foreground",
                    )}
                  >
                    {check.label}
                  </p>
                  <p className="break-words text-[0.6875rem] leading-[1.45] text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {snapshot.question ? (
            <>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Question asked
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/55 px-2 py-1.5 text-[0.75rem] leading-[1.5] text-foreground">
                {snapshot.question}
              </p>
            </>
          ) : null}

          {snapshot.advice ? (
            <>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Advice returned
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/55 px-2 py-1.5 text-[0.75rem] leading-[1.5] text-foreground">
                {snapshot.advice}
              </p>
            </>
          ) : null}

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Lifecycle
          </p>
          <ol className="mt-1 space-y-0.5">
            {snapshot.stages.map((stage, index) => (
              <li
                key={`${stage.phase}:${stage.at}:${index}`}
                className="flex items-baseline gap-2 text-[0.6875rem] leading-[1.5]"
              >
                <span className="shrink-0 tabular-nums text-muted-foreground/70">
                  +{formatAdvisorDuration(stage.at - snapshot.startedAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {describeAdvisorPhase(stage.phase)}
                  {stage.detail ? ` — ${stage.detail}` : ""}
                </span>
              </li>
            ))}
          </ol>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="min-w-0">
              <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Isolation
              </dt>
              <dd className="truncate text-[0.6875rem] text-foreground">
                {describeAdvisorIsolation(snapshot.isolation)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Effort
              </dt>
              <dd
                className="truncate text-[0.6875rem] text-foreground"
                data-testid="advisor-exchange-effort"
              >
                {describeAdvisorEffort(snapshot.advisorEffort)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Deadline
              </dt>
              <dd className="truncate text-[0.6875rem] text-foreground">
                {snapshot.timeoutMs === undefined
                  ? "Not reported"
                  : formatAdvisorDuration(snapshot.timeoutMs)}
              </dd>
            </div>
          </dl>

          {!props.canSkip && snapshot.outcome !== "pending" ? (
            <div className="mt-3 flex items-center justify-end gap-1">
              {props.onOpenLog && (props.consultLogCount ?? 0) > 0 ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="mr-auto gap-1"
                  data-testid="advisor-open-consult-log"
                  onClick={props.onOpenLog}
                >
                  <History className="size-3" />
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
    (state) => selectAdvisorConsultLog(state.advisorConsultLogByTask, taskId).length,
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
      className={cn(
        SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
        // Clear the conversation turn rail, which owns `right-2` at `w-12`.
        "top-3 right-16 w-[min(23rem,calc(100%-6rem))]",
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

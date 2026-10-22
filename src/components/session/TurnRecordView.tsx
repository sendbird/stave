import { i18n, useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { useCallback, useMemo } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Hourglass,
  RotateCw,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAsync } from "@/components/ads/utils/async";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { usageAccountLabel } from "@/components/usage/usage-view.utils";
import { readTaskTurnRecord } from "@/lib/db/turn-history.db";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { TurnRecord } from "@/lib/providers/turn-history";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { useAppStore } from "@/store/app.store";
import { TurnActivityRow, TurnRestMark } from "./TurnActivity";
import { turnActivityStyles as rowStyles } from "./turn-activity.styles";
import { turnActivityStatusIconStyles as iconStyles } from "./turn-activity-status-icon.styles";
import { describeRetainedTurnHeadline, formatTurnActivityElapsedSeconds } from "./turn-activity.utils";
import {
  buildTurnRecordSteps,
  describeTurnDigestEntry,
  resolveTurnRecordOutcome,
  shortTurnId,
  type TurnRecordEntryView,
} from "./turn-record.utils";
import { turnRecordStyles as styles } from "./turn-record.styles";

/**
 * An earlier turn in Activity, read from the app database: how it ended, the
 * request that started it, the facts only its digest kept (errors, retries,
 * stalls, model and account changes, Stave's checks) and its steps rebuilt
 * from the saved conversation. A turn that ran before digests existed says
 * "No record" rather than implying nothing went wrong.
 */
export function TurnRecordView(props: { workspaceId: string; taskId: string; turnId: string }) {
  useTranslation();
  const { workspaceId, taskId, turnId } = props;
  const { state, refresh } = useAsync(
    () => readTaskTurnRecord({ workspaceId, taskId, turnId }),
    [workspaceId, taskId, turnId],
  );
  return (
    <div className={sx(styles.root)} data-testid="turn-record">
      <AsyncBoundary
        state={state}
        onRetry={refresh}
        describeError={() => i18n.t("session:turnRecord.readFailed")}
        isEmpty={(record) => record === null}
        empty={<p className={sx(styles.notice, styles.surface)}>{i18n.t("session:turnRecord.notFound")}</p>}
      >
        {(record) => (record ? <TurnRecordBody record={record} taskId={taskId} /> : null)}
      </AsyncBoundary>
    </div>
  );
}

export function TurnRecordBody(props: { record: TurnRecord; taskId: string }) {
  useTranslation();
  const { record, taskId } = props;
  const { turn, digest } = record;
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  const onSelectTool = useCallback(
    (toolUseId: string) => focusTranscriptTool({ taskId, toolUseId }),
    [focusTranscriptTool, taskId],
  );
  const outcome = resolveTurnRecordOutcome(turn);
  const steps = useMemo(
    () => buildTurnRecordSteps({ messages: record.messages, turn }),
    // The rows carry translated titles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [record, i18n.language],
  );
  const elapsedSeconds = turn.completedAt
    ? (Date.parse(turn.completedAt) - Date.parse(turn.createdAt)) / 1000
    : null;
  const meta = [
    formatDateTime(turn.createdAt, { dateStyle: "medium", timeStyle: "short" }),
    getProviderLabel({ providerId: turn.providerId }),
  ].join(" · ");
  return (
    <section
      aria-label={i18n.t("session:turnRecord.ariaLabel", { id: shortTurnId(turn.id) })}
      data-turn-id={turn.id}
      className={sx(styles.surface)}
    >
      <div className={sx(styles.header)}>
        <span className={sx(styles.restSlot)}>
          <TurnRestMark outcome={outcome} />
        </span>
        <span className={sx(styles.badge)}>{i18n.t("session:turnRecord.badge")}</span>
        <h2 className={sx(styles.headline)}>{describeRetainedTurnHeadline(outcome)}</h2>
        {elapsedSeconds != null && Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0 ? (
          <span className={sx(styles.elapsed)} title={i18n.t("session:turnActivity.turnActivitySurface6")}>
            {formatTurnActivityElapsedSeconds(elapsedSeconds)}
          </span>
        ) : null}
      </div>
      <p className={sx(styles.meta)}>
        {meta}
        {" · "}
        <span className={sx(styles.turnId)} title={turn.id}>
          {shortTurnId(turn.id)}
        </span>
      </p>
      {record.prompt ? (
        <blockquote className={sx(styles.prompt)} aria-label={i18n.t("session:turnRecord.request")}>
          {record.prompt}
        </blockquote>
      ) : null}
      <div className={sx(styles.section)} data-testid="turn-record-digest">
        <h3 className={sx(styles.sectionHeading)}>{i18n.t("session:turnRecord.recordHeading")}</h3>
        {digest === null ? (
          <p className={sx(styles.notice)}>
            <span className={sx(styles.noticeLead)}>{i18n.t("session:turnRecord.noRecord")}</span>{" "}
            {i18n.t("session:turnRecord.noRecordDetail")}
          </p>
        ) : digest.entries.length === 0 ? (
          <p className={sx(styles.notice)}>{i18n.t("session:turnRecord.nothingRecorded")}</p>
        ) : (
          <TurnRecordEntries record={record} />
        )}
        {digest && digest.omitted > 0 ? (
          <p className={sx(styles.notice)}>{i18n.t("session:turnRecord.omitted", { count: digest.omitted })}</p>
        ) : null}
      </div>
      <div className={sx(styles.section)} data-testid="turn-record-steps">
        <h3 className={sx(styles.sectionHeading)}>
          {i18n.t("session:turnRecord.stepsHeading")}{" "}
          <span className={sx(styles.sectionNote)}>{i18n.t("session:turnRecord.stepsSource")}</span>
        </h3>
        {record.omittedMessages ? (
          <p className={sx(styles.notice)}>
            {i18n.t("session:turnRecord.earlierReplies", { count: record.omittedMessages })}
          </p>
        ) : null}
        {steps.items.length === 0 ? (
          <p className={sx(styles.notice)}>{i18n.t("session:turnRecord.noSteps")}</p>
        ) : (
          <div>
            {steps.items.map((item) => (
              <TurnActivityRow key={item.id} item={item} onSelectTool={onSelectTool} expandCopy />
            ))}
          </div>
        )}
        {steps.omitted > 0 ? (
          <p className={sx(styles.notice)}>{i18n.t("session:turnRecord.moreSteps", { count: steps.omitted })}</p>
        ) : null}
      </div>
    </section>
  );
}

function TurnRecordEntries(props: { record: TurnRecord }) {
  useTranslation();
  const { record } = props;
  const hasAccountEntry = record.digest?.entries.some((entry) => entry.kind === "account") ?? false;
  const profiles = useProviderAccounts((state) => state.profiles);
  const profilesLoaded = useProviderAccounts((state) => state.loaded);
  const entries = useMemo(
    () =>
      (record.digest?.entries ?? []).map((entry, index) =>
        describeTurnDigestEntry(entry, {
          index,
          turnStartedAt: record.turn.createdAt,
          accountLabel: (providerId, accountProfileId) =>
            profilesLoaded ? usageAccountLabel(providerId as ProviderId, accountProfileId, profiles) : accountProfileId,
        }),
      ),
    // The entries carry translated words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [record, profiles, profilesLoaded, i18n.language],
  );
  return (
    <>
      {hasAccountEntry ? <ProviderAccountsLoader /> : null}
      <ul className={sx(styles.list)}>
        {entries.map((entry) => (
          <TurnRecordEntryRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </>
  );
}

/** Account entries name accounts, so the registry is read only when one is shown. */
function ProviderAccountsLoader() {
  useLoadProviderAccounts();
  return null;
}

const ENTRY_ICONS: Record<Exclude<TurnRecordEntryView["icon"], "checks">, LucideIcon> = {
  error: CircleAlert,
  retry: RotateCw,
  stall: Hourglass,
  route: ArrowRightLeft,
  account: UserRound,
};

function entryIcon(entry: TurnRecordEntryView): LucideIcon {
  if (entry.icon !== "checks") return ENTRY_ICONS[entry.icon];
  return entry.tone === "success" ? CheckCircle2 : entry.tone === "warning" ? TriangleAlert : CircleX;
}

const TONE_STYLES = {
  danger: iconStyles.danger,
  warning: iconStyles.warning,
  success: iconStyles.success,
  neutral: iconStyles.running,
} as const;

function TurnRecordEntryRow(props: { entry: TurnRecordEntryView }) {
  useTranslation();
  const { entry } = props;
  const Icon = entryIcon(entry);
  return (
    <li className={sx(rowStyles.row)} data-turn-record-entry={entry.icon}>
      <span className={sx(rowStyles.rowStatusSlot)}>
        <span className={sx(iconStyles.slot)}>
          <Icon aria-hidden className={sx(iconStyles.iconSm, TONE_STYLES[entry.tone])} />
        </span>
      </span>
      <div className={sx(rowStyles.rowBody)}>
        <p className={sx(rowStyles.rowTitleLine, rowStyles.rowTitleLineExpanded)}>
          <span className={sx(rowStyles.rowTitle, rowStyles.rowTitleExpanded)}>{entry.title}</span>
        </p>
        {entry.detail || entry.providerDetail ? (
          <p className={sx(rowStyles.rowDetailLine, rowStyles.rowDetailLineExpanded)}>
            {entry.detail ? (
              <span className={sx(rowStyles.rowDetail, rowStyles.rowDetailExpanded)}>{entry.detail}</span>
            ) : null}
            {entry.detail && entry.providerDetail ? <span aria-hidden className={sx(rowStyles.rowDetailRule)} /> : null}
            {entry.providerDetail ? (
              <span className={sx(rowStyles.rowProviderDetail, rowStyles.rowProviderDetailExpanded)}>
                {entry.providerDetail}
              </span>
            ) : null}
          </p>
        ) : null}
        {entry.failures?.length ? (
          <ul className={sx(styles.failures)}>
            {entry.failures.map((failure) => (
              <li key={failure.id} className={sx(styles.failure)}>
                <span className={sx(styles.failureScript)}>{failure.scriptId}</span>{" "}
                <span className={sx(styles.failureKind)}>
                  {failure.blocking
                    ? i18n.t("session:turnRecord.entry.blocking")
                    : i18n.t("session:turnRecord.entry.warning")}
                </span>
                {failure.message ? <> {failure.message}</> : null}
              </li>
            ))}
            {entry.moreFailures ? (
              <li className={sx(styles.failure)}>
                {i18n.t("session:turnRecord.entry.moreFailures", { count: entry.moreFailures })}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {entry.offsetSeconds != null ? (
        <span className={sx(rowStyles.rowStartOffset)} title={i18n.t("session:turnRecord.offsetTitle")}>
          +{formatTurnActivityElapsedSeconds(entry.offsetSeconds)}
        </span>
      ) : null}
    </li>
  );
}

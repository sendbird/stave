import { Button as AdsButton } from "@/components/ads/components/Button";
import { AlertTriangle, ChevronDown, FileText, X } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { taskSourceContextNoticeStyles as styles } from "./task-source-context-notice.styles";
import {
  isPrContextSourceId,
  partitionStalePrContexts,
} from "@/lib/pr-context";
import type { TaskControlOwner, TaskSourceContext } from "@/types/chat";

export function resolveManagedTaskComposerAccess(args: {
  managedTaskOwner: TaskControlOwner | null;
  isTurnActive: boolean;
  canSteerActiveTurn: boolean;
}) {
  if (args.managedTaskOwner) {
    return {
      disabled: true,
      submitMode: "send" as const,
    };
  }
  if (!args.isTurnActive) {
    return {
      disabled: false,
      submitMode: "send" as const,
    };
  }
  return {
    disabled: false,
    submitMode: args.canSteerActiveTurn
      ? ("steer-or-queue" as const)
      : ("queue-next" as const),
  };
}

const SUPPORTED_SOURCE_PREFIXES = ["crane:", "pr:"] as const;

function resolveNoticeTitle(parts: readonly TaskSourceContext[]): string {
  const first = parts[0];
  if (!first) {
    return "Attached context";
  }
  if (first.title) {
    return first.title;
  }
  return isPrContextSourceId(first.sourceId)
    ? "Pull request context"
    : "Crane issue context";
}

/**
 * The composer's read-out of everything attached to this task, and the only
 * place a user can see that a PR attachment has gone stale. Staleness is
 * decided by `partitionStalePrContexts`, the same function the turn assembly in
 * `src/store/app.store.ts` uses — the banner and the wire agree by construction.
 */
export function TaskSourceContextNotice(props: {
  sourceContexts: readonly TaskSourceContext[];
  /** Current-branch PR URL and head, for the staleness check. */
  currentPrUrl?: string | null;
  currentPrHeadSha?: string | null;
  onRemove?: (sourceId: string) => void;
  onClear?: () => void;
  onRefreshPrContext?: () => void;
}) {
  const attached = props.sourceContexts.filter((part) =>
    SUPPORTED_SOURCE_PREFIXES.some((prefix) =>
      part.sourceId.startsWith(prefix),
    ),
  );
  if (attached.length === 0) {
    return null;
  }

  const { stale } = partitionStalePrContexts({
    parts: attached,
    currentPrUrl: props.currentPrUrl,
    currentHeadSha: props.currentPrHeadSha,
  });
  const staleSourceIds = new Set(stale.map((part) => part.sourceId));

  return (
    <div className={sx(styles.root)}>
      <div className={sx(styles.headerRow)}>
        <FileText className={sx(styles.headerIcon)} aria-hidden="true" />
        <div className={sx(styles.headerText)}>
          <p className={sx(styles.title)}>{resolveNoticeTitle(attached)}</p>
          <p className={sx(styles.subtitle)}>
            Stored locally with this task · Attached to every turn
          </p>
        </div>
        {props.onClear ? (
          <AdsButton
            layout="host"
            type="button"
            aria-label="Remove all attached context"
            xstyle={styles.clearButton}
            onClick={props.onClear}
          >
            Clear all
          </AdsButton>
        ) : null}
      </div>

      {stale.length > 0 ? (
        <div role="status" className={sx(styles.staleNotice)}>
          <AlertTriangle className={sx(styles.staleIcon)} aria-hidden="true" />
          <div className={sx(styles.staleBody)}>
            <p>
              The pull request moved to a new commit. This evidence is held back
              from further turns until you refresh it.
            </p>
            {props.onRefreshPrContext ? (
              <AdsButton
                layout="host"
                type="button"
                xstyle={styles.refreshButton}
                onClick={props.onRefreshPrContext}
              >
                Refresh PR context
              </AdsButton>
            ) : null}
          </div>
        </div>
      ) : null}

      <details className={sx(styles.details)}>
        <summary className={sx(styles.summary)}>
          View attached context
          <ChevronDown
            className={sx(styles.summaryChevron)}
            aria-hidden="true"
          />
        </summary>
        <div className={sx(styles.attachedList)}>
          {attached.map((part) => (
            <section
              key={part.sourceId}
              aria-label={part.title ?? part.sourceId}
            >
              {attached.length > 1 || props.onRemove ? (
                <div className={sx(styles.attachedHeaderRow)}>
                  <p className={sx(styles.attachedTitle)}>
                    {part.title ?? part.sourceId}
                    {staleSourceIds.has(part.sourceId) ? (
                      <span className={sx(styles.staleTag)}>stale</span>
                    ) : null}
                  </p>
                  {props.onRemove ? (
                    <AdsButton
                      layout="host"
                      type="button"
                      aria-label={`Remove ${part.title ?? part.sourceId}`}
                      xstyle={styles.removeButton}
                      onClick={() => props.onRemove?.(part.sourceId)}
                    >
                      <X className={sx(styles.removeIcon)} aria-hidden="true" />
                    </AdsButton>
                  ) : null}
                </div>
              ) : null}
              <pre className={sx(styles.attachedContent)}>{part.content}</pre>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}

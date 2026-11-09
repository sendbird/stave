import * as stylex from "@stylexjs/stylex";
import { useTranslation } from "@/i18n";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { transition } from "@/components/aui/recipes/transition";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import type { I18nKey } from "@/i18n/runtime";
import {
  normalizePullRequestWatchEvents,
  PULL_REQUEST_WATCH_EVENTS,
  type PullRequestWatchEvent,
} from "@/lib/supervision/pull-request-watch";

const EVENT_COPY = {
  checks_failed: {
    label: "automation:checkBackEditor.eventChecksFailed",
    description: "automation:checkBackEditor.eventChecksFailedDescription",
  },
  merge_conflict: {
    label: "automation:checkBackEditor.eventMergeConflict",
    description: "automation:checkBackEditor.eventMergeConflictDescription",
  },
  review_comments: {
    label: "automation:checkBackEditor.eventReviewComments",
    description: "automation:checkBackEditor.eventReviewCommentsDescription",
  },
} as const satisfies Record<PullRequestWatchEvent, { label: I18nKey; description: I18nKey }>;

/** The "wake the task when" choices of a pull request watch. */
export function PullRequestWatchEvents(props: {
  value: readonly PullRequestWatchEvent[];
  onChange: (events: PullRequestWatchEvent[]) => void;
}) {
  const { t } = useTranslation(["automation"]);
  const selected = new Set(props.value);
  function toggle(event: PullRequestWatchEvent, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(event);
    else next.delete(event);
    props.onChange(normalizePullRequestWatchEvents([...next]));
  }
  return (
    <div className={sx(styles.root)} role="group" aria-label={t("automation:checkBackEditor.pullRequestEventsLabel")}>
      <div className={sx(styles.heading)}>
        <span className={sx(styles.label)}>{t("automation:checkBackEditor.pullRequestEventsLabel")}</span>
        <span className={sx(styles.description)}>{t("automation:checkBackEditor.pullRequestEventsDescription")}</span>
      </div>
      <div className={sx(styles.list)}>
        {PULL_REQUEST_WATCH_EVENTS.map((event) => (
          <label key={event} className={sx(styles.row, transition.colors)}>
            <Checkbox
              controlOnly
              xstyle={styles.control}
              checked={selected.has(event)}
              onCheckedChange={(checked) => toggle(event, checked === true)}
            />
            <span className={sx(styles.rowText)}>
              <span className={sx(styles.rowTitle)}>{t(EVENT_COPY[event].label)}</span>
              <span className={sx(styles.description)}>{t(EVENT_COPY[event].description)}</span>
            </span>
          </label>
        ))}
      </div>
      {props.value.length === 0 ? (
        <span className={sx(styles.warning)} role="status">
          {t("automation:checkBackEditor.pickAnEvent")}
        </span>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: { display: "grid", gap: vars["--aui-space-8"] },
  heading: { display: "grid", gap: vars["--aui-space-4"] },
  label: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
  },
  list: { display: "grid", gap: vars["--aui-space-2"] },
  row: {
    alignItems: "flex-start",
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    borderRadius: vars["--aui-radius-control"],
    cursor: "pointer",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
    paddingBlock: 6,
    paddingInline: 6,
  },
  // Only the offset the row needs; the painted box keeps its canonical size.
  control: { marginTop: vars["--aui-space-2"] },
  rowText: { display: "grid", flex: 1, gap: vars["--aui-space-2"], minInlineSize: 0 },
  rowTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  warning: {
    color: vars["--aui-color-warning-text"],
    fontSize: vars["--aui-font-size-caption"],
  },
});

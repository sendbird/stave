import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/components/ui";
import { useTrackerSourceStatuses } from "@/lib/tracker-issues/client-state";
import { TRACKER_ISSUE_VIEWS } from "@/lib/tracker-issues/filter";
import { describeTrackerSources } from "@/lib/tracker-issues/source-status";
import {
  DEFAULT_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
  MAX_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
  MIN_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
} from "@/lib/tracker-issues/settings";
import {
  TRACKER_SOURCE_IDS,
  TRACKER_ISSUE_START_MODES,
} from "@/lib/tracker-issues/types";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";
import { TRACKER_SOURCE_LABELS } from "@/lib/tracker-issues/context";
import { sx } from "@/components/ads/utils/stylex";
import { tasksSectionStyles as styles } from "./settings-dialog-issues-section.styles";

const VIEW_LABELS: Record<(typeof TRACKER_ISSUE_VIEWS)[number], string> = {
  get "assigned-open"() { return i18n.t("settings:settingsDialogIssuesSection.assignedToMe"); },
  get "all-open"() { return i18n.t("settings:settingsDialogIssuesSection.allOpen"); },
  get "recently-done"() { return i18n.t("settings:settingsDialogIssuesSection.recentlyDone"); },
  get "in-stave"() { return i18n.t("settings:settingsDialogIssuesSection.alreadyInStave"); },
};

const START_MODE_LABELS: Record<
  (typeof TRACKER_ISSUE_START_MODES)[number],
  string
> = {
  get run() { return i18n.t("settings:settingsDialogIssuesSection.startTheRunImmediately"); },
  get stage() { return i18n.t("settings:settingsDialogIssuesSection.stageThePromptInTheComposer"); },
};

const HINT = sx(styles.hint);

function describeInterval(seconds: number): string {
  if (seconds % 60 !== 0) return i18n.t("settings:duration.seconds", { count: seconds });
  const minutes = seconds / 60;
  return i18n.t("settings:duration.minutes", { count: minutes });
}

export function IssueTrackerSettingsSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const tasks = useAppStore((state) => state.settings.trackerIssues);
  const updateSettings = useAppStore((state) => state.updateSettings);
  // Live status rather than the enabled switches: a connector turned on but
  // never given a credential used to render as an enabled source next to a
  // permanently empty list, with nothing naming the missing credential.
  const syncBySource = useTrackerSourceStatuses();
  const summaries = useMemo(
    () => describeTrackerSources(syncBySource),
    [syncBySource],
  );

  // The interval box is edited as free text, so it keeps its own draft and
  // clamps on blur: clamping per keystroke would rewrite "6" into "60" before
  // the second digit arrives.
  const [intervalDraft, setIntervalDraft] = useState(
    String(tasks.refreshIntervalSeconds),
  );
  useEffect(() => {
    setIntervalDraft(String(tasks.refreshIntervalSeconds));
  }, [tasks.refreshIntervalSeconds]);

  const save = (patch: Partial<typeof tasks>) => {
    updateSettings({ patch: { trackerIssues: { ...tasks, ...patch } } });
  };

  const commitInterval = () => {
    const parsed = Number.parseInt(intervalDraft.trim(), 10);
    const next = Number.isFinite(parsed)
      ? Math.min(
          Math.max(parsed, MIN_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS),
          MAX_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS,
        )
      : DEFAULT_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS;
    setIntervalDraft(String(next));
    save({ refreshIntervalSeconds: next });
  };

  return (
    <div
      id="settings-field-tracker-issues"
      tabIndex={-1}
      className={sx(styles.card)}
    >
      <div className={sx(styles.cardHeader)}>
        <h3 className={sx(styles.cardTitle)}>{t("settings:sections.fields.trackerIssues.title")}</h3>
        <p className={sx(styles.hintSpaced)}>
          {t("settings:settingsDialogIssuesSection.theTicketListOpensOnAssigned")}</p>
      </div>

      <div className={sx(styles.cardBody)}>
        <div className={sx(styles.field)}>
          <label
            htmlFor="settings-tasks-default-view"
            className={sx(styles.fieldLabel)}
          >
            {t("settings:settingsDialogIssuesSection.defaultView")}</label>
          <Select
            value={tasks.defaultView}
            onValueChange={(value) =>
              save({ defaultView: value as typeof tasks.defaultView })
            }
          >
            <SelectTrigger
              id="settings-tasks-default-view"
              className={sx(styles.triggerWide)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_ISSUE_VIEWS.map((view) => (
                <SelectItem key={view} value={view}>
                  {VIEW_LABELS[view]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={HINT}>
            {t("settings:settingsDialogIssuesSection.firstTabWhenYouOpenIssues")}</p>
        </div>

        <div className={sx(styles.field)}>
          <label
            htmlFor="settings-tasks-refresh-interval"
            className={sx(styles.fieldLabel)}
          >
            {t("settings:settingsDialogIssuesSection.refreshIntervalSeconds")}</label>
          <Input
            id="settings-tasks-refresh-interval"
            type="number"
            inputMode="numeric"
            xstyle={styles.intervalInput}
            min={MIN_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS}
            max={MAX_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS}
            step={30}
            value={intervalDraft}
            onChange={(event) => setIntervalDraft(event.target.value)}
            onBlur={commitInterval}
          />
          <p className={HINT}>{t("settings:whole.issueRefresh", { interval: describeInterval(tasks.refreshIntervalSeconds), min: MIN_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS, max: MAX_TRACKER_ISSUES_REFRESH_INTERVAL_SECONDS })}</p>
        </div>

        <div className={sx(styles.field)}>
          <label
            htmlFor="settings-tasks-start-mode"
            className={sx(styles.fieldLabel)}
          >
            {t("settings:settingsDialogIssuesSection.whenATicketStartsWork")}</label>
          <Select
            value={tasks.defaultKickoffStartMode}
            onValueChange={(value) =>
              save({
                defaultKickoffStartMode:
                  value as typeof tasks.defaultKickoffStartMode,
              })
            }
          >
            <SelectTrigger
              id="settings-tasks-start-mode"
              className={sx(styles.triggerWide)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_ISSUE_START_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {START_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={HINT}>
            {t("settings:settingsDialogIssuesSection.stagingLeavesTheGeneratedPromptIn")}</p>
        </div>

        <div className={sx(styles.sourcesCard)}>
          <div>
            <h4 className={sx(styles.sourcesTitle)}>{t("settings:settingsDialogIssuesSection.sources")}</h4>
            <p className={sx(styles.hintSpaced)}>
              {t("settings:settingsDialogIssuesSection.chooseWhichTrackersIssuesReadsPairing")}</p>
          </div>
          <ul className={sx(styles.sourceList)}>
            {TRACKER_SOURCE_IDS.map((source) => {
              const summary = summaries.find(
                (entry) => entry.source === source,
              );
              const enabled = tasks.sourceEnabled[source];
              return (
                <li key={source} className={sx(styles.sourceRow)}>
                  <div className={sx(styles.sourceMain)}>
                    <div className={sx(styles.sourceHead)}>
                      <label
                        htmlFor={`settings-tasks-source-${source}`}
                        className={sx(styles.sourceLabel)}
                      >
                        {TRACKER_SOURCE_LABELS[source]}
                      </label>
                      {summary ? (
                        <Badge
                          variant={
                            summary.condition === "producing" ||
                            summary.condition === "syncing"
                              ? "success"
                              : summary.condition === "error"
                                ? "destructive"
                                : "outline"
                          }
                          className={sx(styles.sourceBadge)}
                        >
                          {summary.headline}
                        </Badge>
                      ) : null}
                    </div>
                    <p className={sx(styles.hintTight)}>
                      {enabled
                        ? (summary?.detail ?? i18n.t("settings:settingsDialogIssuesSection.usedInTheIssuesList"))
                        : i18n.t("settings:settingsDialogIssuesSection.hiddenFromIssuesPairingAndCredentials")}
                    </p>
                  </div>
                  <div className={sx(styles.sourceActions)}>
                    {summary?.fixInSettings ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        xstyle={styles.setUpButton}
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                              detail: { section: "integrations" },
                            }),
                          );
                        }}
                      >
                        {i18n.t("settings:settingsDialogIssuesSection.setUp")}</Button>
                    ) : null}
                    <Switch
                      id={`settings-tasks-source-${source}`}
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        save({
                          sourceEnabled: {
                            ...tasks.sourceEnabled,
                            [source]: checked,
                          },
                        })
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            size="xs"
            variant="link"
            xstyle={styles.openIntegrations}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
                  detail: { section: "integrations" },
                }),
              );
            }}
          >
            {t("settings:settingsDialogIssuesSection.openSettingsIntegrations")}</Button>
        </div>
      </div>
    </div>
  );
}

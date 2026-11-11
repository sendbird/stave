import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button, Switch } from "@/components/ui";
import { Accordion } from "@/components/aui/components/Accordion";
import { transition } from "@/components/aui/recipes/transition";
import { sx } from "@/components/aui/utils/stylex";
import { describeTarsScheduleLastRun, describeTarsScheduleNext, describeTarsScheduleRule, describeTarsScheduleWorkspace } from "@/lib/tars/schedule-view";
import type { TarsScheduleView } from "@/lib/tars/schedules";
import { tarsScheduleStyles as styles } from "./tars-schedule.styles";
import { tarsTrayStyles as trayStyles } from "./tars-tray.styles";
import type { TarsScheduleContext } from "./use-tars-schedules";

const SECTION = "schedules";

function ScheduleRow({ schedule, context }: { schedule: TarsScheduleView; context: TarsScheduleContext }) {
  const { t } = useTranslation(["shell"]);
  const error = context.errors.get(schedule.id);
  return <li className={sx(styles.item)} data-tars-schedule={schedule.id} data-tars-schedule-enabled={schedule.enabled ? "true" : "false"}>
    <div className={sx(styles.text)}>
      <p className={sx(styles.title)} data-tars-schedule-name="">{schedule.title}</p>
      <p className={sx(styles.line)}>{describeTarsScheduleRule(schedule.rule)} · {describeTarsScheduleWorkspace(schedule.workspace)}</p>
      <p className={sx(styles.line, schedule.nextRuns.length > 0 && styles.next)} data-tars-schedule-next="">{describeTarsScheduleNext(schedule)}</p>
      <p className={sx(styles.line)} data-tars-schedule-last={schedule.lastRun?.status ?? "none"}>{describeTarsScheduleLastRun(schedule.lastRun)}</p>
      {schedule.editedElsewhere ? <p className={sx(styles.line, styles.warning)} data-tars-schedule-edited="">{t("shell:tars.schedule.section.editedElsewhere")}</p> : null}
      {error ? <p className={sx(styles.line, styles.error)} role="alert">{error}</p> : null}
    </div>
    {/* On is the schedule running on its rule; off is paused. A schedule changed in Schedules is managed there. */}
    <span className={sx(styles.control)}>
      <Switch checked={schedule.enabled} disabled={context.busyId !== null || schedule.editedElsewhere} aria-label={t("shell:tars.schedule.section.switch", { title: schedule.title })}
        data-tars-schedule-switch={schedule.id} onCheckedChange={(checked) => context.onToggle(schedule, !checked, "click")} />
    </span>
  </li>;
}

/**
 * The schedules Tars created, under the tray's lanes: each with its rule and
 * where it runs, its next run, its last outcome and a pause switch. It lists
 * only Tars's own; every schedule, with its editor and run history, is on
 * Stave's Schedules screen, which the link opens. Folded while there is none.
 */
export function TarsSchedulesSection({ context, onOpenSchedules }: { context: TarsScheduleContext; onOpenSchedules: () => void }) {
  const { t } = useTranslation(["shell"]);
  const { list } = context;
  const schedules = list.value?.schedules ?? [];
  // Folding and unfolding is view-only. Until the user chooses, it is open exactly when there is something to show.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? schedules.length > 0;
  const root = useRef<HTMLDivElement>(null);
  // "Show my schedules": Tars's list action opens the section once and brings it into view; reading the conversation again never replays it.
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const previous = seen.current;
    seen.current = context.listRequests;
    if (previous === null || context.listRequests <= previous) return;
    setChosen(true);
    requestAnimationFrame(() => root.current?.scrollIntoView({ block: "nearest" }));
  }, [context.listRequests]);
  return <Accordion.Root ref={root} multiple value={open ? [SECTION] : []} onValueChange={(value) => setChosen((value as string[]).includes(SECTION))} data-tars-schedules="">
    <Accordion.Item value={SECTION}>
      {/* The tray's own lane header: the chevron leading and turned down while open, the count trailing the name, muted while there is none. */}
      <Accordion.Header xstyle={trayStyles.laneHeader}>
        <Accordion.Trigger xstyle={trayStyles.laneTrigger}>
          <ChevronRight aria-hidden className={sx(trayStyles.chevron, transition.transform, open && trayStyles.chevronOpen)} />
          <span className={sx(trayStyles.sectionTitle, schedules.length === 0 && trayStyles.sectionTitleEmpty)}>{t("shell:tars.schedule.section.title")}
            <span className={sx(trayStyles.sectionCount)} data-tars-schedules-count={schedules.length}>{schedules.length}</span></span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel>
        {list.state === "failed" && !list.value ? <div className={sx(styles.footer)} role="alert">
          <p className={sx(styles.footerNote)}>{t("shell:tars.schedule.section.unavailable")}</p>
          <Button type="button" variant="ghost" size="2xs" onClick={list.reload}>{t("shell:tars.schedule.section.retry")}</Button>
        </div> : schedules.length ? <ul className={sx(styles.list)}>
          {schedules.map((schedule) => <ScheduleRow key={schedule.id} schedule={schedule} context={context} />)}
        </ul> : list.state === "loading" ? null : <p className={sx(trayStyles.empty)} data-tars-schedules-empty="">{t("shell:tars.schedule.section.empty")}</p>}
        {list.value?.omitted ? <p className={sx(trayStyles.empty)}>{t("shell:tars.schedule.section.omitted", { count: list.value.omitted })}</p> : null}
        <div className={sx(styles.footer)}>
          <p className={sx(styles.footerNote)} data-tars-schedules-timezone="">{list.value ? t("shell:tars.schedule.section.timezone", { timezone: list.value.timezone }) : null}</p>
          <Button type="button" variant="ghost" size="2xs" data-tars-schedules-open="" onClick={onOpenSchedules}>{t("shell:tars.schedule.section.open")}</Button>
        </div>
      </Accordion.Panel>
    </Accordion.Item>
  </Accordion.Root>;
}

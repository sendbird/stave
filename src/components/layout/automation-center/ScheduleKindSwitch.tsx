import { i18n, useTranslation } from "@/i18n";
import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import type { ScheduleKind } from "@/lib/schedule-rows";

/** Where a schedule works: a new task in a repository, or a task that exists. */
export function ScheduleKindSwitch(props: {
  value: ScheduleKind;
  onChange: (kind: ScheduleKind) => void;
}) {
  const { t: tI18n } = useTranslation(["automation"]);
  return (
    <ChoiceButtons
      aria-label={tI18n("automation:scheduleKindSwitch.where")}
      value={props.value}
      options={[
        { value: "start", label: tI18n("automation:scheduleKindSwitch.newTaskInARepository") },
        { value: "check-back", label: tI18n("automation:scheduleKindSwitch.anExistingTask") },
      ]}
      onChange={props.onChange}
    />
  );
}

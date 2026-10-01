import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import type { ScheduleKind } from "@/lib/schedule-rows";

/** Where a schedule works: a new task in a repository, or a task that exists. */
export function ScheduleKindSwitch(props: {
  value: ScheduleKind;
  onChange: (kind: ScheduleKind) => void;
}) {
  return (
    <ChoiceButtons
      aria-label="Where"
      value={props.value}
      options={[
        { value: "start", label: "New task in a repository" },
        { value: "check-back", label: "An existing task" },
      ]}
      onChange={props.onChange}
    />
  );
}

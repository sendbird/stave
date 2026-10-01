import { useMemo, useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@/components/ui";
import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import { isTaskManaged } from "@/lib/tasks";
import type { AutomationSchedule } from "@/lib/automations";
import type { ScheduleKind } from "@/lib/schedule-rows";
import {
  WakeUpUpsertInputSchema,
  type WakeUp,
  type WakeUpTrigger,
} from "@/lib/supervision/wake-up-policy";
import { useAppStore } from "@/store/app.store";
import { CadenceSection, FormLabel, SectionHeading } from "./AutomationEditor";
import { editorStyles } from "./automation-editor.styles";
import { ScheduleKindSwitch } from "./ScheduleKindSwitch";

const DEFAULT_SCHEDULE: AutomationSchedule = { every: 1, unit: "hours" };

const PROMPT_IDEAS = [
  "Re-check CI on the pull request. Report only on change.",
  "Look for new pull request feedback and address it.",
] as const;

type When = "cadence" | "completion";

/**
 * The create/edit sheet for "Check back on a task": What (prompt) · Where (an
 * existing task) · When (cadence, or when its subagents finish). It writes the
 * wake-up record underneath.
 */
export function CheckBackEditor(props: {
  /** The check-back being edited; null when creating. */
  wakeUp: WakeUp | null;
  /** Task to preselect when creating. */
  taskId?: string | null;
  taskTitle?: string | null;
  onKindChange: (kind: ScheduleKind) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { wakeUp } = props;
  const tasks = useAppStore((state) => state.tasks);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const taskOptions = useMemo(
    () => tasks.filter((task) => !task.archivedAt && !isTaskManaged(task)),
    [tasks],
  );
  const [taskId, setTaskId] = useState(wakeUp?.taskId ?? props.taskId ?? "");
  const [prompt, setPrompt] = useState(wakeUp?.prompt ?? "");
  const [when, setWhen] = useState<When>(wakeUp?.trigger.kind === "completion" ? "completion" : "cadence");
  const [draft, setDraft] = useState({
    enabled: true,
    schedule: wakeUp?.trigger.kind === "schedule" ? wakeUp.trigger.schedule : DEFAULT_SCHEDULE,
  });
  const [saving, setSaving] = useState(false);
  const workspaceId = wakeUp?.workspaceId ?? activeWorkspaceId;

  async function save() {
    const trigger: WakeUpTrigger =
      when === "completion" ? { kind: "completion" } : { kind: "schedule", schedule: draft.schedule };
    const parsed = WakeUpUpsertInputSchema.safeParse({
      workspaceId,
      taskId,
      prompt,
      trigger,
      maxOccurrences: wakeUp?.maxOccurrences ?? null,
      expiresAt: wakeUp?.expiresAt ?? null,
    });
    if (!parsed.success) {
      toast.error(!taskId ? "Pick a task to check back on." : (parsed.error.issues[0]?.message ?? "Invalid schedule."));
      return;
    }
    const api = window.api?.wakeUps;
    if (!api) {
      toast.error("Schedules are available in the Stave desktop app.");
      return;
    }
    setSaving(true);
    try {
      const result = wakeUp
        ? await api.update({ id: wakeUp.id, input: parsed.data })
        : await api.create(parsed.data);
      if (!result.ok) {
        toast.error(result.message ?? "Failed to save the schedule.");
        return;
      }
      toast.success(wakeUp ? "Schedule updated" : "Schedule created");
      props.onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={sx(editorStyles.root)}>
      <div className={sx(editorStyles.header)}>
        <div className={sx(editorStyles.headerText)}>
          <div className={sx(editorStyles.headerTitle)}>{wakeUp ? "Edit schedule" : "New schedule"}</div>
          <div className={sx(editorStyles.headerSubtitle)}>
            Resumes the same task while the Stave desktop app is open.
          </div>
        </div>
        <div className={sx(editorStyles.headerActions)}>
          <Button size="sm" variant="ghost" xstyle={editorStyles.headerButtonQuiet} onClick={props.onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" xstyle={editorStyles.headerButton} onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className={sx(editorStyles.body)}>
        <div className={sx(editorStyles.bodyColumn)}>
          <section className={sx(editorStyles.section)}>
            <SectionHeading title="What" />
            <FormLabel label="Instructions" description="Sent to the task each time it is checked. Uses the task's own agent.">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={PROMPT_IDEAS[0]}
                xstyle={editorStyles.promptControl}
              />
            </FormLabel>
            {prompt.trim() ? null : (
              <div className={sx(editorStyles.chipRow)}>
                {PROMPT_IDEAS.map((idea) => (
                  <Button key={idea} type="button" size="sm" variant="ghost" xstyle={editorStyles.cadenceChip} onClick={() => setPrompt(idea)}>
                    {idea}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section className={sx(editorStyles.section)}>
            <SectionHeading title="Where" description="Resumes this task in its own session; it never starts a new one." />
            {wakeUp ? null : <ScheduleKindSwitch value="check-back" onChange={props.onKindChange} />}
            <Select value={taskId} onValueChange={setTaskId} disabled={Boolean(wakeUp)}>
              <SelectTrigger className={sx(editorStyles.repositorySelect)} aria-label="Task">
                <SelectValue placeholder="Select a task">
                  {taskOptions.find((task) => task.id === taskId)?.title ?? props.taskTitle ?? undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {taskOptions.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className={sx(editorStyles.section)}>
            <SectionHeading title="When" />
            <ChoiceButtons
              aria-label="When"
              value={when}
              options={[
                { value: "cadence", label: "On a cadence" },
                { value: "completion", label: "When subagents finish" },
              ]}
              onChange={setWhen}
            />
            {when === "cadence" ? (
              <CadenceSection draft={draft} onDraftChange={setDraft} manual={false} heading={false} />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

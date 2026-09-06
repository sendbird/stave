import { ExternalLink, RotateCcw, ShieldCheck } from "lucide-react";

import { Button, Loader, Switch, Textarea } from "@/components/ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DispatchRuntimeFields,
  DispatchTargetFields,
  RememberTeamDefaultsField,
} from "@/components/layout/dispatch-runtime";
import { useTrackerTaskLinks } from "@/lib/tracker-tasks/client-state";
import { trackerTaskKey } from "@/lib/tracker-tasks/client-store";
import type {
  TrackerTaskKickoffResult,
  TrackerTaskListItem,
  TrackerTaskStartMode,
} from "@/lib/tracker-tasks/types";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import {
  TRACKER_SOURCE_LABELS,
  openTrackerTaskInBrowser,
  resolvePrimaryTrackerTaskLink,
} from "./tracker-task-ui";
import { useTrackerTaskKickoffDraft } from "./useTrackerTaskKickoffDraft";
import { taskLayoutStyles } from "./tasks-layout.stylex";

const ID_PREFIX = "tracker-task-kickoff";

const START_MODE_OPTIONS: readonly {
  value: TrackerTaskStartMode;
  label: string;
}[] = [
  { value: "run", label: "Start now" },
  { value: "stage", label: "Stage prompt only" },
];

export interface TrackerTaskKickoffSheetProps {
  /** The ticket being kicked off; `null` keeps the sheet closed. */
  item: TrackerTaskListItem | null;
  onClose: () => void;
  onKickedOff: (result: TrackerTaskKickoffResult) => void;
}

export function TrackerTaskKickoffSheet(props: TrackerTaskKickoffSheetProps) {
  const item = props.item;
  const task = item?.task ?? null;
  const links = useTrackerTaskLinks(
    task ? trackerTaskKey(task.source, task.ref) : "",
  );
  const existingLink = resolvePrimaryTrackerTaskLink(links);
  const projects = useAppStore((state) => state.recentProjects);
  const settings = useAppStore((state) => state.settings);
  const draft = useTrackerTaskKickoffDraft({ task, open: item !== null });

  const submit = async () => {
    const result = await draft.submit();
    if (result) {
      props.onKickedOff(result);
      props.onClose();
    }
  };

  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open && !draft.submitting) {
          props.onClose();
        }
      }}
    >
      <SheetContent side="right" xstyle={taskLayoutStyles.kickoffSheet}>
        <SheetHeader xstyle={taskLayoutStyles.kickoffHeader}>
          <SheetTitle className={sx(taskLayoutStyles.kickoffSectionHeading)}>
            Kick off {task?.key ?? "ticket"} in Stave
          </SheetTitle>
          <SheetDescription className={sx(taskLayoutStyles.kickoffHint)}>
            Nothing leaves this machine except the Crane status updates you
            allow below.
          </SheetDescription>
        </SheetHeader>

        <div className={sx(taskLayoutStyles.kickoffContent)}>
          {task ? (
            <section className={sx(taskLayoutStyles.kickoffTicket)}>
              <div className={sx(taskLayoutStyles.kickoffTicketHeader)}>
                <div className={sx(taskLayoutStyles.kickoffTicketCopy)}>
                  <p className={sx(taskLayoutStyles.kickoffTicketTitle)}>
                    {task.title}
                  </p>
                  <p className={sx(taskLayoutStyles.kickoffTicketMeta)}>
                    {TRACKER_SOURCE_LABELS[task.source]} {task.key} ·{" "}
                    {task.status.raw}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  xstyle={taskLayoutStyles.kickoffSourceButton}
                  onClick={() => openTrackerTaskInBrowser(task.url)}
                >
                  <ExternalLink className={sx(taskLayoutStyles.icon14)} />
                  Open source
                </Button>
              </div>
              {existingLink ? (
                <p className={sx(taskLayoutStyles.kickoffWarning)}>
                  This ticket already has a Stave run ({existingLink.state}).
                  Starting again creates a second one.
                </p>
              ) : null}
            </section>
          ) : null}

          <DispatchTargetFields
            idPrefix={ID_PREFIX}
            projects={projects}
            workspaces={draft.workspaces}
            projectPath={draft.projectPath}
            onProjectPathChange={draft.setProjectPath}
            workspaceStrategy={draft.workspaceStrategy}
            onWorkspaceStrategyChange={draft.setWorkspaceStrategy}
            workspaceId={draft.workspaceId}
            onWorkspaceIdChange={draft.setWorkspaceId}
            branchName={draft.branchName}
            onBranchNameChange={draft.setBranchName}
          />

          <section
            className={sx(taskLayoutStyles.kickoffSection)}
            aria-labelledby={`${ID_PREFIX}-instruction-heading`}
          >
            <div className={sx(taskLayoutStyles.kickoffHeadingRow)}>
              <h3
                id={`${ID_PREFIX}-instruction-heading`}
                className={sx(taskLayoutStyles.kickoffSectionHeading)}
              >
                What to do
              </h3>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                xstyle={taskLayoutStyles.kickoffReset}
                disabled={!task}
                onClick={draft.resetInstruction}
              >
                <RotateCcw className={sx(taskLayoutStyles.icon12)} />
                Reset to ticket
              </Button>
            </div>
            <Textarea
              id={`${ID_PREFIX}-instruction`}
              value={draft.instruction}
              onChange={(event) => draft.setInstruction(event.target.value)}
              rows={8}
              xstyle={taskLayoutStyles.kickoffTextArea}
              aria-label="Instruction for the run"
            />
            <p className={sx(taskLayoutStyles.kickoffHint)}>
              The ticket body is also attached as untrusted retrieved context.
            </p>
          </section>

          <DispatchRuntimeFields
            idPrefix={ID_PREFIX}
            draft={draft.runtime}
            advisorConsultLimit={settings.advisorConsultLimit}
            providerTimeoutMs={settings.providerTimeoutMs}
            disabled={draft.submitting}
            footer={
              draft.scopeLabel ? (
                <RememberTeamDefaultsField
                  idPrefix={ID_PREFIX}
                  scopeLabel={draft.scopeLabel}
                  checked={draft.rememberDefaults}
                  onCheckedChange={draft.setRememberDefaults}
                />
              ) : null
            }
          />

          <section
            className={sx(taskLayoutStyles.kickoffSection)}
            aria-labelledby={`${ID_PREFIX}-start-heading`}
          >
            <h3
              id={`${ID_PREFIX}-start-heading`}
              className={sx(taskLayoutStyles.kickoffSectionHeading)}
            >
              How it starts
            </h3>
            <div className={sx(taskLayoutStyles.kickoffModeList)}>
              {START_MODE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={
                    draft.startMode === option.value ? "secondary" : "ghost"
                  }
                  aria-pressed={draft.startMode === option.value}
                  xstyle={
                    draft.startMode === option.value
                      ? [
                          taskLayoutStyles.kickoffMode,
                          taskLayoutStyles.kickoffModeActive,
                        ]
                      : taskLayoutStyles.kickoffMode
                  }
                  onClick={() => draft.setStartMode(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <p className={sx(taskLayoutStyles.kickoffHint)}>
              {draft.startMode === "run"
                ? "The workspace is created and the turn starts immediately."
                : "The workspace and a prefilled prompt are prepared; you send it."}
            </p>

            {task?.source === "crane" ? (
              <div className={sx(taskLayoutStyles.kickoffCrane)}>
                <div className={sx(taskLayoutStyles.kickoffTicketCopy)}>
                  <label
                    htmlFor={`${ID_PREFIX}-crane-write-back`}
                    className={sx(taskLayoutStyles.detailLinkTitle)}
                  >
                    Report progress to Crane
                  </label>
                  <p className={sx(taskLayoutStyles.kickoffHint)}>
                    {!draft.craneWriteBackAvailable
                      ? "Turn the Crane connector on in Settings to report progress."
                      : draft.startMode === "run"
                        ? "Crane shows this ticket as running in Stave and receives lifecycle state only."
                        : "Only available when the run starts now."}
                  </p>
                </div>
                <Switch
                  id={`${ID_PREFIX}-crane-write-back`}
                  checked={draft.craneWriteBack}
                  disabled={
                    !draft.craneWriteBackAvailable || draft.startMode !== "run"
                  }
                  onCheckedChange={draft.setCraneWriteBack}
                  aria-label="Report progress to Crane"
                />
              </div>
            ) : null}
          </section>

          <section className={sx(taskLayoutStyles.kickoffNotice)}>
            <ShieldCheck className={sx(taskLayoutStyles.headerIcon)} />
            <p className={sx(taskLayoutStyles.kickoffHint)}>
              Prompts, responses, reasoning, files, paths, diffs, and
              credentials stay local. Tracker credentials are never read by this
              window.
            </p>
          </section>
        </div>

        <SheetFooter xstyle={taskLayoutStyles.kickoffFooter}>
          <span className={sx(taskLayoutStyles.kickoffFooterHint)}>
            {draft.rememberDefaults && draft.scopeLabel
              ? `Local ${draft.scopeLabel} defaults will be remembered.`
              : "Applies to this kickoff only."}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={draft.submitting}
            onClick={props.onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              draft.submitting ||
              !draft.projectPath ||
              !draft.runtime.model.model ||
              !draft.runtime.providerAvailable
            }
            onClick={() => void submit()}
          >
            {draft.submitting ? (
              <Loader aria-hidden size="xs" variant="spinner" />
            ) : null}
            {draft.startMode === "run" ? "Start in Stave" : "Stage prompt"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

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
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import {
  TRACKER_SOURCE_LABELS,
  openTrackerTaskInBrowser,
  resolvePrimaryTrackerTaskLink,
} from "./tracker-task-ui";
import { useTrackerTaskKickoffDraft } from "./useTrackerTaskKickoffDraft";

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
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b border-border/70 px-5 pt-5 pb-4 pr-12">
          <SheetTitle className="text-sm">
            Kick off {task?.key ?? "ticket"} in Stave
          </SheetTitle>
          <SheetDescription className="text-xs leading-5">
            Nothing leaves this machine except the Crane status updates you
            allow below.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {task ? (
            <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-foreground">
                    {task.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {TRACKER_SOURCE_LABELS[task.source]} {task.key} ·{" "}
                    {task.status.raw}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-[11px]"
                  onClick={() => openTrackerTaskInBrowser(task.url)}
                >
                  <ExternalLink className="size-3.5" />
                  Open source
                </Button>
              </div>
              {existingLink ? (
                <p className="rounded-md border border-warning/35 bg-warning/10 px-2 py-1.5 text-[11px] leading-4 text-warning">
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
            className="grid gap-2"
            aria-labelledby={`${ID_PREFIX}-instruction-heading`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id={`${ID_PREFIX}-instruction-heading`}
                className="text-sm font-semibold"
              >
                What to do
              </h3>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="gap-1"
                disabled={!task}
                onClick={draft.resetInstruction}
              >
                <RotateCcw className="size-3" />
                Reset to ticket
              </Button>
            </div>
            <Textarea
              id={`${ID_PREFIX}-instruction`}
              value={draft.instruction}
              onChange={(event) => draft.setInstruction(event.target.value)}
              rows={8}
              className="text-[12px] leading-5"
              aria-label="Instruction for the run"
            />
            <p className="text-xs text-muted-foreground">
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
            className="grid gap-2"
            aria-labelledby={`${ID_PREFIX}-start-heading`}
          >
            <h3
              id={`${ID_PREFIX}-start-heading`}
              className="text-sm font-semibold"
            >
              How it starts
            </h3>
            <div className="flex items-center gap-0.5 rounded-md bg-muted/45 p-0.5">
              {START_MODE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={
                    draft.startMode === option.value ? "secondary" : "ghost"
                  }
                  aria-pressed={draft.startMode === option.value}
                  className={cn(
                    "h-7 flex-1 text-[11px]",
                    draft.startMode === option.value &&
                      "border-border/55 bg-background/85",
                  )}
                  onClick={() => draft.setStartMode(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {draft.startMode === "run"
                ? "The workspace is created and the turn starts immediately."
                : "The workspace and a prefilled prompt are prepared; you send it."}
            </p>

            {task?.source === "crane" ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <label
                    htmlFor={`${ID_PREFIX}-crane-write-back`}
                    className="text-sm font-medium text-foreground"
                  >
                    Report progress to Crane
                  </label>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
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

          <section className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-5 text-muted-foreground">
              Prompts, responses, reasoning, files, paths, diffs, and
              credentials stay local. Tracker credentials are never read by this
              window.
            </p>
          </section>
        </div>

        <SheetFooter className="shrink-0 flex-row items-center border-t border-border/70 bg-muted/20 px-5 py-3">
          <span className="mr-auto text-xs text-muted-foreground">
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

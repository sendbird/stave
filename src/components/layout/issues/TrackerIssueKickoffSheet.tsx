import { i18n, useTranslation } from "@/i18n";
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
import { useTrackerIssueLinks } from "@/lib/tracker-issues/client-state";
import { trackerIssueKey } from "@/lib/tracker-issues/client-store";
import type {
  TrackerIssueKickoffResult,
  TrackerIssueListItem,
  TrackerIssueStartMode,
} from "@/lib/tracker-issues/types";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import {
  TRACKER_LINK_STATE_PRESENTATION,
  TRACKER_SOURCE_LABELS,
  openTrackerIssueInBrowser,
  resolvePrimaryTrackerIssueLink,
} from "./tracker-issue-ui";
import { useTrackerIssueKickoffDraft } from "./useTrackerIssueKickoffDraft";
import { taskLayoutStyles } from "./issues-layout.stylex";

const ID_PREFIX = "tracker-issue-kickoff";

const START_MODE_OPTIONS: readonly {
  value: TrackerIssueStartMode;
  label: string;
}[] = [
  { value: "run", get label() { return i18n.t("issues:trackerIssueKickoffSheet.startNow"); } },
  { value: "stage", get label() { return i18n.t("issues:trackerIssueKickoffSheet.stagePromptOnly"); } },
];

export interface TrackerIssueKickoffSheetProps {
  /** The ticket being kicked off; `null` keeps the sheet closed. */
  item: TrackerIssueListItem | null;
  onClose: () => void;
  onKickedOff: (result: TrackerIssueKickoffResult) => void;
}

export function TrackerIssueKickoffSheet(props: TrackerIssueKickoffSheetProps) {
  const { t: tI18n } = useTranslation(["issues"]);
  const item = props.item;
  const task = item?.task ?? null;
  const links = useTrackerIssueLinks(
    task ? trackerIssueKey(task.source, task.ref) : "",
  );
  const existingLink = resolvePrimaryTrackerIssueLink(links);
  const repositories = useAppStore((state) => state.recentRepositories);
  const settings = useAppStore((state) => state.settings);
  const draft = useTrackerIssueKickoffDraft({ task, open: item !== null });

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
          {tI18n("issues:trackerIssueKickoffSheet.kickoffTitle", { key: task?.key ?? tI18n("issues:trackerIssueKickoffSheet.ticket") })}
        </SheetTitle>
          <SheetDescription className={sx(taskLayoutStyles.kickoffHint)}>
            {tI18n("issues:trackerIssueKickoffSheet.nothingLeavesThisMachineExceptTheCrane")}</SheetDescription>
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
                  onClick={() => openTrackerIssueInBrowser(task.url)}
                >
                  <ExternalLink className={sx(taskLayoutStyles.icon14)} />
                  {tI18n("issues:trackerIssueKickoffSheet.openSource")}</Button>
              </div>
              {existingLink ? (
                <p className={sx(taskLayoutStyles.kickoffWarning)}>
          {tI18n("issues:trackerIssueKickoffSheet.existingRunWarning", { state: TRACKER_LINK_STATE_PRESENTATION[existingLink.state].label })}
        </p>
              ) : null}
            </section>
          ) : null}

          <DispatchTargetFields
            idPrefix={ID_PREFIX}
            repositories={repositories}
            workspaces={draft.workspaces}
            repositoryPath={draft.repositoryPath}
            onRepositoryPathChange={draft.setRepositoryPath}
            workspaceStrategy={draft.workspaceStrategy}
            onWorkspaceStrategyChange={draft.setWorkspaceStrategy}
            workspaceId={draft.workspaceId}
            onWorkspaceIdChange={draft.setWorkspaceId}
            branchName={draft.branchName}
            onBranchNameChange={draft.setBranchName}
            workspaceLabel={draft.workspaceLabel}
            onWorkspaceLabelChange={draft.setWorkspaceLabel}
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
                {tI18n("issues:trackerIssueKickoffSheet.whatToDo")}</h3>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                xstyle={taskLayoutStyles.kickoffReset}
                disabled={!task}
                onClick={draft.resetInstruction}
              >
                <RotateCcw className={sx(taskLayoutStyles.icon12)} />
                {tI18n("issues:trackerIssueKickoffSheet.resetToTicket")}</Button>
            </div>
            <Textarea
              id={`${ID_PREFIX}-instruction`}
              value={draft.instruction}
              onChange={(event) => draft.setInstruction(event.target.value)}
              rows={8}
              xstyle={taskLayoutStyles.kickoffTextArea}
              aria-label={tI18n("issues:trackerIssueKickoffSheet.instructionForTheRun")}
            />
            <p className={sx(taskLayoutStyles.kickoffHint)}>
              {tI18n("issues:trackerIssueKickoffSheet.theTicketBodyIsAlsoAttachedAs")}</p>
          </section>

          <DispatchRuntimeFields
            idPrefix={ID_PREFIX}
            draft={draft.runtime}
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
              {tI18n("issues:trackerIssueKickoffSheet.howItStarts")}</h3>
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
                  ? tI18n("issues:trackerIssueKickoffSheet.theWorkspaceIsCreatedAndTheTurn")
                  : tI18n("issues:trackerIssueKickoffSheet.theWorkspaceAndAPrefilledPromptAre")}
            </p>

            {task?.source === "crane" ? (
              <div className={sx(taskLayoutStyles.kickoffCrane)}>
                <div className={sx(taskLayoutStyles.kickoffTicketCopy)}>
                  <label
                    htmlFor={`${ID_PREFIX}-crane-write-back`}
                    className={sx(taskLayoutStyles.detailLinkTitle)}
                  >
                    {tI18n("issues:trackerIssueKickoffSheet.reportProgressToCrane")}</label>
                  <p className={sx(taskLayoutStyles.kickoffHint)}>
                    {!draft.craneWriteBackAvailable
                      ? tI18n("issues:trackerIssueKickoffSheet.turnTheCraneConnectorOnInSettings")
                      : draft.startMode === "run"
                        ? tI18n("issues:trackerIssueKickoffSheet.craneShowsThisTicketAsRunningIn")
                        : tI18n("issues:trackerIssueKickoffSheet.onlyAvailableWhenTheRunStartsNow")}
                  </p>
                </div>
                <Switch
                  id={`${ID_PREFIX}-crane-write-back`}
                  checked={draft.craneWriteBack}
                  disabled={
                    !draft.craneWriteBackAvailable || draft.startMode !== "run"
                  }
                  onCheckedChange={draft.setCraneWriteBack}
                  aria-label={tI18n("issues:trackerIssueKickoffSheet.reportProgressToCrane")}
                />
              </div>
            ) : null}
          </section>

          <section className={sx(taskLayoutStyles.kickoffNotice)}>
            <ShieldCheck className={sx(taskLayoutStyles.headerIcon)} />
            <p className={sx(taskLayoutStyles.kickoffHint)}>
              {tI18n("issues:trackerIssueKickoffSheet.promptsResponsesReasoningFilesPathsDiffsAnd")}</p>
          </section>
        </div>

        <SheetFooter xstyle={taskLayoutStyles.kickoffFooter}>
          <span className={sx(taskLayoutStyles.kickoffFooterHint)}>
            {draft.rememberDefaults && draft.scopeLabel
              ? tI18n("issues:trackerIssueKickoffSheet.localValueDefaultsWillBeRemembered", { value1: draft.scopeLabel })
              : tI18n("issues:trackerIssueKickoffSheet.appliesToThisKickoffOnly")}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={draft.submitting}
            onClick={props.onClose}
          >
            {tI18n("issues:trackerIssueKickoffSheet.cancel")}</Button>
          <Button
            type="button"
            disabled={
              draft.submitting ||
              !draft.repositoryPath ||
              !draft.runtime.model.model ||
              !draft.runtime.providerAvailable
            }
            onClick={() => void submit()}
          >
            {draft.submitting ? (
              <Loader aria-hidden size="xs" variant="spinner" />
            ) : null}
            {draft.startMode === "run" ? tI18n("issues:trackerIssueKickoffSheet.startInStave") : tI18n("issues:trackerIssueKickoffSheet.stagePrompt")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

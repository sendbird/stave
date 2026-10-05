import { i18n, useTranslation, Trans } from "@/i18n";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import type { FormEventHandler } from "react";
import {
  Button,
  Input,
  Loader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  canApplyCreatePrDialogOpenChange,
  type ConcretePrMergeMethod,
  type CreatePrDialogStep,
  type RepoMergeSettings,
} from "../TopBarOpenPR.utils";
import type { PrePrReviewFinding } from "@/lib/source-control-review";
import { openPrStyles } from "../top-bar-open-pr.styles";
import {
  CreatePrLoadingSplash,
  FIELD_LABEL_CLASS,
  InlineNoticeBanner,
  PrePrReviewFindingsPanel,
  PrePrVerificationPanel,
  PullRequestBranchFields,
  type InlineNotice,
  type ScmStatusItem,
} from "./create-pr-dialog-panels";

interface DialogState {
  open: boolean;
  step: CreatePrDialogStep;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
}

interface BranchFields {
  currentBranch?: string;
  defaultBranch: string;
  targetBranch: string;
  options: string[];
  loading: boolean;
  onTargetBranchChange: (branch: string) => void;
}

interface MergeFields {
  method: ConcretePrMergeMethod;
  autoMerge: boolean;
  repoSettings?: RepoMergeSettings;
  onMethodChange: (method: ConcretePrMergeMethod) => void;
  onAutoMergeChange: (enabled: boolean) => void;
}

interface DraftFields {
  title: string;
  body: string;
  notice: InlineNotice | null;
  titleInvalid: boolean;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
}

interface ChangeFields {
  files: ScmStatusItem[];
  selectedFilePaths: string[];
  expanded: boolean;
  commitMessage: string;
  commitMessageInvalid: boolean;
  fallbackCommitMessage: string;
  onExpandedChange: (expanded: boolean) => void;
  onFileCheckedChange: (path: string, checked: boolean) => void;
  onCommitMessageChange: (message: string) => void;
}

interface ReviewFields {
  findings: PrePrReviewFinding[];
  diffTruncated: boolean;
  verificationFailures: Array<{
    scriptId: string;
    message: string;
    blocking: boolean;
  }>;
  verificationBlocking: boolean;
  onStopAfterReview: () => void;
  onProceedAfterReview: () => void;
  onStopAfterVerification: () => void;
  onProceedAfterVerification: () => void;
}

interface SubmitActions {
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

interface CreatePullRequestDialogProps {
  dialog: DialogState;
  branch: BranchFields;
  merge: MergeFields;
  draft: DraftFields;
  changes: ChangeFields;
  review: ReviewFields;
  submit: SubmitActions;
}

/** Presentation for the create flow; the top bar owns every async transition. */
export function CreatePullRequestDialog(props: CreatePullRequestDialogProps) {
  useTranslation();
  return (
    <Dialog
      open={props.dialog.open}
      onOpenChange={(open, eventDetails) => {
        if (
          !canApplyCreatePrDialogOpenChange({
            open,
            isDialogBusy: props.dialog.busy,
          })
        ) {
          eventDetails.cancel();
          return;
        }
        if (open) {
          props.dialog.onOpen();
          return;
        }
        props.dialog.onClose();
      }}
    >
      <DialogContent
        xstyle={openPrStyles.dialogSurface}
        showCloseButton={!props.dialog.busy}
      >
        <DialogHeader>
          <DialogTitle>{i18n.t("sourceControl:createPullRequestDialog.createPullRequest")}</DialogTitle>
          <VisuallyHidden>
            <DialogDescription>
              {i18n.t("sourceControl:createPullRequestDialog.createDescription", { head: props.branch.currentBranch ?? "HEAD", base: props.branch.targetBranch })}
            </DialogDescription>
          </VisuallyHidden>
        </DialogHeader>

        {props.dialog.step === "loading" ? (
          <div className={sx(openPrStyles.loadingSlot)}>
            <CreatePrLoadingSplash
              currentBranch={props.branch.currentBranch}
              baseBranch={props.branch.targetBranch}
            />
          </div>
        ) : (
          <form
            className={sx(openPrStyles.form)}
            onSubmit={props.submit.onSubmit}
          >
            <div
              className={sx(
                openPrStyles.formBody,
                openPrStyles.createFormBodyScroll,
              )}
            >
              <PullRequestBranchFields
                currentBranch={props.branch.currentBranch}
                defaultBranch={props.branch.defaultBranch}
                disabled={props.dialog.busy}
                loading={props.branch.loading}
                targetBranch={props.branch.targetBranch}
                targetBranchOptions={props.branch.options}
                onTargetBranchChange={(nextBranch) => {
                  props.branch.onTargetBranchChange(nextBranch);
                }}
              />

              <div className={sx(openPrStyles.mergeCard)}>
                <p className={FIELD_LABEL_CLASS}>{i18n.t("sourceControl:createPullRequestDialog.mergeBehavior")}</p>

                <div className={sx(openPrStyles.settingRow)}>
                  <div className={sx(openPrStyles.minWidthZero)}>
                    <label
                      className={sx(openPrStyles.settingLabel)}
                      htmlFor="create-pr-merge-method"
                    >
                      {i18n.t("sourceControl:createPullRequestDialog.mergeMethod")}
                    </label>
                    <p className={sx(openPrStyles.settingHint)}>
                      {i18n.t("sourceControl:createPullRequestDialog.usedWhenThePRIsMerged")}
                    </p>
                  </div>
                  <Select
                    value={props.merge.method}
                    onValueChange={(value) =>
                      props.merge.onMethodChange(value as ConcretePrMergeMethod)
                    }
                    disabled={props.dialog.busy}
                  >
                    <SelectTrigger
                      id="create-pr-merge-method"
                      className={sx(openPrStyles.mergeMethodTrigger)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value="squash"
                        disabled={
                          props.merge.repoSettings?.squashMergeAllowed === false
                        }
                      >
                        {i18n.t("sourceControl:createPullRequestDialog.squash")}
                        {props.merge.repoSettings?.squashMergeAllowed === false
                          ? i18n.t("sourceControl:createPullRequestDialog.notAllowed")
                          : ""}
                      </SelectItem>
                      <SelectItem
                        value="merge"
                        disabled={
                          props.merge.repoSettings?.mergeCommitAllowed === false
                        }
                      >
                        {i18n.t("sourceControl:createPullRequestDialog.mergeCommit")}
                        {props.merge.repoSettings?.mergeCommitAllowed === false
                          ? i18n.t("sourceControl:createPullRequestDialog.notAllowed")
                          : ""}
                      </SelectItem>
                      <SelectItem
                        value="rebase"
                        disabled={
                          props.merge.repoSettings?.rebaseMergeAllowed === false
                        }
                      >
                        {i18n.t("sourceControl:createPullRequestDialog.rebase")}
                        {props.merge.repoSettings?.rebaseMergeAllowed === false
                          ? i18n.t("sourceControl:createPullRequestDialog.notAllowed")
                          : ""}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div
                  {...stylex.props(openPrStyles.divider)}
                  aria-hidden="true"
                />

                <div className={sx(openPrStyles.settingRow)}>
                  <div className={sx(openPrStyles.minWidthZero)}>
                    <label
                      className={sx(openPrStyles.settingLabel)}
                      htmlFor="create-pr-auto-merge"
                    >
                      {i18n.t("sourceControl:createPullRequestDialog.autoMerge")}
                    </label>
                    <p className={sx(openPrStyles.settingHint)}>
                      {props.merge.repoSettings?.autoMergeAllowed === false
                        ? i18n.t("sourceControl:createPullRequestDialog.disabledByRepositorySettings")
                        : i18n.t("sourceControl:createPullRequestDialog.mergeAutomaticallyAfterRequiredChecksPass")}
                    </p>
                  </div>
                  <Switch
                    id="create-pr-auto-merge"
                    className={sx(openPrStyles.autoMergeSwitch)}
                    checked={props.merge.autoMerge}
                    onCheckedChange={props.merge.onAutoMergeChange}
                    disabled={
                      props.dialog.busy ||
                      props.merge.repoSettings?.autoMergeAllowed === false
                    }
                  />
                </div>
              </div>

              {props.draft.notice ? (
                <InlineNoticeBanner notice={props.draft.notice} />
              ) : null}
              <PrePrReviewFindingsPanel
                findings={props.review.findings}
                truncated={props.review.diffTruncated}
              />
              <PrePrVerificationPanel
                failures={props.review.verificationFailures}
                blocking={props.review.verificationBlocking}
              />

              {/* PR Title */}
              <div className={sx(openPrStyles.field)}>
                <label
                  className={sx(openPrStyles.settingLabel)}
                  htmlFor="pr-title-input"
                >
                  {i18n.t("sourceControl:createPullRequestDialog.title")}
                </label>
                <Input
                  autoFocus
                  id="pr-title-input"
                  xstyle={openPrStyles.textInput}
                  placeholder={i18n.t("sourceControl:createPullRequestDialog.pRTitle")}
                  value={props.draft.title}
                  onChange={(e) => {
                    props.draft.onTitleChange(e.target.value);
                  }}
                  disabled={props.dialog.busy}
                  aria-invalid={props.draft.titleInvalid}
                />
                {props.draft.titleInvalid ? (
                  <p className={sx(openPrStyles.fieldError)}>
                    <Trans ns="sourceControl" i18nKey="createPullRequestDialog.invalidTitleExample" values={{ example: "fix(topbar): stabilize create pr flow" }} components={{ code: <code /> }} />
                  </p>
                ) : null}
              </div>

              {/* PR Description */}
              <div
                className={sx(
                  openPrStyles.field,
                  openPrStyles.fieldMinWidthZero,
                )}
              >
                <label
                  className={sx(openPrStyles.settingLabel)}
                  htmlFor="pr-body-input"
                >
                  {i18n.t("sourceControl:createPullRequestDialog.description")}
                </label>
                <Textarea
                  id="pr-body-input"
                  xstyle={openPrStyles.bodyTextarea}
                  rows={6}
                  wrap="soft"
                  placeholder={i18n.t("sourceControl:createPullRequestDialog.describeYourChanges")}
                  value={props.draft.body}
                  onChange={(e) => {
                    props.draft.onBodyChange(e.target.value);
                  }}
                  disabled={props.dialog.busy}
                />
              </div>

              {/* Uncommitted Changes */}
              {props.changes.files.length > 0 && (
                <div className={sx(openPrStyles.field)}>
                  <AdsButton
                    layout="host"
                    type="button"
                    xstyle={openPrStyles.changesToggle}
                    onClick={() =>
                      props.changes.onExpandedChange(!props.changes.expanded)
                    }
                    aria-expanded={props.changes.expanded}
                    aria-controls="create-pr-changed-files"
                  >
                    {/* One rotating chevron: the ternary swapped the DOM
                          node, so the arrow popped 90° instead of turning. */}
                    <ChevronRight
                      className={sx(
                        props.changes.expanded &&
                          openPrStyles.changesChevronOpen,
                        transition.transform,
                      )}
                    />
                    <span className={sx(openPrStyles.changesCountLabel)}>{i18n.t("sourceControl:createPullRequestDialog.uncommittedCount", { count: props.changes.files.length })}</span>
                    <span className={sx(openPrStyles.changesHint)}>
                      {i18n.t("sourceControl:createPullRequestDialog.allFilesSelectedByDefault")}
                    </span>
                  </AdsButton>

                  <div
                    id="create-pr-changed-files"
                    className={sx(openPrStyles.minWidthZero)}
                  >
                    {props.changes.expanded && (
                      <div
                        className={sx(
                          openPrStyles.field,
                          openPrStyles.fieldMinWidthZero,
                        )}
                      >
                        <div className={sx(openPrStyles.changesList)}>
                          {props.changes.files.map((file) => (
                            <label
                              key={file.path}
                              // A hover wash on a selectable file row, on a
                              // `<label>` — no ADS control underneath it to
                              // supply the fade the rest of the dialog's rows
                              // have.
                              className={sx(
                                openPrStyles.changesRow,
                                transition.colors,
                              )}
                            >
                              <Checkbox
                                controlOnly
                                checked={props.changes.selectedFilePaths.includes(
                                  file.path,
                                )}
                                onCheckedChange={(checked) =>
                                  props.changes.onFileCheckedChange(
                                    file.path,
                                    checked,
                                  )
                                }
                                disabled={props.dialog.busy}
                                aria-label={i18n.t("sourceControl:createPullRequestDialog.includeInTheAutomaticCommit", { value1: file.path })}
                              />
                              <span className={sx(openPrStyles.changesCode)}>
                                {file.code}
                              </span>
                              <span className={sx(openPrStyles.changesPath)}>
                                {file.path}
                              </span>
                            </label>
                          ))}
                        </div>

                        {props.changes.selectedFilePaths.length === 0 ? (
                          <p className={sx(openPrStyles.fieldHint)}>
                            {i18n.t("sourceControl:createPullRequestDialog.selectAtLeastOneFileToEnable")}
                          </p>
                        ) : null}

                        <div
                          className={sx(
                            openPrStyles.field,
                            openPrStyles.fieldMinWidthZero,
                          )}
                        >
                          <label
                            className={FIELD_LABEL_CLASS}
                            htmlFor="commit-message-input"
                          >
                            {i18n.t("sourceControl:createPullRequestDialog.commitMessage")}
                          </label>
                          <Input
                            id="commit-message-input"
                            xstyle={openPrStyles.textInput}
                            placeholder={props.changes.fallbackCommitMessage}
                            value={props.changes.commitMessage}
                            onChange={(e) =>
                              props.changes.onCommitMessageChange(
                                e.target.value,
                              )
                            }
                            disabled={props.dialog.busy}
                            aria-invalid={props.changes.commitMessageInvalid}
                          />
                          {props.changes.commitMessageInvalid ? (
                            <p className={sx(openPrStyles.fieldErrorTight)}>
                              <Trans ns="sourceControl" i18nKey="createPullRequestDialog.invalidMessageExample" values={{ example: "fix(topbar): stabilize create pr flow" }} components={{ code: <code /> }} />
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {props.dialog.step === "reviewing" &&
            props.review.findings.length > 0 ? (
              <DialogFooter className={sx(openPrStyles.dialogFooter)}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={props.review.onStopAfterReview}
                >
                  {i18n.t("sourceControl:createPullRequestDialog.stopAndFix")}
                </Button>
                <Button
                  type="button"
                  onClick={props.review.onProceedAfterReview}
                >
                  {i18n.t("sourceControl:createPullRequestDialog.proceedAnyway")}
                </Button>
              </DialogFooter>
            ) : props.review.verificationFailures.length > 0 ? (
              <DialogFooter className={sx(openPrStyles.dialogFooter)}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={props.review.onStopAfterVerification}
                >
                  {i18n.t("sourceControl:createPullRequestDialog.stopAndFix")}
                </Button>
                {props.review.verificationBlocking ? null : (
                  <Button
                    type="button"
                    onClick={props.review.onProceedAfterVerification}
                  >
                    {i18n.t("sourceControl:createPullRequestDialog.proceedAnyway")}
                  </Button>
                )}
              </DialogFooter>
            ) : (
              <DialogFooter className={sx(openPrStyles.dialogFooter)}>
                <Button
                  type="submit"
                  disabled={!props.submit.canSubmit || props.dialog.busy}
                >
                  {props.submit.submitting ? (
                    <Loader aria-hidden size="xs" variant="persist" />
                  ) : null}
                  {i18n.t("sourceControl:createPullRequestDialog.createPR")}
                </Button>
              </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

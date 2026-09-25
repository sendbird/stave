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
          <DialogTitle>Create Pull Request</DialogTitle>
          <VisuallyHidden>
            <DialogDescription>
              Create a pull request from {props.branch.currentBranch ?? "HEAD"}{" "}
              into {props.branch.targetBranch}
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
                <p className={FIELD_LABEL_CLASS}>Merge behavior</p>

                <div className={sx(openPrStyles.settingRow)}>
                  <div className={sx(openPrStyles.minWidthZero)}>
                    <label
                      className={sx(openPrStyles.settingLabel)}
                      htmlFor="create-pr-merge-method"
                    >
                      Merge method
                    </label>
                    <p className={sx(openPrStyles.settingHint)}>
                      Used when the PR is merged.
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
                        Squash
                        {props.merge.repoSettings?.squashMergeAllowed === false
                          ? " (not allowed)"
                          : ""}
                      </SelectItem>
                      <SelectItem
                        value="merge"
                        disabled={
                          props.merge.repoSettings?.mergeCommitAllowed === false
                        }
                      >
                        Merge commit
                        {props.merge.repoSettings?.mergeCommitAllowed === false
                          ? " (not allowed)"
                          : ""}
                      </SelectItem>
                      <SelectItem
                        value="rebase"
                        disabled={
                          props.merge.repoSettings?.rebaseMergeAllowed === false
                        }
                      >
                        Rebase
                        {props.merge.repoSettings?.rebaseMergeAllowed === false
                          ? " (not allowed)"
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
                      Auto-merge
                    </label>
                    <p className={sx(openPrStyles.settingHint)}>
                      {props.merge.repoSettings?.autoMergeAllowed === false
                        ? "Disabled by repository settings."
                        : "Merge automatically after required checks pass."}
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
                  Title
                </label>
                <Input
                  autoFocus
                  id="pr-title-input"
                  xstyle={openPrStyles.textInput}
                  placeholder="PR title"
                  value={props.draft.title}
                  onChange={(e) => {
                    props.draft.onTitleChange(e.target.value);
                  }}
                  disabled={props.dialog.busy}
                  aria-invalid={props.draft.titleInvalid}
                />
                {props.draft.titleInvalid ? (
                  <p className={sx(openPrStyles.fieldError)}>
                    Use a lowercase Conventional Commit title, for example{" "}
                    <code>fix(topbar): stabilize create pr flow</code>.
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
                  Description
                </label>
                <Textarea
                  id="pr-body-input"
                  xstyle={openPrStyles.bodyTextarea}
                  rows={6}
                  wrap="soft"
                  placeholder="Describe your changes..."
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
                    <span className={sx(openPrStyles.changesCountLabel)}>
                      {props.changes.files.length} uncommitted file
                      {props.changes.files.length !== 1 ? "s" : ""}
                    </span>
                    <span className={sx(openPrStyles.changesHint)}>
                      all files selected by default
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
                                aria-label={`Include ${file.path} in the automatic commit`}
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
                            Select at least one file to enable automatic commit.
                            Unselected files will remain untouched.
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
                            Commit message
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
                              Use a Conventional Commit message such as{" "}
                              <code>fix(topbar): stabilize create pr flow</code>
                              .
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
                  Stop and fix
                </Button>
                <Button
                  type="button"
                  onClick={props.review.onProceedAfterReview}
                >
                  Proceed anyway
                </Button>
              </DialogFooter>
            ) : props.review.verificationFailures.length > 0 ? (
              <DialogFooter className={sx(openPrStyles.dialogFooter)}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={props.review.onStopAfterVerification}
                >
                  Stop and fix
                </Button>
                {props.review.verificationBlocking ? null : (
                  <Button
                    type="button"
                    onClick={props.review.onProceedAfterVerification}
                  >
                    Proceed anyway
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
                  Create PR
                </Button>
              </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

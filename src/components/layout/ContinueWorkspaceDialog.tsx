import { GitBranch } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { CreateWorkspaceBranchPicker } from "@/components/layout/CreateWorkspaceBranchPicker";
import { sx } from "@/components/ads/utils/stylex";
import { Badge, Button, Input, Loader } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildContinueWorkspaceBranchName } from "@/store/repository.utils";
import { continueWorkspaceStyles } from "./continue-workspace-dialog.styles";
import { ChoiceButtons } from "./settings-dialog.shared";

export type ContinueWorkspaceTarget = "here" | "new-workspace";
import { useTranslation } from "@/i18n";

interface ContinueWorkspaceDialogProps {
  open: boolean;
  sourceBranch?: string;
  sourceWorkspaceName?: string;
  baseBranch: string;
  cwd?: string;
  defaultBranch: string;
  prTitle?: string;
  onOpenChange: (open: boolean) => void;
  onContinue: (args: {
    name: string;
    baseBranch?: string;
    target: ContinueWorkspaceTarget;
  }) => Promise<{
    ok: boolean;
    message?: string;
    noticeLevel?: "success" | "warning";
  }>;
}

export function ContinueWorkspaceDialog(props: ContinueWorkspaceDialogProps) {
  const { t } = useTranslation(["workspace", "common"]);
  const [workspaceName, setWorkspaceName] = useState("");
  // Continuing here keeps the conversation, which is what most follow-ups
  // on a merged branch want; a new workspace stays one click away.
  const [target, setTarget] = useState<ContinueWorkspaceTarget>("here");
  const continuingHere = target === "here";
  const [selectedBaseBranch, setSelectedBaseBranch] = useState(
    props.baseBranch,
  );
  const [showBaseBranchPicker, setShowBaseBranchPicker] = useState(false);
  const [availableRemoteBranches, setAvailableRemoteBranches] = useState<
    string[]
  >([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canChangeBaseBranch = Boolean(
    window.api?.sourceControl?.listBranches && props.cwd,
  );

  useEffect(() => {
    if (!props.open) {
      setError(null);
      setSubmitting(false);
      setShowBaseBranchPicker(false);
      setAvailableRemoteBranches([]);
      setLoadingBranches(false);
      return;
    }

    setWorkspaceName(
      buildContinueWorkspaceBranchName({ sourceBranch: props.sourceBranch }),
    );
    setTarget("here");
    setSelectedBaseBranch(props.baseBranch);
    setShowBaseBranchPicker(false);
    setAvailableRemoteBranches([]);
    setError(null);

    const listBranches = window.api?.sourceControl?.listBranches;
    if (!listBranches || !props.cwd) {
      setLoadingBranches(false);
      return;
    }

    let cancelled = false;
    setLoadingBranches(true);
    void listBranches({ cwd: props.cwd, refreshRemote: true })
      .then((result) => {
        if (!result?.ok || cancelled) {
          return;
        }

        const remoteBranches = result.remoteBranches ?? [];
        setAvailableRemoteBranches(remoteBranches);
        setSelectedBaseBranch((current) =>
          remoteBranches.includes(current) ? current : props.baseBranch,
        );
      })
      .catch(() => {
        // IPC failure — swallow; the UI stays in its default state.
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBranches(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.baseBranch, props.cwd, props.open, props.sourceBranch]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await props.onContinue({
        name: workspaceName,
        baseBranch: selectedBaseBranch,
        target,
      });
      if (!result.ok) {
        setError(
          result.message ??
            (continuingHere ? t("continueDialog.errors.failedHere") : t("continueDialog.errors.failed")),
        );
        return;
      }
      props.onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : continuingHere
            ? t("continueDialog.errors.failedHere")
            : t("continueDialog.errors.failed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!submitting) {
          props.onOpenChange(open);
        }
      }}
    >
      <DialogContent xstyle={continueWorkspaceStyles.surface}>
        <form onSubmit={handleSubmit} className={sx(continueWorkspaceStyles.form)}>
          <DialogHeader>
            <DialogTitle>{t("continueDialog.title")}</DialogTitle>
            <DialogDescription>{t("continueDialog.description")}</DialogDescription>
          </DialogHeader>

          <div className={sx(continueWorkspaceStyles.body)}>
            <ChoiceButtons<ContinueWorkspaceTarget>
              aria-label={t("continueDialog.targetLabel")}
              value={target}
              onChange={setTarget}
              options={[
                {
                  value: "here",
                  label: t("continueDialog.targetHere"),
                  description: t("continueDialog.targetHereHint"),
                },
                {
                  value: "new-workspace",
                  label: t("continueDialog.targetNewWorkspace"),
                  description: t("continueDialog.targetNewWorkspaceHint"),
                },
              ]}
            />
            <div className={sx(continueWorkspaceStyles.summaryGrid)}>
              <div className={sx(continueWorkspaceStyles.summaryCell)}>
                <p className={sx(continueWorkspaceStyles.eyebrow)}>
                  {t("continueDialog.sourceWorkspace")}
                </p>
                <div className={sx(continueWorkspaceStyles.stack)}>
                  <Badge
                    variant="outline"
                    className={sx(continueWorkspaceStyles.badge)}
                  >
                    <GitBranch
                      className={sx(continueWorkspaceStyles.branchIcon)}
                    />
                    <span className={sx(continueWorkspaceStyles.truncated)}>
                      {props.sourceBranch ??
                        props.sourceWorkspaceName ??
                        t("continueDialog.currentWorkspace")}
                    </span>
                  </Badge>
                  {props.prTitle ? (
                    <p className={sx(continueWorkspaceStyles.caption)}>
                      {props.prTitle}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className={sx(continueWorkspaceStyles.summaryCell)}>
                <div className={sx(continueWorkspaceStyles.cellHeader)}>
                  <p className={sx(continueWorkspaceStyles.eyebrow)}>
                    {continuingHere
                      ? t("continueDialog.newBranchBase")
                      : t("continueDialog.newWorkspaceBase")}
                  </p>
                  {canChangeBaseBranch ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      xstyle={continueWorkspaceStyles.changeButton}
                      onClick={() =>
                        setShowBaseBranchPicker((current) => !current)
                      }
                    >
                      {showBaseBranchPicker
                        ? t("common:actions.done")
                        : t("common:actions.change")}
                    </Button>
                  ) : null}
                </div>
                <Badge
                  variant="secondary"
                  className={sx(continueWorkspaceStyles.badge)}
                >
                  <GitBranch
                    className={sx(continueWorkspaceStyles.branchIcon)}
                  />
                  <span>{selectedBaseBranch}</span>
                </Badge>
              </div>
            </div>

            {showBaseBranchPicker ? (
              <div className={sx(continueWorkspaceStyles.pickerPanel)}>
                <p className={sx(continueWorkspaceStyles.eyebrow)}>
                  {t("continueDialog.remoteBaseBranch")}
                </p>
                <CreateWorkspaceBranchPicker
                  value={selectedBaseBranch}
                  defaultBranch={props.defaultBranch}
                  disabled={submitting}
                  localBranches={[]}
                  loading={loadingBranches}
                  remoteBranches={availableRemoteBranches}
                  onChange={setSelectedBaseBranch}
                />
                <p className={sx(continueWorkspaceStyles.caption)}>
                  {t("continueDialog.remoteBaseBranchHint")}
                </p>
              </div>
            ) : null}

            <div className={sx(continueWorkspaceStyles.fieldBlock)}>
              <p className={sx(continueWorkspaceStyles.fieldLabel)}>
                {continuingHere
                  ? t("continueDialog.branchNameLabelHere")
                  : t("continueDialog.branchNameLabel")}
              </p>
              <Input
                autoFocus
                value={workspaceName}
                placeholder="feature/follow-up--continue--20260404-164512"
                onChange={(event) => setWorkspaceName(event.target.value)}
                xstyle={continueWorkspaceStyles.nameInput}
              />
              {continuingHere ? null : (
                <p className={sx(continueWorkspaceStyles.caption)}>
                  {t("continueDialog.briefHint")}
                </p>
              )}
            </div>

            {error ? (
              <p className={sx(continueWorkspaceStyles.error)}>{error}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => props.onOpenChange(false)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader
                    aria-hidden
                    className={sx(continueWorkspaceStyles.submitLoader)}
                    size="xs"
                    variant="sync"
                  />
                  {t("continueDialog.submitting")}
                </>
              ) : (
                t("common:actions.continue")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

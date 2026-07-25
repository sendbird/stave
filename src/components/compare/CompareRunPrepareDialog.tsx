import {
  BrainCircuit,
  GitBranch,
  Play,
  ShieldCheck,
  SplitSquareHorizontal,
} from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  pickDefaultModelForProvider,
  ProviderModelPicker,
} from "@/components/session/ProviderModelPicker";
import { Button, Textarea } from "@/components/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_COMPARE_REVIEW_CRITERIA,
  normalizeCompareReviewCriteria,
  type CompareRunJudgeConfig,
  type CompareRunVariantConfig,
} from "@/lib/compare-runs";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";

export interface CompareRunPreparation {
  seedPrompt: string;
  variants: CompareRunVariantConfig[];
  judge: CompareRunJudgeConfig;
  reviewCriteria: string[];
}

interface CompareRunPrepareDialogProps {
  open: boolean;
  seedPrompt: string;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (preparation: CompareRunPreparation) => void;
}

export function CompareRunPrepareDialog(props: CompareRunPrepareDialogProps) {
  const [preparedPrompt, setPreparedPrompt] = useState(props.seedPrompt);
  const [criteriaDraft, setCriteriaDraft] = useState(
    DEFAULT_COMPARE_REVIEW_CRITERIA.join("\n"),
  );
  const [
    activeWorkspaceId,
    workspaces,
    workspaceBranchById,
    modelClaude,
    modelCodex,
  ] = useAppStore(
    useShallow((state) => [
      state.activeWorkspaceId,
      state.workspaces,
      state.workspaceBranchById,
      state.settings.modelClaude,
      state.settings.modelCodex,
    ]),
  );
  const workspace = workspaces.find((entry) => entry.id === activeWorkspaceId);
  const [candidates, setCandidates] = useState<CompareRunVariantConfig[]>([
    {
      provider: "claude-code",
      model: modelClaude,
      label: "Candidate A",
    },
    {
      provider: "codex",
      model: modelCodex,
      label: "Candidate B",
    },
  ]);
  const [judge, setJudge] = useState<CompareRunJudgeConfig>({
    provider: "codex",
    model: modelCodex,
  });
  const baseBranch =
    workspaceBranchById[activeWorkspaceId] ||
    workspace?.name ||
    "Current branch";
  const reviewCriteria = normalizeCompareReviewCriteria(
    criteriaDraft.split("\n"),
  );
  const canSubmit =
    preparedPrompt.trim().length > 0 &&
    candidates.every((candidate) => candidate.model?.trim()) &&
    Boolean(judge.model?.trim()) &&
    !props.submitting;

  function updateCandidate(
    index: number,
    patch: Partial<CompareRunVariantConfig>,
  ) {
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, ...patch } : candidate,
      ),
    );
  }

  function selectCandidateProvider(index: number, provider: ProviderId) {
    updateCandidate(index, {
      provider,
      model: pickDefaultModelForProvider(provider),
    });
  }

  function selectJudgeProvider(provider: ProviderId) {
    setJudge({
      provider,
      model: pickDefaultModelForProvider(provider),
    });
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.submitting) {
          props.onOpenChange(open);
        }
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/65 px-7 py-6 pr-16">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SplitSquareHorizontal className="size-4.5" />
            </span>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-lg font-semibold tracking-[-0.015em]">
                  Prepare comparison
                </DialogTitle>
                <span className="text-xs font-medium text-primary">
                  Step 1 of 5
                </span>
              </div>
              <DialogDescription className="max-w-2xl leading-6">
                Give both candidates the same brief and review contract before
                Stave creates isolated worktrees.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-7">
          <section className="py-6" aria-labelledby="compare-shared-brief">
            <div className="mb-3 space-y-1">
              <h3 id="compare-shared-brief" className="text-sm font-semibold">
                Shared brief
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                This exact request is sent to every candidate.
              </p>
            </div>
            <Textarea
              aria-label="Compare shared brief"
              value={preparedPrompt}
              onChange={(event) => setPreparedPrompt(event.target.value)}
              className="min-h-28 resize-y bg-surface px-3 py-2.5 leading-6"
            />
          </section>

          <section
            className="border-t border-border/65 py-6"
            aria-labelledby="compare-candidates"
          >
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-1">
                <h3 id="compare-candidates" className="text-sm font-semibold">
                  Candidates
                </h3>
                <p className="text-sm leading-5 text-muted-foreground">
                  Both start from the same branch with independent files and
                  provider sessions.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <GitBranch className="size-3.5" />
                {baseBranch}
              </span>
            </div>
            <div className="divide-y divide-border/55 border-y border-border/65">
              {candidates.map((candidate, index) => (
                <div
                  key={candidate.label}
                  className="grid min-h-20 grid-cols-[2rem_minmax(8rem,0.55fr)_minmax(18rem,1fr)] items-center gap-3 py-3 max-sm:grid-cols-[2rem_minmax(0,1fr)]"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {candidate.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Isolated worktree
                    </p>
                  </div>
                  <ProviderModelPicker
                    ariaLabel={candidate.label}
                    selectedProvider={candidate.provider}
                    selectedModel={candidate.model ?? ""}
                    onProviderChange={(provider) =>
                      selectCandidateProvider(index, provider)
                    }
                    onModelChange={(model) => updateCandidate(index, { model })}
                    disabled={props.submitting}
                    providerSelectClassName="h-9 w-[9.5rem] shrink-0"
                    modelSelectClassName="h-9"
                  />
                </div>
              ))}
            </div>
          </section>

          <section
            className="border-t border-border/65 py-6"
            aria-labelledby="compare-judge"
          >
            <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)]">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/9 text-primary">
                  <BrainCircuit className="size-4.5" />
                </span>
                <div className="space-y-1">
                  <h3 id="compare-judge" className="text-sm font-semibold">
                    Independent judge
                  </h3>
                  <p className="text-sm leading-5 text-muted-foreground">
                    Runs after every candidate finishes with fresh context and
                    read-only access.
                  </p>
                </div>
              </div>
              <ProviderModelPicker
                ariaLabel="Independent judge"
                selectedProvider={judge.provider}
                selectedModel={judge.model ?? ""}
                onProviderChange={selectJudgeProvider}
                onModelChange={(model) =>
                  setJudge((current) => ({ ...current, model }))
                }
                disabled={props.submitting}
                providerSelectClassName="h-9 w-[9.5rem] shrink-0"
                modelSelectClassName="h-9"
              />
            </div>
          </section>

          <section
            className="border-t border-border/65 py-6"
            aria-labelledby="compare-review-contract"
          >
            <div className="mb-3 space-y-1">
              <h3
                id="compare-review-contract"
                className="text-sm font-semibold"
              >
                Review contract
              </h3>
              <p className="text-sm leading-5 text-muted-foreground">
                One criterion per line. These remain visible in the Review
                stage. Leave this empty to use Stave&apos;s default rubric.
              </p>
            </div>
            <Textarea
              aria-label="Compare review criteria"
              value={criteriaDraft}
              onChange={(event) => setCriteriaDraft(event.target.value)}
              className="min-h-24 resize-y bg-surface px-3 py-2.5 leading-6"
            />
          </section>

          <div className="flex items-start gap-3 border-t border-border/65 py-5 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <p className="leading-6 text-muted-foreground">
              Keeping a candidate preserves its workspace. Stave closes the
              other compare workspaces only after your explicit Keep choice.
              Keeping does not merge code.
            </p>
          </div>
        </div>

        <DialogFooter className="items-center border-t border-border/65 px-7 py-4 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Prepare → Run → Judge → Review → Keep
          </span>
          <div className="flex items-center gap-2">
            <DialogClose
              render={<Button variant="ghost" disabled={props.submitting} />}
            >
              Cancel
            </DialogClose>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                props.onSubmit({
                  seedPrompt: preparedPrompt.trim(),
                  variants: candidates.map((candidate) => ({
                    ...candidate,
                    model: candidate.model?.trim(),
                  })),
                  judge: {
                    provider: judge.provider,
                    model: judge.model?.trim(),
                  },
                  reviewCriteria,
                })
              }
            >
              <Play className="size-4" />
              {props.submitting ? "Preparing…" : "Start comparison"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, toast } from "@/components/ui";
import { useAppStore } from "@/store/app.store";

type Step = "idle" | "checking" | "approving";

export function TopBarApprovePR(props: { noDragStyle: CSSProperties }) {
  const [step, setStep] = useState<Step>("idle");

  const [
    activeWorkspaceId,
    workspaceDefaultById,
    workspacePathById,
    projectPath,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.workspaceDefaultById,
    state.workspacePathById,
    state.projectPath,
  ] as const));

  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;

  if (isDefaultWorkspace) return null;

  async function handleClick() {
    const runCommand = window.api?.terminal?.runCommand;
    if (!runCommand) {
      toast.error("Unable to approve PR", { description: "Terminal bridge unavailable." });
      return;
    }

    // Check if there is an open PR for the current branch
    setStep("checking");
    const viewResult = await runCommand({
      command: "gh pr view --json number,state,url",
      cwd: workspaceCwd,
    });

    if (!viewResult?.ok) {
      toast.error("No pull request found", {
        description: viewResult?.stderr || "Could not find an open PR for this branch.",
      });
      setStep("idle");
      return;
    }

    let pr: { number: number; state: string; url: string };
    try {
      pr = JSON.parse(viewResult.stdout) as typeof pr;
    } catch (err) {
      toast.error("No pull request found", {
        description: err instanceof Error ? err.message : "Could not parse PR information.",
      });
      setStep("idle");
      return;
    }

    if (pr.state !== "OPEN") {
      toast.error("Pull request is not open", {
        description: `PR #${pr.number} is ${pr.state.toLowerCase()}.`,
      });
      setStep("idle");
      return;
    }

    // Submit approval
    setStep("approving");
    const approveResult = await runCommand({
      command: "gh pr review --approve",
      cwd: workspaceCwd,
    });

    if (!approveResult?.ok) {
      toast.error("Approval failed", {
        description: approveResult?.stderr || "Could not approve the pull request.",
      });
      setStep("idle");
      return;
    }

    toast.success(`PR #${pr.number} approved`, {
      description: "Your approval has been submitted.",
    });
    setStep("idle");
  }

  const isBusy = step !== "idle";
  const statusLabel =
    step === "checking" ? "Checking..." :
    step === "approving" ? "Approving..." :
    null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 disabled:opacity-50"
          style={props.noDragStyle}
          onClick={() => void handleClick()}
          disabled={isBusy}
        >
          {isBusy ? (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5 shrink-0" />
          )}
          {statusLabel ?? "Approve PR"}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Approve pull request via GitHub CLI</TooltipContent>
    </Tooltip>
  );
}

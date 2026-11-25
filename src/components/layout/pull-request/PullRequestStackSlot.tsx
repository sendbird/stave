import { useState } from "react";
import { PullRequestStackNotice } from "./PullRequestStackNotice";
import { PullRequestStackRetargetDialog } from "./PullRequestStackRetargetDialog";
import { useInViewport, usePullRequestStack } from "./use-pull-request-stack";

/**
 * A Fleet card's stack: read only while the card is on screen, through the
 * shared concurrency bound, and refreshed when the PR itself changed.
 */
export function PullRequestStackSlot(props: { cwd: string; branch?: string; prUrl?: string; enabled: boolean; revision?: string }) {
  const { ref, visible } = useInViewport<HTMLDivElement>();
  const stack = usePullRequestStack({ cwd: props.cwd, branch: props.branch, prUrl: props.prUrl, enabled: props.enabled && visible, revision: props.revision });
  const [retargeting, setRetargeting] = useState(false);
  return <div ref={ref} data-pr-stack-slot>
    <PullRequestStackNotice stack={stack.stack} onRetarget={() => setRetargeting(true)} />
    <PullRequestStackRetargetDialog
      open={retargeting} onOpenChange={setRetargeting} cwd={props.cwd}
      plan={stack.stack?.retarget ?? null} longLivedBranchPatterns={stack.patterns} onSettled={stack.refresh}
    />
  </div>;
}

import {
  GitBranch,
  GitCompareArrows,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestCreateArrow,
  GitPullRequestDraft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type WorkspacePrStatus,
  PR_STATUS_VISUAL,
  PR_TONE_ICON_CLASS,
} from "@/lib/pr-status";

// ---------------------------------------------------------------------------
// Icon lookup – maps icon name string to actual Lucide component
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  GitPullRequestCreateArrow,
  GitPullRequestDraft,
  GitPullRequest,
  GitCompareArrows,
  GitBranch,
  GitMerge,
  GitPullRequestClosed,
};

// ---------------------------------------------------------------------------
// PrStatusIcon – renders the appropriate Git icon with semantic color
// ---------------------------------------------------------------------------

export function PrStatusIcon(props: {
  status: WorkspacePrStatus;
  className?: string;
}) {
  const visual = PR_STATUS_VISUAL[props.status];
  const Icon = ICON_MAP[visual.icon] ?? GitPullRequest;
  const colorClass = PR_TONE_ICON_CLASS[visual.tone];

  return <Icon className={cn("size-3.5 shrink-0", colorClass, props.className)} />;
}

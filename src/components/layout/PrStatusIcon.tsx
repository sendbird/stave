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
import { cx, sx } from "@/components/ads/utils/stylex";
import { type WorkspacePrStatus, PR_STATUS_VISUAL } from "@/lib/pr-status";
import { prStatusIconStyles, prToneIconStyles } from "./pr-status.styles";

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

  return (
    <Icon
      className={cx(
        sx(prStatusIconStyles.glyph, prToneIconStyles[visual.tone]),
        props.className,
      )}
    />
  );
}

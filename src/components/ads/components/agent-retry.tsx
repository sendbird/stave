import { RotateCcw } from "lucide-react";
import type * as React from "react";

import { controlIconSizes } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { sx } from "../utils/stylex";
import type { AgentRunState } from "./agent-state";
import { Button } from "./Button";

/** The shared recovery contract for agent surfaces with a retryable failure. */
export type AgentRetryProps = {
  /** Retry the failed operation in place without discarding settled content. */
  onRetry?: () => void;
  /** Label for the one recovery action. @default "Retry" */
  retryLabel?: React.ReactNode;
};

export type AgentRetryButtonProps = AgentRetryProps & {
  /** Keep the focus ring inside a clipping owner such as Attachment. */
  insetFocus?: boolean;
};

/** One visible recovery action, shared by Stream, Attachment, and ToolRun. */
export function AgentRetryButton({
  insetFocus = false,
  onRetry,
  retryLabel = "Retry",
}: AgentRetryButtonProps) {
  if (!onRetry) return null;

  return (
    <Button
      className={sx(insetFocus && focusRing.ringInset)}
      onClick={onRetry}
      size="xs"
      variant="secondary"
    >
      <RotateCcw aria-hidden size={controlIconSizes.sm} />
      {retryLabel}
    </Button>
  );
}

/** Only failed tool runs expose retry; live and settled states do not. */
export function isRetryableAgentState(status: AgentRunState): boolean {
  return status === "error" || status === "failed";
}

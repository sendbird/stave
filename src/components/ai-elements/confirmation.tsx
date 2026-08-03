import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { StaveIcon } from "@/components/brand-icons";
import { isStaveToolName, toStaveToolDisplayName } from "@/lib/tool-display-name";

interface ConfirmationCompactProps {
  toolName: string;
  description: string;
  state:
    | "approval-requested"
    | "approval-responded"
    | "approval-interrupted"
    | "output-denied";
  onApprove?: () => void;
  onReject?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  showShortcutHint?: boolean;
  truncateDescription?: boolean;
  comfortableActions?: boolean;
}

function getApprovalDecisionText(state: ConfirmationCompactProps["state"]) {
  switch (state) {
    case "approval-responded":
      return "Decision: approved.";
    case "output-denied":
      return "Decision: denied.";
    case "approval-interrupted":
      return "Request expired because the turn was interrupted.";
    default:
      return null;
  }
}

export function ConfirmationCompact(args: ConfirmationCompactProps) {
  const {
    toolName,
    description,
    state,
    onApprove,
    onReject,
    disabled,
    disabledReason,
    showShortcutHint = true,
    truncateDescription = true,
    comfortableActions = false,
  } = args;
  const decisionText = getApprovalDecisionText(state);
  const isStaveTool = isStaveToolName(toolName);

  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-2.5 text-[0.8125rem]">
      <div className="flex items-start gap-2">
        {isStaveTool ? <StaveIcon className="mt-0.5 size-4 shrink-0" /> : null}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            {isStaveTool ? toStaveToolDisplayName(toolName) : toolName}
          </p>
          <p
            className={
              truncateDescription
                ? "mt-0.5 line-clamp-2 text-xs text-muted-foreground"
                : "mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground"
            }
          >
            {description}
          </p>
        </div>
      </div>
      {state === "approval-requested" ? (
        <>
          {disabledReason ? (
            <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
              {disabledReason}
            </p>
          ) : null}
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              size="sm"
              className={
                comfortableActions
                  ? "min-h-9 px-3 text-xs"
                  : "h-7 px-2.5 text-xs"
              }
              disabled={disabled}
              onClick={onApprove}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={
                comfortableActions
                  ? "min-h-9 px-3 text-xs"
                  : "h-7 px-2.5 text-xs"
              }
              disabled={disabled}
              onClick={onReject}
            >
              Reject
            </Button>
            {!disabled && onApprove && showShortcutHint ? (
              <span className="ml-auto text-[0.6875rem] text-muted-foreground/60">
                <Kbd className="mr-0.5 h-4 px-1 text-[0.625rem]">↵</Kbd> approve
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {decisionText ?? "Decision recorded."}
        </p>
      )}
    </div>
  );
}

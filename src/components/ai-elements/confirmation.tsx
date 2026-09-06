import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { StaveIcon } from "@/components/brand-icons";
import { sx } from "@/components/ads/utils/stylex";
import { isStaveToolName, toStaveToolDisplayName } from "@/lib/tool-display-name";
import { confirmationStyles as s } from "./confirmation.styles";

interface ConfirmationCompactProps {
  toolName: string;
  description: string;
  state:
    | "approval-requested"
    | "approval-responded"
    | "approval-interrupted"
    | "output-denied";
  onApprove?: () => void;
  /**
   * Present only when the runtime advertised an "allow always" option, so the
   * button never claims a persistence the provider will not actually perform.
   */
  onApproveAlways?: () => void;
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
    onApproveAlways,
    onReject,
    disabled,
    disabledReason,
    showShortcutHint = true,
    truncateDescription = true,
    comfortableActions = false,
  } = args;
  const decisionText = getApprovalDecisionText(state);
  const isStaveTool = isStaveToolName(toolName);
  const actionXstyle = comfortableActions ? s.actionComfortable : s.actionCompact;

  return (
    <div className={sx(s.root)}>
      <div className={sx(s.headerRow)}>
        {isStaveTool ? <StaveIcon className={sx(s.staveIcon)} /> : null}
        <div className={sx(s.headerBody)}>
          <p className={sx(s.toolName)}>
            {isStaveTool ? toStaveToolDisplayName(toolName) : toolName}
          </p>
          <p
            className={
              truncateDescription
                ? sx(s.descriptionClamp)
                : sx(s.descriptionWrap)
            }
          >
            {description}
          </p>
        </div>
      </div>
      {state === "approval-requested" ? (
        <>
          {disabledReason ? (
            <p className={sx(s.disabledReason)}>{disabledReason}</p>
          ) : null}
          <div className={sx(s.actionsRow)}>
            <Button
              size="sm"
              xstyle={actionXstyle}
              disabled={disabled}
              onClick={onApprove}
            >
              Approve
            </Button>
            {onApproveAlways ? (
              <Button
                size="sm"
                variant="outline"
                xstyle={actionXstyle}
                disabled={disabled}
                onClick={onApproveAlways}
                title="Approve and let the provider remember this decision."
              >
                Always allow
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              xstyle={actionXstyle}
              disabled={disabled}
              onClick={onReject}
            >
              Reject
            </Button>
            {!disabled && onApprove && showShortcutHint ? (
              <span className={sx(s.shortcutHint)}>
                <Kbd className={sx(s.shortcutKbd)}>↵</Kbd> approve
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className={sx(s.decisionText)}>
          {decisionText ?? "Decision recorded."}
        </p>
      )}
    </div>
  );
}

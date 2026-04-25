import { Gavel, Loader2, RefreshCw, X } from "lucide-react";
import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

/**
 * Inline verdict card shown in the arena body when a reviewer has been
 * launched. Subscribes to `group.reviewerVerdict` only — the reviewer task
 * itself stays hidden, so the card reads exclusively from the group's mirror.
 *
 * UX states:
 *  - `running` — header shows a spinner, body shows accumulated streamed text
 *    (may be empty for the first second or two). Clear button aborts.
 *  - `complete` — header shows a static gavel, body shows the final verdict.
 *    Re-run + Clear actions are available.
 *  - `error` — header turns destructive and shows `errorMessage`. Re-run +
 *    Clear available.
 */

interface ColiseumReviewerCardProps {
  parentTaskId: string;
  onRequestReRun: () => void;
}

export const ColiseumReviewerCard = memo(ColiseumReviewerCardImpl);

function ColiseumReviewerCardImpl(props: ColiseumReviewerCardProps) {
  const [verdict, clearColiseumReviewerVerdict] = useAppStore(
    useShallow((state) => {
      const group = state.activeColiseumsByTask[props.parentTaskId];
      return [group?.reviewerVerdict, state.clearColiseumReviewerVerdict] as const;
    }),
  );

  if (!verdict) {
    return null;
  }

  const isRunning = verdict.status === "running";
  const isError = verdict.status === "error";
  const headerLabel = isError
    ? "Reviewer failed"
    : isRunning
      ? "Reviewer is comparing…"
      : "Reviewer verdict";

  return (
    <section
      className={cn(
        "mb-3 flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 text-xs",
        isError ? "border-destructive/50" : "border-border/70",
      )}
      aria-label="Coliseum reviewer verdict"
    >
      <header className="flex items-center gap-2">
        {isError ? (
          <Gavel className="size-4 shrink-0 text-destructive" />
        ) : isRunning ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        ) : (
          <Gavel className="size-4 shrink-0 text-foreground" />
        )}
        <span className="min-w-0 truncate font-medium text-foreground">
          {headerLabel}
        </span>
        <Badge
          variant="secondary"
          className="shrink-0 gap-1 rounded-sm text-[10px] uppercase tracking-[0.14em]"
        >
          <ModelIcon
            providerId={verdict.providerId}
            model={verdict.model}
            className="size-3"
          />
          {verdict.model ? toHumanModelName({ model: verdict.model }) : null}
        </Badge>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {getProviderLabel({
            providerId: verdict.providerId,
            variant: "short",
          })}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={props.onRequestReRun}
                  disabled={isRunning}
                >
                  <RefreshCw className="size-3" />
                  Re-run
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                Re-run the review with a fresh prompt — useful after branches
                have added more output, or to try a different reviewer model.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Clear reviewer verdict"
                  onClick={() =>
                    clearColiseumReviewerVerdict({
                      parentTaskId: props.parentTaskId,
                    })
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                Dismiss the verdict. Branches stay put.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>
      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-destructive">
          {verdict.errorMessage ?? "Reviewer failed."}
        </div>
      ) : null}
      <div
        className={cn(
          "max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/60 p-2 font-mono text-[11px] leading-5 text-foreground/90",
          verdict.content.length === 0 && "italic text-muted-foreground",
        )}
      >
        {verdict.content.length > 0
          ? verdict.content
          : isRunning
            ? "Waiting for the reviewer to respond…"
            : "(no verdict text)"}
      </div>
    </section>
  );
}

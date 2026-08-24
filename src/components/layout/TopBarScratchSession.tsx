import { FolderCode } from "lucide-react";
import { useState, type CSSProperties } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  selectScratchPendingApprovals,
  useScratchSessionStore,
} from "@/store/scratch-session.store";

export function buildScratchTriggerLabel(args: {
  pendingApprovalCount: number;
  turnActive: boolean;
}) {
  if (args.pendingApprovalCount > 0) {
    return "Scratch session — approval waiting";
  }
  if (args.turnActive) {
    return "Scratch session — running";
  }
  return "Scratch session";
}

export function buildScratchEmptyStateText() {
  return "Pick a folder to start a scratch session. Nothing is added to your projects.";
}

export function TopBarScratchSession(props: { noDragStyle: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const folderPath = useScratchSessionStore((state) => state.folderPath);
  const activeTurnId = useScratchSessionStore((state) => state.activeTurnId);
  const pendingApprovalCount = useScratchSessionStore(
    (state) => selectScratchPendingApprovals(state).length,
  );

  const label = buildScratchTriggerLabel({
    pendingApprovalCount,
    turnActive: Boolean(activeTurnId),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                style={props.noDragStyle}
                className="relative shrink-0"
              />
            }
          >
            <FolderCode className="size-4" />
            {pendingApprovalCount > 0 || activeTurnId ? (
              <span
                className={cn(
                  "absolute right-1 top-1 size-1.5 rounded-full",
                  pendingApprovalCount > 0 ? "bg-warning" : "bg-foreground/60",
                )}
              />
            ) : null}
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-[min(32rem,calc(100vw-1rem))] overflow-hidden rounded-xl border-border/80 bg-card p-0"
      >
        <PopoverHeader>
          <PopoverTitle>Scratch session</PopoverTitle>
        </PopoverHeader>
        {folderPath ? null : (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {buildScratchEmptyStateText()}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

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
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { ScratchComposer } from "@/components/layout/scratch-session/ScratchComposer";
import { ScratchTranscript } from "@/components/layout/scratch-session/ScratchTranscript";
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
  const [clearPromptOpen, setClearPromptOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const folderPath = useScratchSessionStore((state) => state.folderPath);
  const activeTurnId = useScratchSessionStore((state) => state.activeTurnId);
  const pendingApprovalCount = useScratchSessionStore(
    (state) => selectScratchPendingApprovals(state).length,
  );
  const pickFolder = useScratchSessionStore((state) => state.pickFolder);
  const clear = useScratchSessionStore((state) => state.clear);

  const label = buildScratchTriggerLabel({
    pendingApprovalCount,
    turnActive: Boolean(activeTurnId),
  });

  // A live turn or a waiting approval means clearing would interrupt work, so
  // confirm first. An idle session clears immediately.
  const needsClearConfirm = Boolean(activeTurnId) || pendingApprovalCount > 0;

  const handleClearClick = () => {
    if (needsClearConfirm) {
      setClearPromptOpen(true);
    } else {
      void clear();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label={label}
                style={props.noDragStyle}
                className="relative h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
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
        <PopoverHeader className="gap-2">
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>Scratch session</PopoverTitle>
            {folderPath ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleClearClick}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start truncate font-mono text-xs"
            onClick={() => void pickFolder()}
          >
            {folderPath ?? "Pick a folder"}
          </Button>
        </PopoverHeader>
        {folderPath ? (
          <ScratchTranscript />
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {buildScratchEmptyStateText()}
          </p>
        )}
        <ScratchComposer />
        <ConfirmDialog
          open={clearPromptOpen}
          title="Clear this scratch session?"
          description="The running turn stops and any waiting approval is dropped. The folder stays selected."
          confirmLabel="Clear"
          loading={clearing}
          onConfirm={async () => {
            setClearing(true);
            try {
              await clear();
            } finally {
              setClearing(false);
              setClearPromptOpen(false);
            }
          }}
          onCancel={() => setClearPromptOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

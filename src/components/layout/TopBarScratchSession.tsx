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
import { ScratchProviderToggle } from "@/components/layout/scratch-session/ScratchProviderToggle";
import { ScratchTranscript } from "@/components/layout/scratch-session/ScratchTranscript";
import {
  selectScratchPendingApprovals,
  useScratchSessionStore,
} from "@/store/scratch-session.store";

export function buildScratchTriggerLabel(args: {
  pendingApprovalCount: number;
  turnActive: boolean;
  clearing: boolean;
}) {
  if (args.clearing) {
    return "Scratch session — clearing";
  }
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
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(
    null,
  );
  const [folderChangePromptOpen, setFolderChangePromptOpen] = useState(false);
  const [changingFolder, setChangingFolder] = useState(false);
  const folderPath = useScratchSessionStore((state) => state.folderPath);
  const activeTurnId = useScratchSessionStore((state) => state.activeTurnId);
  const isClearing = useScratchSessionStore((state) => state.isClearing);
  const hasMessages = useScratchSessionStore(
    (state) => state.messages.length > 0,
  );
  const pendingApprovalCount = useScratchSessionStore(
    (state) => selectScratchPendingApprovals(state).length,
  );
  const provider = useScratchSessionStore((state) => state.provider);
  const setProvider = useScratchSessionStore((state) => state.setProvider);
  const pickDirectory = useScratchSessionStore((state) => state.pickDirectory);
  const setFolder = useScratchSessionStore((state) => state.setFolder);
  const clear = useScratchSessionStore((state) => state.clear);

  const label = buildScratchTriggerLabel({
    pendingApprovalCount,
    turnActive: Boolean(activeTurnId),
    clearing: isClearing,
  });

  // A live turn, a waiting approval, or an existing transcript is a session
  // worth protecting: clearing or switching folders confirms first. An empty
  // session proceeds immediately.
  const hasSession =
    hasMessages ||
    Boolean(activeTurnId) ||
    pendingApprovalCount > 0 ||
    isClearing;
  const needsClearConfirm = Boolean(activeTurnId) || pendingApprovalCount > 0;

  const handleClearClick = () => {
    if (isClearing) {
      return;
    }
    if (needsClearConfirm) {
      setClearPromptOpen(true);
    } else {
      void clear();
    }
  };

  // Switching folders clears the current session so the old provider session /
  // taskId never bleed into the new folder. Confirm only when there is a session
  // to lose; a fresh pick just adopts the folder.
  const handlePickFolder = async () => {
    const picked = await pickDirectory();
    if (!picked.ok || !picked.directoryPath) {
      return;
    }
    if (picked.directoryPath === folderPath) {
      return;
    }
    if (hasSession) {
      setPendingFolderPath(picked.directoryPath);
      setFolderChangePromptOpen(true);
      return;
    }
    setFolder({ directoryPath: picked.directoryPath });
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
            {pendingApprovalCount > 0 || activeTurnId || isClearing ? (
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
                disabled={isClearing || changingFolder}
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
            disabled={isClearing || changingFolder}
            onClick={() => void handlePickFolder()}
          >
            {folderPath ?? "Pick a folder"}
          </Button>
          <ScratchProviderToggle
            provider={provider}
            disabled={
              Boolean(activeTurnId) || pendingApprovalCount > 0 || isClearing
            }
            onSelect={(next) => setProvider({ provider: next })}
          />
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
        <ConfirmDialog
          open={folderChangePromptOpen}
          title="Switch to a different folder?"
          description="The current scratch session is cleared — the running turn stops and any waiting approval is dropped — before the new folder opens."
          confirmLabel="Switch folder"
          loading={changingFolder}
          onConfirm={async () => {
            setChangingFolder(true);
            try {
              await clear();
              if (pendingFolderPath) {
                setFolder({ directoryPath: pendingFolderPath });
              }
            } finally {
              setChangingFolder(false);
              setFolderChangePromptOpen(false);
              setPendingFolderPath(null);
            }
          }}
          onCancel={() => {
            setFolderChangePromptOpen(false);
            setPendingFolderPath(null);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

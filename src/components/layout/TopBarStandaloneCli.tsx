import type { CSSProperties } from "react";
import { Terminal } from "lucide-react";
import {
  Button,
  Popover,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { StandaloneCliPopoverContent } from "@/components/layout/standalone-cli/StandaloneCliPopover";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

export function buildStandaloneCliTriggerLabel(args: {
  folderPath: string;
  open: boolean;
}) {
  if (!args.folderPath) {
    return "Standalone CLI — set a folder in Settings";
  }
  return args.open ? "Close Standalone CLI" : "Open Standalone CLI";
}

/**
 * `Escape` is the cancel key inside both CLIs' TUIs, so it has to reach the
 * PTY rather than dismiss the popover. Every other dismissal reason -- an
 * outside press, focus leaving the panel, a second press on the trigger --
 * closes normally.
 */
export function shouldCancelStandaloneCliOpenChange(reason: string) {
  return reason === "escape-key";
}

export function TopBarStandaloneCli(props: { noDragStyle: CSSProperties }) {
  const open = useStandaloneCliStore((state) => state.open);
  const openOverlay = useStandaloneCliStore((state) => state.openOverlay);
  const closeOverlay = useStandaloneCliStore((state) => state.closeOverlay);
  const folderPath = useAppStore(
    (state) => state.settings.standaloneCliFolderPath,
  );
  const label = buildStandaloneCliTriggerLabel({ folderPath, open });

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (shouldCancelStandaloneCliOpenChange(eventDetails.reason)) {
          eventDetails.cancel();
          return;
        }
        if (nextOpen) {
          openOverlay();
          return;
        }
        closeOverlay();
      }}
    >
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label={label}
                style={props.noDragStyle}
                className={cn(
                  "relative h-8 w-8 shrink-0 rounded-md p-0 hover:bg-secondary/70 hover:text-foreground",
                  open ? "text-foreground" : "text-muted-foreground",
                )}
              />
            }
          >
            <Terminal className="size-4" />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <StandaloneCliPopoverContent />
    </Popover>
  );
}

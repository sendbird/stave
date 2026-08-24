import type { CSSProperties } from "react";
import { Terminal } from "lucide-react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
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

export function TopBarStandaloneCli(props: { noDragStyle: CSSProperties }) {
  const open = useStandaloneCliStore((state) => state.open);
  const toggleOverlay = useStandaloneCliStore((state) => state.toggleOverlay);
  const folderPath = useAppStore(
    (state) => state.settings.standaloneCliFolderPath,
  );
  const label = buildStandaloneCliTriggerLabel({ folderPath, open });

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={label}
          aria-pressed={open}
          style={props.noDragStyle}
          className={cn(
            "relative h-8 w-8 shrink-0 rounded-md p-0 hover:bg-secondary/70 hover:text-foreground",
            open ? "text-foreground" : "text-muted-foreground",
          )}
          onClick={toggleOverlay}
        >
          <Terminal className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

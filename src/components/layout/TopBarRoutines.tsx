import { Workflow } from "lucide-react";
import { type CSSProperties, useState } from "react";
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
import { WorkspaceRoutinesPanel } from "@/components/layout/WorkspaceRoutinesPanel";

export function TopBarRoutines(props: { noDragStyle: CSSProperties }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground data-open:bg-secondary/70 data-open:text-foreground"
                style={props.noDragStyle}
                aria-label="Automation Center"
              />
            }
          >
            <Workflow className="size-4" />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Automation Center</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="h-[min(48rem,calc(100vh-4.5rem))] w-[min(36rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-xl border-border/80 bg-card p-0"
        style={props.noDragStyle}
      >
        <PopoverHeader className="shrink-0 border-b border-border/70 px-4 py-3">
          <PopoverTitle className="text-sm font-semibold text-foreground">
            Automation Center
          </PopoverTitle>
          <p className="text-xs text-muted-foreground">
            Agent workflows and auditable runs, with commands and long-running
            processes kept in distinct execution lanes.
          </p>
        </PopoverHeader>
        <div className="min-h-0 flex-1">
          <WorkspaceRoutinesPanel onRequestClose={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

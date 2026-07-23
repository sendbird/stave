import { CalendarClock } from "lucide-react";
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

export function TopBarRoutines(props: {
  noDragStyle: CSSProperties;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground data-[state=open]:bg-secondary/70 data-[state=open]:text-foreground"
                style={props.noDragStyle}
                aria-label="routines"
              >
                <CalendarClock className="size-4" />
              </Button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Routines</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="h-[min(46rem,calc(100vh-4.5rem))] w-[min(30rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-xl border-border/80 bg-card p-0 shadow-2xl"
        style={props.noDragStyle}
      >
        <PopoverHeader className="shrink-0 border-b border-border/70 px-4 py-3">
          <PopoverTitle className="text-sm font-semibold text-foreground">
            Routines
          </PopoverTitle>
          <p className="text-xs text-muted-foreground">
            Schedule repeatable work across registered repositories.
          </p>
        </PopoverHeader>
        <div className="min-h-0 flex-1">
          <WorkspaceRoutinesPanel onRequestClose={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

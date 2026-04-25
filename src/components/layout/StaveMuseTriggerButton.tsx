import { LoaderCircle, Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { SIDEBAR_HOME_BUTTON_CLASS } from "@/components/layout/StaveAppMenuButton";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

export function StaveMuseTriggerButton(args?: {
  className?: string;
}) {
  const [open, activeTurnId, focusStaveMuse, setStaveMuseOpen] = useAppStore(
    useShallow((state) => [
      state.staveMuse.open,
      state.staveMuse.activeTurnId,
      state.focusStaveMuse,
      state.setStaveMuseOpen,
    ] as const),
  );
  const isBusy = Boolean(activeTurnId);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      title={open ? "Close Stave Muse" : "Open Stave Muse"}
      aria-label={open ? "Close Stave Muse" : "Open Stave Muse"}
      className={cn(
        SIDEBAR_HOME_BUTTON_CLASS,
        "text-muted-foreground hover:text-foreground",
        open && "border-primary/70 bg-secondary/80 text-foreground",
        isBusy && "text-primary",
        args?.className,
      )}
      onClick={() => {
        if (open) {
          setStaveMuseOpen({ open: false });
          return;
        }
        focusStaveMuse();
      }}
    >
      {isBusy ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
    </Button>
  );
}

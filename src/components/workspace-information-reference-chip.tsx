import { Info, X } from "lucide-react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import {
  getWorkspaceInformationReferenceLabel,
  type WorkspaceInformationReference,
} from "@/lib/workspace-information-references";
import { cn } from "@/lib/utils";

export function WorkspaceInformationReferenceChip(args: {
  reference: WorkspaceInformationReference;
  disabled?: boolean;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const label = getWorkspaceInformationReferenceLabel(args.reference);
  const scopeLabel = args.reference.scope === "section" ? "Section" : "Item";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm border border-primary/25 bg-primary/10 px-2 py-1 text-sm text-primary",
        args.compact && "px-1.5 py-0.5 text-xs",
      )}
    >
      <Info className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        <span className="font-medium">Information</span>
        <span className="text-primary/70"> / {scopeLabel} / </span>
        <span>{label}</span>
      </span>
      {args.onRemove ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                disabled={args.disabled}
                aria-label={`Remove ${label}`}
                onClick={args.onRemove}
                className="-mr-1 size-5 text-primary/70 hover:text-primary"
              />
            }
          >
            <X className="size-3" />
          </TooltipTrigger>
          <TooltipContent>Remove Information reference</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

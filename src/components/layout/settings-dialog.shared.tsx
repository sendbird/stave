import {
  memo,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Check, CircleHelp } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Input,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ToolingStatusState,
  WorkspaceSyncStatus,
} from "@/lib/tooling-status";
import { cn } from "@/lib/utils";

export function readInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function readFloat(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function StatusBadge(args: {
  state: ToolingStatusState | WorkspaceSyncStatus["state"];
  label: string;
}) {
  const className =
    args.state === "ready" || args.state === "synced"
      ? "border-success/30 bg-success/10 text-success dark:bg-success/15"
      : args.state === "warning" ||
          args.state === "behind" ||
          args.state === "ahead" ||
          args.state === "dirty"
        ? "border-warning/40 bg-warning/10 text-warning dark:bg-warning/15"
        : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <Badge
      variant="secondary"
      className={cn("h-6 border px-2.5 font-medium tracking-normal", className)}
    >
      {args.label}
    </Badge>
  );
}

export function InfoRow(args: {
  label: string;
  value: string | null;
  monospace?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{args.label}</span>
      <span
        className={cn(
          "max-w-[70%] text-right text-foreground break-all",
          args.monospace && "font-mono text-xs",
        )}
      >
        {args.value ?? "-"}
      </span>
    </div>
  );
}

export function SectionHeading(args: { title: string; description: string }) {
  return (
    <div className="mb-4 border-b border-border/70 pb-3">
      <h3 className="text-xl font-semibold tracking-tight">{args.title}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
        {args.description}
      </p>
    </div>
  );
}

export function SectionStack(args: { children: ReactNode }) {
  return <section className="flex flex-col gap-4">{args.children}</section>;
}

export function SettingsCard(args: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  titleAccessory?: ReactNode;
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "overflow-hidden rounded-lg border-border/80 bg-card/70 shadow-xs",
        args.className,
      )}
    >
      <CardHeader className="border-b border-border/60 bg-muted/15">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-[15px]">{args.title}</CardTitle>
          {args.titleAccessory}
        </div>
        {args.description ? (
          <CardDescription>{args.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3.5">{args.children}</CardContent>
    </Card>
  );
}

export function ChoiceButtons<T extends string>(args: {
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  options: Array<{ value: T; label: string; description?: string }>;
}) {
  const hasDescriptions = args.options.some((option) => option.description);
  if (!hasDescriptions) {
    return (
      <div className="inline-flex max-w-full flex-wrap rounded-md border border-border/80 bg-muted/30 p-0.5">
        {args.options.map((option) => (
          <Button
            key={option.value}
            className="h-8 rounded-[5px] px-3 text-xs"
            variant={args.value === option.value ? "secondary" : "ghost"}
            onClick={() => args.onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-2",
        args.columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {args.options.map((option) => (
        <Button
          key={option.value}
          className={cn(
            "rounded-md",
            hasDescriptions
              ? "h-auto min-h-12 items-start justify-start whitespace-normal px-3 py-2 text-left"
              : "h-9",
          )}
          variant={args.value === option.value ? "default" : "outline"}
          onClick={() => args.onChange(option.value)}
        >
          {option.description ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-xs opacity-80">{option.description}</p>
            </div>
          ) : (
            option.label
          )}
        </Button>
      ))}
    </div>
  );
}

/**
 * Compact multi-select chip row shared by settings toggles that pick zero or
 * more values from a fixed option list (e.g. eligible models, setting
 * sources). Keeps every such control at the same visual density instead of
 * mixing bespoke button grids across sections.
 */
export function ToggleChipGroup<T extends string>(args: {
  options: ReadonlyArray<{ value: T; label: string; description?: string }>;
  selected: readonly T[];
  onToggle: (value: T) => void;
  allLabel?: string;
  onSelectAll?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {args.allLabel && args.onSelectAll ? (
        <Button
          type="button"
          variant={args.selected.length === 0 ? "default" : "outline"}
          size="sm"
          className="h-7 rounded-full px-3 text-xs"
          onClick={args.onSelectAll}
        >
          {args.allLabel}
        </Button>
      ) : null}
      {args.options.map((option) => {
        const active = args.selected.includes(option.value);
        const chip = (
          <Button
            key={option.value}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1 rounded-full px-3 text-xs"
            onClick={() => args.onToggle(option.value)}
          >
            {active ? <Check className="size-3" /> : null}
            <span className="max-w-40 truncate">{option.label}</span>
          </Button>
        );

        if (!option.description) {
          return chip;
        }

        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>{chip}</TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs">
              {option.description}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function LabeledField(args: {
  title: string;
  description?: string;
  children: ReactNode;
  guide?: ReactNode;
  layout?: "stacked" | "inline";
}) {
  return (
    <div
      className={cn(
        "gap-3",
        args.layout === "stacked"
          ? "space-y-1.5"
          : "grid items-start sm:grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.2fr)]",
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">{args.title}</p>
          {args.guide}
        </div>
        {args.description ? (
          <p className="text-sm text-muted-foreground">{args.description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{args.children}</div>
    </div>
  );
}

export function SwitchField(args: {
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  guide?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">{args.title}</p>
          {args.guide}
        </div>
        {args.description ? (
          <p className="text-sm text-muted-foreground">{args.description}</p>
        ) : null}
      </div>
      <Switch
        checked={args.checked}
        onCheckedChange={args.onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

export function SelectField<T extends string>(args: {
  title: string;
  description?: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  placeholder?: string;
  disabled?: boolean;
  guide?: ReactNode;
}) {
  return (
    <LabeledField
      title={args.title}
      description={args.description}
      guide={args.guide}
    >
      <Select
        value={args.value}
        disabled={args.disabled}
        onValueChange={(value) => args.onChange(value as T)}
      >
        <SelectTrigger className="h-9 w-full rounded-md border-border/80 bg-background">
          <SelectValue placeholder={args.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {args.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LabeledField>
  );
}

type SettingsGuideItem = {
  label: string;
  description: string;
};

type SettingsGuideExample = {
  label: string;
  description: string;
};

export function SettingsFieldGuide(args: {
  title: string;
  summary?: string;
  items?: SettingsGuideItem[];
  examples?: SettingsGuideExample[];
  note?: string;
  tooltip?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                aria-label={args.tooltip ?? `About ${args.title}`}
              >
                <CircleHelp className="size-3.5" />
              </Button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side={args.side ?? "top"}>
          {args.tooltip ?? "Show guidance"}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align={args.align ?? "start"}
        side={args.side ?? "top"}
        className="w-[24rem] max-w-[calc(100vw-2rem)] space-y-3"
      >
        <PopoverHeader className="space-y-1 px-0 py-0">
          <PopoverTitle className="text-sm">{args.title}</PopoverTitle>
          {args.summary ? (
            <PopoverDescription>{args.summary}</PopoverDescription>
          ) : null}
        </PopoverHeader>
        {args.items?.length ? (
          <div className="space-y-2">
            {args.items.map((item) => (
              <div
                key={item.label}
                className="space-y-1 rounded-md border border-border/70 bg-muted/20 px-3 py-2"
              >
                <p className="text-xs font-semibold tracking-wide text-foreground uppercase">
                  {item.label}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {args.examples?.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-foreground uppercase">
              Examples
            </p>
            {args.examples.map((example) => (
              <div key={example.label} className="space-y-1">
                <p className="text-xs font-medium text-foreground">
                  {example.label}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {example.description}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {args.note ? (
          <p className="text-xs leading-5 text-muted-foreground">{args.note}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

type DraftInputProps = Omit<
  ComponentPropsWithoutRef<typeof Input>,
  "value" | "defaultValue" | "onChange"
> & {
  value: string;
  onCommit: (value: string) => void;
};

export const DraftInput = memo(function DraftInput(args: DraftInputProps) {
  const { value, onCommit, onBlur, onKeyDown, ...inputProps } = args;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (nextValue: string) => {
    if (nextValue === value) {
      return;
    }
    onCommit(nextValue);
  };

  return (
    <Input
      {...inputProps}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit(event.target.value);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
        }
        onKeyDown?.(event);
      }}
    />
  );
});

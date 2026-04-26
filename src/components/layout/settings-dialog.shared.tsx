import { memo, useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import {
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
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function readInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function readFloat(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function SectionHeading(args: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-2xl font-semibold tracking-tight">{args.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{args.description}</p>
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
    <Card className={cn("border-border/80 bg-card/90 shadow-xs", args.className)}>
      <CardHeader className="pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{args.title}</CardTitle>
          {args.titleAccessory}
        </div>
        {args.description ? <CardDescription>{args.description}</CardDescription> : null}
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
  return (
    <div className={cn("grid gap-2", args.columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {args.options.map((option) => (
        <Button
          key={option.value}
          className={cn(
            "rounded-md",
            hasDescriptions
              ? "h-auto min-h-16 items-start justify-start whitespace-normal px-3 py-2.5 text-left"
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
          ) : option.label}
        </Button>
      ))}
    </div>
  );
}

export function LabeledField(args: {
  title: string;
  description?: string;
  children: ReactNode;
  guide?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">{args.title}</p>
          {args.guide}
        </div>
        {args.description ? <p className="text-sm text-muted-foreground">{args.description}</p> : null}
      </div>
      {args.children}
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
          {args.summary ? <PopoverDescription>{args.summary}</PopoverDescription> : null}
        </PopoverHeader>
        {args.items?.length ? (
          <div className="space-y-2">
            {args.items.map((item) => (
              <div key={item.label} className="space-y-1 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                <p className="text-xs font-semibold tracking-wide text-foreground uppercase">{item.label}</p>
                <p className="text-xs leading-5 text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        ) : null}
        {args.examples?.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-foreground uppercase">Examples</p>
            {args.examples.map((example) => (
              <div key={example.label} className="space-y-1">
                <p className="text-xs font-medium text-foreground">{example.label}</p>
                <p className="text-xs leading-5 text-muted-foreground">{example.description}</p>
              </div>
            ))}
          </div>
        ) : null}
        {args.note ? <p className="text-xs leading-5 text-muted-foreground">{args.note}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

type DraftInputProps = Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "defaultValue" | "onChange"> & {
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

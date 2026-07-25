import {
  createContext,
  memo,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check, CircleHelp } from "lucide-react";
import {
  Badge,
  Button,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import type {
  ToolingStatusState,
  WorkspaceSyncStatus,
} from "@/lib/tooling-status";
import { cn } from "@/lib/utils";

const SettingsControlLabelContext = createContext<string | null>(null);
const TOGGLE_ALL_VALUE = "__stave_toggle_all__";

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

export function SectionStack(args: { children: ReactNode }) {
  return <section className="flex flex-col">{args.children}</section>;
}

export function SettingsCard(args: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  titleAccessory?: ReactNode;
}) {
  const titleId = useId();

  return (
    <section
      className={cn(
        "border-t border-border/65 py-7 first:border-t-0 first:pt-0 last:border-b",
        args.className,
      )}
    >
      <header>
        <div className="flex items-start justify-between gap-3">
          <h3
            id={titleId}
            className="text-base font-semibold tracking-[-0.015em] text-foreground"
          >
            {args.title}
          </h3>
          {args.titleAccessory}
        </div>
        {args.description ? (
          <p className="mt-1.5 max-w-4xl text-sm leading-6 text-muted-foreground">
            {args.description}
          </p>
        ) : null}
      </header>
      <SettingsControlLabelContext.Provider value={titleId}>
        <div className="mt-5 space-y-5">{args.children}</div>
      </SettingsControlLabelContext.Provider>
    </section>
  );
}

export function ChoiceButtons<T extends string>(args: {
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  options: Array<{ value: T; label: string; description?: string }>;
  "aria-label"?: string;
}) {
  const hasDescriptions = args.options.some((option) => option.description);
  const labelledBy = useContext(SettingsControlLabelContext);

  return (
    <RadioGroup
      value={args.value}
      onValueChange={(value: T) => args.onChange(value)}
      aria-labelledby={labelledBy ?? undefined}
      aria-label={labelledBy ? undefined : (args["aria-label"] ?? "Setting")}
      className={cn(
        hasDescriptions
          ? "grid gap-2"
          : "inline-flex max-w-full flex-wrap rounded-md border border-border/80 bg-muted/30 p-0.5",
        hasDescriptions &&
          (args.columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"),
      )}
    >
      {args.options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={cn(
            "inline-flex shrink-0 cursor-default items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35 active:translate-y-px data-checked:bg-primary data-checked:text-primary-foreground data-checked:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--primary-foreground)_18%,transparent),0_1px_2px_oklch(0_0_0/0.14)] data-disabled:pointer-events-none data-disabled:opacity-45",
            hasDescriptions
              ? "h-auto min-h-14 items-start justify-start border-border/85 bg-background/55 px-4 py-3 text-left whitespace-normal data-unchecked:hover:border-primary/35 data-unchecked:hover:bg-accent/45"
              : "h-9 rounded-[5px] px-3.5 text-[13px] data-unchecked:text-muted-foreground data-unchecked:hover:bg-accent/55 data-unchecked:hover:text-accent-foreground",
          )}
        >
          {option.description ? (
            <div className="space-y-1">
              <p className="text-[15px] font-medium">{option.label}</p>
              <p className="text-sm opacity-75">{option.description}</p>
            </div>
          ) : (
            option.label
          )}
        </Radio.Root>
      ))}
    </RadioGroup>
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
  "aria-label"?: string;
}) {
  const labelledBy = useContext(SettingsControlLabelContext);
  const groupValue: string[] =
    args.allLabel && args.onSelectAll && args.selected.length === 0
      ? [TOGGLE_ALL_VALUE]
      : [...args.selected];

  const handleValueChange = (nextValue: string[]) => {
    const changedValue =
      nextValue.find((value) => !groupValue.includes(value)) ??
      groupValue.find((value) => !nextValue.includes(value));

    if (!changedValue) {
      return;
    }
    if (changedValue === TOGGLE_ALL_VALUE) {
      args.onSelectAll?.();
      return;
    }
    args.onToggle(changedValue as T);
  };

  return (
    <ToggleGroup
      multiple
      value={groupValue}
      onValueChange={handleValueChange}
      aria-labelledby={labelledBy ?? undefined}
      aria-label={labelledBy ? undefined : (args["aria-label"] ?? "Settings")}
      className="flex flex-wrap gap-1.5"
    >
      {args.allLabel && args.onSelectAll ? (
        <Toggle
          value={TOGGLE_ALL_VALUE}
          className="h-8 rounded-full border border-border/85 bg-background/55 px-3.5 text-[13px] text-foreground aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {args.allLabel}
        </Toggle>
      ) : null}
      {args.options.map((option) => {
        const active = args.selected.includes(option.value);
        const chip = (
          <Toggle
            key={option.value}
            value={option.value}
            className="h-8 gap-1 rounded-full border border-border/85 bg-background/55 px-3.5 text-[13px] text-foreground aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {active ? <Check className="size-3" /> : null}
            <span className="max-w-40 truncate">{option.label}</span>
          </Toggle>
        );

        if (!option.description) {
          return chip;
        }

        return (
          <Tooltip key={option.value}>
            <TooltipTrigger render={chip}></TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs">
              {option.description}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

export function LabeledField(args: {
  title: string;
  description?: string;
  children: ReactNode;
  guide?: ReactNode;
  layout?: "stacked" | "inline";
}) {
  const titleId = useId();

  return (
    <div
      className={cn(
        "gap-5",
        args.layout === "stacked"
          ? "space-y-2"
          : "grid items-start sm:grid-cols-[minmax(15rem,0.85fr)_minmax(20rem,1.15fr)]",
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <p id={titleId} className="text-[15px] font-medium">
            {args.title}
          </p>
          {args.guide}
        </div>
        {args.description ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {args.description}
          </p>
        ) : null}
      </div>
      <SettingsControlLabelContext.Provider value={titleId}>
        <div className="min-w-0">{args.children}</div>
      </SettingsControlLabelContext.Provider>
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
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div className="grid min-h-10 items-start gap-5 sm:grid-cols-[minmax(15rem,0.85fr)_minmax(20rem,1.15fr)]">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <p id={titleId} className="text-[15px] font-medium">
            {args.title}
          </p>
          {args.guide}
        </div>
        {args.description ? (
          <p
            id={descriptionId}
            className="text-sm leading-6 text-muted-foreground"
          >
            {args.description}
          </p>
        ) : null}
      </div>
      <Switch
        size="lg"
        checked={args.checked}
        onCheckedChange={args.onCheckedChange}
        aria-labelledby={titleId}
        aria-describedby={args.description ? descriptionId : undefined}
        className="mt-0.5 shrink-0 justify-self-start"
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
        <SelectTrigger className="h-10 w-full rounded-md border-border/75 bg-background text-sm">
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
        <TooltipTrigger render={<span className="inline-flex" />}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                aria-label={args.tooltip ?? `About ${args.title}`}
              />
            }
          >
            <CircleHelp className="size-3.5" />
          </PopoverTrigger>
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

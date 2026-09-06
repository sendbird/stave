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
import { Button } from "@/components/ads/components/Button";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { cx, sx } from "@/components/ads/utils/stylex";
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
import { settingsSharedStyles as styles } from "./settings-dialog.shared.styles";

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
  const toneStyle =
    args.state === "ready" || args.state === "synced"
      ? styles.statusBadgeReady
      : args.state === "warning" ||
          args.state === "behind" ||
          args.state === "ahead" ||
          args.state === "dirty"
        ? styles.statusBadgeWarning
        : styles.statusBadgeError;

  return (
    <Badge
      variant="secondary"
      className={sx(styles.statusBadge, toneStyle)}
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
    <div className={sx(styles.infoRow)}>
      <span className={sx(styles.infoRowLabel)}>{args.label}</span>
      <span
        className={sx(
          styles.infoRowValue,
          args.monospace && styles.infoRowValueMono,
        )}
      >
        {args.value ?? "-"}
      </span>
    </div>
  );
}

export function SectionStack(args: { children: ReactNode }) {
  return <section className={sx(styles.sectionStack)}>{args.children}</section>;
}

export function SettingsCard(args: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  titleAccessory?: ReactNode;
  id?: string;
  tabIndex?: number;
}) {
  const titleId = useId();

  return (
    <section
      id={args.id}
      tabIndex={args.tabIndex}
      aria-labelledby={titleId}
      className={cx(sx(styles.card, focusRing.ring), args.className)}
    >
      <header>
        <div className={sx(styles.cardHeaderRow)}>
          <h3 id={titleId} className={sx(styles.cardTitle)}>
            {args.title}
          </h3>
          {args.titleAccessory}
        </div>
        {args.description ? (
          <p className={sx(styles.cardDescription)}>{args.description}</p>
        ) : null}
      </header>
      <SettingsControlLabelContext.Provider value={titleId}>
        <div className={sx(styles.cardBody)}>{args.children}</div>
      </SettingsControlLabelContext.Provider>
    </section>
  );
}

/**
 * Optional leading mark for a choice.
 *
 * A separate field rather than a `ReactNode` label so the label stays a plain
 * string: it is what screen readers announce and what the layout truncates
 * against. Rendered inside a neutral plate because the checked state fills the
 * row with `primary`, and the vendor marks are fixed brand colors that would
 * otherwise sit directly on a saturated blue.
 */
function ChoiceMark(args: { children: ReactNode }) {
  return <span className={sx(styles.choiceMark)}>{args.children}</span>;
}

export function ChoiceButtons<T extends string>(args: {
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  options: Array<{
    value: T;
    label: string;
    description?: string;
    icon?: ReactNode;
  }>;
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
      className={sx(
        hasDescriptions ? styles.radioGroupGrid : styles.radioGroupInline,
        hasDescriptions &&
          (args.columns === 3
            ? styles.radioGroupGridCols3
            : styles.radioGroupGridCols2),
      )}
    >
      {args.options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={sx(
            styles.radio,
            focusRing.ring,
            hasDescriptions ? styles.radioCard : styles.radioSegment,
          )}
        >
          {option.description ? (
            <div className={sx(styles.radioContent)}>
              {option.icon ? <ChoiceMark>{option.icon}</ChoiceMark> : null}
              <div className={sx(styles.radioTextWrap)}>
                <p className={sx(styles.radioLabel)}>{option.label}</p>
                <p className={sx(styles.radioDescription)}>
                  {option.description}
                </p>
              </div>
            </div>
          ) : option.icon ? (
            <span className={sx(styles.radioInline)}>
              <ChoiceMark>{option.icon}</ChoiceMark>
              {option.label}
            </span>
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
      className={sx(styles.toggleGroup)}
    >
      {args.allLabel && args.onSelectAll ? (
        <Toggle value={TOGGLE_ALL_VALUE} className={sx(styles.toggle)}>
          {args.allLabel}
        </Toggle>
      ) : null}
      {args.options.map((option) => {
        const active = args.selected.includes(option.value);
        const chip = (
          <Toggle
            key={option.value}
            value={option.value}
            className={sx(styles.toggle, styles.toggleWithMark)}
          >
            {active ? <Check className={sx(styles.toggleCheck)} /> : null}
            <span className={sx(styles.toggleLabel)}>{option.label}</span>
          </Toggle>
        );

        if (!option.description) {
          return chip;
        }

        return (
          <Tooltip key={option.value}>
            <TooltipTrigger render={chip}></TooltipTrigger>
            <TooltipContent side="bottom" className={sx(styles.tooltipContent)}>
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
      className={sx(
        args.layout === "stacked" ? styles.fieldStacked : styles.fieldGrid,
      )}
    >
      <div className={sx(styles.fieldLabelBlock)}>
        <div className={sx(styles.fieldLabelRow)}>
          <p id={titleId} className={sx(styles.fieldTitle)}>
            {args.title}
          </p>
          {args.guide}
        </div>
        {args.description ? (
          <p className={sx(styles.fieldDescription)}>{args.description}</p>
        ) : null}
      </div>
      <SettingsControlLabelContext.Provider value={titleId}>
        <div className={sx(styles.fieldControl)}>{args.children}</div>
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
    <div className={sx(styles.switchRow)}>
      <div className={sx(styles.switchLabelBlock)}>
        <div className={sx(styles.fieldLabelRow)}>
          <p id={titleId} className={sx(styles.fieldTitle)}>
            {args.title}
          </p>
          {args.guide}
        </div>
        {args.description ? (
          <p id={descriptionId} className={sx(styles.fieldDescription)}>
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
        className={sx(styles.switchControl)}
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
        <SelectTrigger className={sx(styles.selectTrigger)}>
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
        <TooltipTrigger
          render={<span className={sx(styles.guideTriggerInline)} />}
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="quiet"
                size="xs"
                iconOnly
                xstyle={styles.guideTriggerIcon}
                aria-label={args.tooltip ?? `About ${args.title}`}
              />
            }
          >
            <CircleHelp className={sx(styles.guideIcon)} />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side={args.side ?? "top"}>
          {args.tooltip ?? "Show guidance"}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align={args.align ?? "start"}
        side={args.side ?? "top"}
        xstyle={styles.guidePopover}
      >
        <PopoverHeader className={sx(styles.guideHeader)}>
          <PopoverTitle className={sx(styles.guideTitle)}>
            {args.title}
          </PopoverTitle>
          {args.summary ? (
            <PopoverDescription>{args.summary}</PopoverDescription>
          ) : null}
        </PopoverHeader>
        {args.items?.length ? (
          <div className={sx(styles.guideList)}>
            {args.items.map((item) => (
              <div key={item.label} className={sx(styles.guideItem)}>
                <p className={sx(styles.guideItemLabel)}>{item.label}</p>
                <p className={sx(styles.guideItemDescription)}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {args.examples?.length ? (
          <div className={sx(styles.guideList)}>
            <p className={sx(styles.guideItemLabel)}>Examples</p>
            {args.examples.map((example) => (
              <div key={example.label} className={sx(styles.fieldLabelBlock)}>
                <p className={sx(styles.guideExampleLabel)}>{example.label}</p>
                <p className={sx(styles.guideItemDescription)}>
                  {example.description}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {args.note ? (
          <p className={sx(styles.guideNote)}>{args.note}</p>
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

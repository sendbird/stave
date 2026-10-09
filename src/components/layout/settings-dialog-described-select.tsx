import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { ExplainedSelectOption } from "./settings-dialog-effort-help";
import { providersStyles } from "./settings-dialog-providers-section.styles";

function findExplainedOption<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
  value: T,
) {
  return options.find((option) => option.value === value) ?? null;
}

/**
 * Select whose chosen option's description and example render below it.
 * Shared by the Providers runtime cards and the permission posture fields.
 */
export function DescribedSelect<T extends string>(args: {
  value: T;
  options: readonly ExplainedSelectOption<T>[];
  onValueChange: (value: T) => void;
  triggerClassName?: string;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const selected = findExplainedOption(args.options, args.value);
  const fallbackValue = args.options[0]?.value;
  const selectValue = selected?.value ?? fallbackValue;
  const triggerLabel = selected?.label ?? fallbackValue ?? args.value;

  return (
    <div className={sx(providersStyles.describedSelectRoot)}>
      <Select
        value={selectValue}
        onValueChange={(value) => args.onValueChange(value as T)}
      >
        <SelectTrigger
          className={
            args.triggerClassName ??
            sx(providersStyles.describedSelectTrigger)
          }
        >
          <SelectValue placeholder={triggerLabel} />
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          align="start"
          sideOffset={6}
          className={cx(
            UI_LAYER_CLASS.popover,
            sx(providersStyles.describedSelectContent),
          )}
        >
          {args.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              label={option.label}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected ? (
        <p className={sx(providersStyles.describedSelectHint)}>
          <span className={sx(providersStyles.describedSelectHintTerm)}>
            {selected.label}:
          </span>{" "}
          {selected.description}
          {selected.example ? t("settingsProviders:settingsDialogProvidersSection.example", { value1: selected.example }) : ""}
        </p>
      ) : null}
    </div>
  );
}

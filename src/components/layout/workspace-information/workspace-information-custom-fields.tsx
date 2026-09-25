import { Button as AdsButton } from "@/components/ads/components/Button";
import { CalendarIcon, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import {
  isWorkspaceInfoUrl,
  type WorkspaceInfoCustomField,
  updateWorkspaceInfoSelectFieldOptions,
} from "@/lib/workspace-information";
import { sx } from "@/components/ads/utils/stylex";
import { workspaceInformationPanelStyles as styles } from "../workspace-information-panel.styles";
import { openExternalUrl } from "./workspace-information-link-rows";

function CustomFieldDatePicker(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = props.value
    ? new Date(props.value + "T00:00:00")
    : undefined;
  const isValid = selected && !Number.isNaN(selected.getTime());

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            xstyle={[
              styles.datePickerTrigger,
              !props.value && styles.datePickerTriggerEmpty,
            ]}
          />
        }
      >
        <CalendarIcon className={sx(styles.datePickerIcon)} />
        {isValid
          ? selected.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "Pick a date"}
      </PopoverTrigger>
      <PopoverContent xstyle={styles.datePickerPopover} align="start">
        <Calendar
          value={isValid ? props.value : undefined}
          onDateSelect={(date) => props.onChange(date === props.value ? "" : date)}
        />
      </PopoverContent>
    </Popover>
  );
}

function SingleSelectOptionsInput(props: {
  field: WorkspaceInfoCustomField & { type: "single_select" };
  onFieldChange: (field: WorkspaceInfoCustomField) => void;
}) {
  const { field, onFieldChange } = props;
  const [rawValue, setRawValue] = useState(() => field.options.join(", "));
  const committedRef = useRef(field.options);

  // Sync if options changed externally
  useEffect(() => {
    const joined = field.options.join(", ");
    if (committedRef.current !== field.options) {
      committedRef.current = field.options;
      setRawValue(joined);
    }
  }, [field.options]);

  function commit(text: string) {
    const next = updateWorkspaceInfoSelectFieldOptions({
      field,
      rawValue: text,
    });
    committedRef.current = next.options;
    setRawValue(next.options.join(", "));
    onFieldChange(next);
  }

  // Filter out empty-string options — Radix Select crashes on value=""
  const validOptions = field.options.filter((opt) => opt.length > 0);
  const hasValidSelection =
    field.value.length > 0 && validOptions.includes(field.value);

  return (
    <div className={sx(styles.fieldStack)}>
      <Input
        xstyle={styles.control}
        value={rawValue}
        onChange={(event) => setRawValue(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit((event.target as HTMLInputElement).value);
          }
        }}
        placeholder="Options (comma-separated)"
      />
      <Select
        value={hasValidSelection ? field.value : undefined}
        onValueChange={(value) => onFieldChange({ ...field, value })}
      >
        <SelectTrigger className={sx(styles.controlBlock)}>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {validOptions.length === 0 ? (
            <SelectItem value="__empty__" disabled>
              No options defined
            </SelectItem>
          ) : (
            validOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export function renderCustomFieldInput(args: {
  field: WorkspaceInfoCustomField;
  onFieldChange: (field: WorkspaceInfoCustomField) => void;
}) {
  const { field, onFieldChange } = args;

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          xstyle={styles.controlTextarea}
          value={field.value}
          onChange={(event) =>
            onFieldChange({ ...field, value: event.target.value })
          }
          placeholder="Value"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          xstyle={styles.control}
          value={field.value ?? ""}
          onChange={(event) =>
            onFieldChange({
              ...field,
              value:
                event.target.value.trim() === ""
                  ? null
                  : Number(event.target.value),
            })
          }
          placeholder="Value"
        />
      );
    case "boolean":
      return (
        <div className={sx(styles.switchRow)}>
          <Switch
            checked={field.value}
            onCheckedChange={(checked) =>
              onFieldChange({ ...field, value: Boolean(checked) })
            }
            size="sm"
          />
          <span className={sx(styles.switchLabel)}>
            {field.value ? "Enabled" : "Disabled"}
          </span>
        </div>
      );
    case "date":
      return (
        <CustomFieldDatePicker
          value={field.value}
          onChange={(value) => onFieldChange({ ...field, value })}
        />
      );
    case "url":
      return (
        <div className={sx(styles.urlFieldRow)}>
          <Input
            xstyle={styles.controlFlex}
            value={field.value}
            onChange={(event) =>
              onFieldChange({ ...field, value: event.target.value })
            }
            placeholder="https://..."
          />
          {isWorkspaceInfoUrl(field.value) ? (
            <AdsButton
              layout="host"
              type="button"
              xstyle={styles.urlFieldOpen}
              onClick={() => openExternalUrl(field.value)}
              aria-label="Open link"
            >
              <ExternalLink className={sx(styles.glyphMd)} />
            </AdsButton>
          ) : null}
        </div>
      );
    case "single_select":
      return (
        <SingleSelectOptionsInput field={field} onFieldChange={onFieldChange} />
      );
    case "text":
    default:
      return (
        <Input
          xstyle={styles.control}
          value={field.value}
          onChange={(event) =>
            onFieldChange({ ...field, value: event.target.value })
          }
          placeholder="Value"
        />
      );
  }
}

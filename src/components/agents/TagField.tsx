import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { TextField } from "@/components/ads/components/TextField";
import { sx } from "@/components/ads/utils/stylex";
import { agentStyles } from "./agents.styles";

/**
 * A list of short string values shown as removable tags with an add field.
 * Used for tool allow/deny lists and skills. Values are trimmed and
 * de-duplicated; blanks are ignored.
 */
export function TagField(props: {
  label: string;
  values: readonly string[];
  placeholder?: string;
  maxLength?: number;
  onChange: (values: string[]) => void;
}) {
  useTranslation();
  const [entry, setEntry] = useState("");
  const add = () => {
    const value = entry.trim();
    if (!value) return;
    if (!props.values.includes(value)) props.onChange([...props.values, value]);
    setEntry("");
  };
  return (
    <div role="group" aria-label={props.label} className={sx(agentStyles.tags)}>
      {props.values.map((value) => (
        <span key={value} className={sx(agentStyles.tag)}>
          {value}
          <Button
            size="sm"
            variant="quiet"
            iconOnly
            aria-label={i18n.t("agents:tagField.ariaLabel", { value1: value })}
            xstyle={agentStyles.tagRemove}
            onClick={() => props.onChange(props.values.filter((candidate) => candidate !== value))}
          >
            <X aria-hidden />
          </Button>
        </span>
      ))}
      <span className={sx(agentStyles.tagInput)}>
        <TextField
          size="sm"
          controlOnly
          aria-label={i18n.t("agents:tagField.ariaLabel2", { value1: props.label })}
          placeholder={props.placeholder}
          value={entry}
          maxLength={props.maxLength}
          onChange={(event) => setEntry(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      </span>
    </div>
  );
}

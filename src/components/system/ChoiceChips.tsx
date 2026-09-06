import { focusRing } from "../ads/recipes/focus-ring";
import { transition } from "../ads/recipes/transition";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/** One ordered choice with a single Tab stop and native arrow-key selection. */
export function ChoiceChips<TValue>({
  label,
  options,
  value,
  onValueChange,
  disabled,
  testId,
}: {
  label: string;
  options: readonly { value: TValue; label: string; title?: string }[];
  value: TValue;
  onValueChange: (value: TValue) => void;
  disabled?: boolean;
  testId?: (value: TValue) => string;
}) {
  // Indices preserve the caller's value type, including its undefined/default
  // choice, without sending an uncontrolled value through RadioGroup.
  const selectedIndex = options.findIndex((option) =>
    Object.is(option.value, value),
  );
  return (
    <RadioGroup
      aria-label={label}
      value={selectedIndex}
      disabled={disabled}
      onValueChange={(index: number) => {
        const option = options[index];
        if (option) onValueChange(option.value);
      }}
      {...stylex.props(styles.group)}
    >
      {options.map((option, index) => (
        <Radio.Root
          key={String(option.value ?? "default")}
          value={index}
          title={option.title}
          data-testid={testId?.(option.value)}
          {...stylex.props(
            styles.choice,
            focusRing.ring, transition.control,
            selectedIndex === index && styles.selected,
          )}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

const styles = stylex.create({
  group: { display: "flex", flexWrap: "wrap", gap: vars.space4 },
  choice: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    minWidth: 44,
    minHeight: vars.controlHeightSm,
    paddingInline: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    fontSize: vars.fontSizeCaption,
    lineHeight: 1.3,
    color: vars.colorTextMuted,
    backgroundColor: { default: "transparent", ":hover": vars.colorSurfaceTint },
    cursor: "pointer",
    opacity: { default: 1, ":is([data-disabled])": 0.5 },
  },
  selected: {
    color: vars.colorText,
    fontWeight: 600,
    borderColor: vars.colorAccent,
    backgroundColor: vars.colorSurfaceTint,
  },
});

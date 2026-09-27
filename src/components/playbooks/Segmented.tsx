import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

/**
 * A small segmented choice (a radio group drawn as one pill), for picking one
 * of two to four short options: check-ins, permissions, repair attempts.
 */
export function Segmented<Value extends string>(props: {
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string; description?: string }>;
  onChange: (value: Value) => void;
  "aria-label": string;
  disabled?: boolean;
  size?: "xs" | "sm";
}) {
  const size = props.size ?? "sm";
  return (
    <div role="radiogroup" aria-label={props["aria-label"]} className={sx(styles.root)}>
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <Button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            size={size}
            variant={selected ? "secondary" : "quiet"}
            press="none"
            disabled={props.disabled}
            title={option.description}
            xstyle={[styles.item, selected && styles.itemSelected]}
            onClick={() => props.onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const index = props.options.findIndex((candidate) => candidate.value === props.value);
              const step = event.key === "ArrowRight" ? 1 : -1;
              const next = props.options[(index + step + props.options.length) % props.options.length]!;
              props.onChange(next.value);
              const group = event.currentTarget.parentElement;
              requestAnimationFrame(() => {
                group?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
              });
            }}
            tabIndex={selected ? 0 : -1}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: "inline-flex",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 2,
    padding: 2,
    borderRadius: vars["--ads-radius-control"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    maxWidth: "100%",
    flexWrap: "wrap",
  },
  item: {
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-text-muted"],
    boxShadow: "none",
  },
  itemSelected: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
    backgroundColor: vars["--ads-color-surface-raised"],
    boxShadow: vars["--ads-elevation-flat"],
  },
});

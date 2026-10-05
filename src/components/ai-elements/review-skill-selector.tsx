import { ChevronDown } from "lucide-react";
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";

export interface ReviewSkillOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
}

export function ReviewSkillSelector(args: {
  "aria-labelledby"?: string;
  value: string;
  options: readonly ReviewSkillOption[];
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = args.options.find((option) => option.value === args.value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            fullWidth
            aria-label={args["aria-labelledby"] ? undefined : "Review skill"}
            aria-labelledby={args["aria-labelledby"]}
            xstyle={styles.trigger}
          />
        }
      >
        <span className={sx(styles.label)}>{selected?.label ?? "No skill"}</span>
        <ChevronDown aria-hidden="true" className={sx(styles.chevron)} />
      </PopoverTrigger>
      <PopoverContent align="start" density="flush" xstyle={styles.popup}>
        {open ? (
          <Command>
            <CommandInput
              autoFocus
              aria-label="Search review skills"
              placeholder="Search skills…"
            />
            <CommandList className={sx(styles.list)}>
              <CommandEmpty>No skills found.</CommandEmpty>
              {args.options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value || "__no_skill__"}
                  keywords={[
                    option.label,
                    option.description ?? "",
                    ...(option.keywords ?? []),
                  ]}
                  onSelect={() => {
                    args.onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className={sx(styles.copy)}>
                    <span>{option.label}</span>
                    {option.description ? (
                      <span className={sx(styles.description)}>
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const styles = stylex.create({
  trigger: { justifyContent: "space-between", minWidth: 0 },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chevron: {
    width: 16,
    height: 16,
    flexShrink: 0,
    color: vars["--ads-color-text-muted"],
  },
  popup: {
    width: "var(--anchor-width)",
    maxWidth: "var(--available-width)",
    overflow: "hidden",
  },
  list: { maxHeight: "min(17.5rem, calc(var(--available-height) - 4rem))" },
  copy: {
    display: "grid",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
});

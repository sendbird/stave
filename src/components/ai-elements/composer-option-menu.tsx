import type { ReactNode } from "react";
import { Check, Info, TriangleAlert } from "lucide-react";

import { Button, Switch } from "@/components/ui";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import { cn } from "@/lib/utils";

/**
 * The shared vocabulary of a composer control's configuration menu.
 *
 * Advisor and Worker ask the same three questions in the same order — arm it,
 * pick a target, pick an effort — and the provider-mode pill asks the first
 * two. They are different features, so their *options* stay in their own
 * files; what lives here is the shape those options are poured into, so the
 * two menus cannot drift into looking like two different products (which is
 * how the model lists ended up capped at different heights).
 */

/** Popover body geometry. Width stays with the caller: the menus differ in content. */
export const COMPOSER_OPTION_MENU_CONTENT = "gap-2 p-2";

/** Every option list scrolls at the same height. */
const COMPOSER_OPTION_LIST = "max-h-52 space-y-0.5 overflow-y-auto";

export function ComposerOptionMenuToggle(props: {
  id: string;
  title: string;
  description: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
      <label htmlFor={props.id} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-none">{props.title}</span>
        <span className="text-[11px] leading-4 text-muted-foreground">
          {props.description}
        </span>
      </label>
      <Switch
        id={props.id}
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        data-testid={props.testId}
      />
    </div>
  );
}

export function ComposerOptionMenuSection(props: {
  title: string;
  children: ReactNode;
  /** Set when the section's rows scroll rather than sit in a grid or row. */
  scroll?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn("space-y-1 border-t border-border/60 pt-2", props.className)}
      data-testid={props.testId}
    >
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {props.title}
      </p>
      {props.scroll ? (
        <div className={COMPOSER_OPTION_LIST}>{props.children}</div>
      ) : (
        props.children
      )}
    </div>
  );
}

/**
 * A two-line choice: what it is, and what picking it does. Used where the
 * options are strategies (Advisor provider, Worker preset, provider mode)
 * rather than a list of names.
 */
export function ComposerOptionCard(props: {
  label: string;
  summary?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  active: boolean;
  onSelect: () => void;
  testId?: string;
  /** Active styling for modes that carry their own tone (plan, accept-edits, ...). */
  activeClassName?: string;
  /** Matching tone for the selected mark. */
  checkClassName?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={props.active}
      data-testid={props.testId}
      className={cn(
        "h-auto min-h-11 w-full justify-start gap-2 rounded-lg border px-2.5 py-2 text-left whitespace-normal",
        props.active
          ? (props.activeClassName ??
            "border-primary/30 bg-primary/10 hover:bg-primary/14")
          : "border-transparent hover:border-border/70 hover:bg-muted/60",
      )}
      onClick={props.onSelect}
    >
      {props.icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-none">{props.label}</span>
        {props.summary ? (
          <span className="text-[11px] leading-4 text-muted-foreground">
            {props.summary}
          </span>
        ) : null}
        {props.description ? (
          <span className="text-xs leading-4 text-muted-foreground">
            {props.description}
          </span>
        ) : null}
      </span>
      {props.active ? (
        <Check
          className={cn(
            "size-3.5 shrink-0 self-start",
            props.checkClassName ?? "text-primary",
          )}
        />
      ) : null}
    </Button>
  );
}

/**
 * One model in a list of models. Denser than an option card because the rows
 * are names the user scans, and the icon is the anchor rather than a
 * distinction — it matches the main model list they already read.
 */
export function ComposerOptionModelRow(props: {
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  active: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={props.active}
      data-testid={props.testId}
      className={cn(
        "h-auto min-h-8 w-full justify-start gap-2 rounded-md px-2.5 py-1.5 text-left text-sm whitespace-normal",
        props.active && "bg-muted/70",
      )}
      onClick={props.onSelect}
    >
      {props.icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{props.label}</span>
        {props.description ? (
          <span className="truncate text-[11px] leading-4 text-muted-foreground">
            {props.description}
          </span>
        ) : null}
      </span>
      {props.active ? (
        <Check className="size-3.5 shrink-0 text-primary" />
      ) : null}
    </Button>
  );
}

export interface ComposerEffortOption<TValue> {
  value: TValue;
  label: string;
  title?: string;
}

/** The effort row: equal-width chips, because they are one ordered scale. */
export function ComposerOptionEffortChips<TValue>(props: {
  options: readonly ComposerEffortOption<TValue>[];
  selected: TValue;
  onSelect: (value: TValue) => void;
  testId?: (value: TValue) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {props.options.map((option) => {
        const isActive = props.selected === option.value;
        return (
          <Button
            key={String(option.value ?? "auto")}
            type="button"
            variant="ghost"
            title={option.title}
            aria-pressed={isActive}
            data-testid={props.testId?.(option.value)}
            className={cn(
              "h-7 min-w-11 flex-1 justify-center rounded-md border px-2 text-xs",
              isActive
                ? "border-primary/30 bg-primary/10 font-medium text-foreground hover:bg-primary/14"
                : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/60",
            )}
            onClick={() => props.onSelect(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

/** Explanatory line under a section. */
export function ComposerOptionMenuHint(props: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <p
      className="px-1 text-[11px] leading-4 text-muted-foreground"
      data-testid={props.testId}
    >
      {props.children}
    </p>
  );
}

/** A boxed remark: neutral for context, warning for something that will bite. */
export function ComposerOptionMenuCallout(props: {
  tone: "note" | "warning";
  children: ReactNode;
  testId?: string;
}) {
  const Icon = props.tone === "warning" ? TriangleAlert : Info;
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs leading-5",
        props.tone === "warning"
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border/70 bg-muted/40 text-muted-foreground",
      )}
      data-testid={props.testId}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{props.children}</span>
    </p>
  );
}

/**
 * The last line of every one of these menus: the per-task control ends here,
 * and the durable defaults live in Settings.
 */
export function ComposerOptionMenuSettingsLink(props: {
  children: ReactNode;
  section: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      className="px-1 text-left text-[11px] leading-4 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
            detail: { section: props.section },
          }),
        );
      }}
    >
      {props.children}
    </button>
  );
}

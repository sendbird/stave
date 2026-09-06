import { optionStyles } from "./composer-option.styles";
import { sx } from "../ads/utils/stylex";
import { Button as AdsButton } from "@/components/ads/components/Button";
import type { ReactNode } from "react";
import { Check, Info, TriangleAlert } from "lucide-react";

import { Switch } from "@/components/ui";
import { ChoiceChips } from "@/components/system/ChoiceChips";
import { OptionButton } from "@/components/system/OptionButton";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import { cx } from "../ads/utils/stylex";

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
export const COMPOSER_OPTION_MENU_CONTENT = optionStyles.menu;

/** Every option list scrolls at the same height. */
const COMPOSER_OPTION_LIST = sx(optionStyles.list);

export function ComposerOptionMenuToggle(props: {
  id: string;
  title: string;
  description: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <div className={sx(optionStyles.toggle)}>
      <label
        htmlFor={props.id}
        className={sx(optionStyles.label)}
      >
        <span className={sx(optionStyles.title)}>{props.title}</span>
        <span className={sx(optionStyles.detail)}>
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
      className={cx(
        sx(optionStyles.section),
        props.className,
      )}
      data-testid={props.testId}
    >
      <p className={sx(optionStyles.sectionTitle)}>
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
    <AdsButton
      layout="host"
      type="button"
      variant="quiet"
      aria-pressed={props.active}
      data-testid={props.testId}
      className={cx(
        sx(optionStyles.choice, props.active && !props.activeClassName && optionStyles.selected),
        props.active && props.activeClassName,
      )}
      onClick={props.onSelect}
    >
      {props.icon}
      <span className={sx(optionStyles.label)}>
        <span className={sx(optionStyles.title)}>{props.label}</span>
        {props.summary ? (
          <span className={sx(optionStyles.detail)}>
            {props.summary}
          </span>
        ) : null}
        {props.description ? (
          <span className={sx(optionStyles.description)}>
            {props.description}
          </span>
        ) : null}
      </span>
      {props.active ? (
        <Check
          className={cx(
            sx(
              optionStyles.check,
              !props.checkClassName && optionStyles.selectedCheck,
            ),
            props.checkClassName,
          )}
        />
      ) : null}
    </AdsButton>
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
    <OptionButton
      type="button"
      density="compact"
      selected={props.active}
      data-testid={props.testId}
      onClick={props.onSelect}
    >
      {props.icon}
      <span className={sx(optionStyles.modelLabel)}>
        <span className={sx(optionStyles.truncated)}>{props.label}</span>
        {props.description ? (
          <span className={sx(optionStyles.truncated, optionStyles.detail)}>
            {props.description}
          </span>
        ) : null}
      </span>
      {props.active ? (
        <Check className={sx(optionStyles.modelCheck)} />
      ) : null}
    </OptionButton>
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
    <ChoiceChips
      label="Reasoning effort"
      options={props.options}
      value={props.selected}
      onValueChange={props.onSelect}
      testId={props.testId}
    />
  );
}

/** Explanatory line under a section. */
export function ComposerOptionMenuHint(props: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <p
      className={sx(optionStyles.hint)}
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
      className={cx(
        sx(optionStyles.callout, props.tone === "warning" && optionStyles.warning),
      )}
      data-testid={props.testId}
    >
      <Icon className={sx(optionStyles.calloutIcon)} />
      <span className={sx(optionStyles.calloutBody)}>{props.children}</span>
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
    <AdsButton layout="host"
      type="button"
      data-testid={props.testId}
      className={sx(optionStyles.settingsLink)}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
            detail: { section: props.section },
          }),
        );
      }}
    >
      {props.children}
    </AdsButton>
  );
}

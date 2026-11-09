import { useTranslation } from "@/i18n";
import { optionStyles } from "./composer-option.styles";
import { styles as selectStyles } from "../aui/recipes/select-styles";
import { sx } from "../aui/utils/stylex";
import { Button as AuiButton } from "@/components/aui/components/Button";
import type { ReactNode } from "react";
import { Check, Info, TriangleAlert } from "lucide-react";

import { RadioRoot } from "@/components/aui/headless/radio-group";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { transition } from "@/components/aui/recipes/transition";
import { questionOptionRowStyles as radioMark } from "./question-option-row.styles";
import { cx } from "../aui/utils/stylex";
import type { Tone } from "@/components/aui/utils/tone";

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

export function ComposerOptionMenuSection(props: {
  title: string;
  children: ReactNode;
  /** Set when the section's rows scroll rather than sit in a grid or row. */
  scroll?: boolean;
  className?: string;
  testId?: string;
}) {
  useTranslation();
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
 *
 * Geometry is AUI's two-line item recipe — see `optionStyles.rowReset` for why
 * the local box it replaced could not place the trailing check.
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
}) {
  useTranslation();
  return (
    <AuiButton
      layout="host"
      type="button"
      variant="quiet"
      aria-pressed={props.active}
      data-testid={props.testId}
      className={props.active ? props.activeClassName : undefined}
      xstyle={[
        optionStyles.rowReset,
        selectStyles.item,
        props.active && !props.activeClassName && optionStyles.selected,
      ]}
      onClick={props.onSelect}
    >
      <ComposerOptionRowCopy
        description={props.description}
        icon={props.icon}
        label={props.label}
        summary={props.summary}
      />
      {props.active ? (
        <span className={sx(selectStyles.itemIndicator)}>
          <Check className={sx(optionStyles.check, optionStyles.selectedCheck)} />
        </span>
      ) : null}
    </AuiButton>
  );
}

/**
 * `ComposerOptionCard` as one radio of a `RadioGroupRoot`: the same two-line
 * row, with a radio mark where the card has its check. The group gives the
 * list one Tab stop and arrow keys that move the radio; the row keeps the
 * card's tone when checked.
 */
export function ComposerOptionRadioCard(props: {
  value: string;
  /** Whether the group's value is this row; draws the radio's dot. */
  checked: boolean;
  label: string;
  summary?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Chosen styling for options that carry their own tone. */
  activeClassName?: string;
  /** Picking the row: a pointer click, Space, or Enter (a radio ignores Enter on its own). */
  onChoose?: () => void;
  testId?: string;
}) {
  useTranslation();
  return (
    <RadioRoot
      value={props.value}
      data-testid={props.testId}
      onClick={props.onChoose}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        props.onChoose?.();
      }}
      className={(state) =>
        cx(
          sx(
            optionStyles.rowReset,
            selectStyles.item,
            transition.colors,
            focusRing.ring,
            state.checked && !props.activeClassName && optionStyles.selected,
          ),
          state.checked ? props.activeClassName : undefined,
        ) ?? ""
      }
    >
      <ComposerOptionRowCopy
        description={props.description}
        icon={props.icon}
        label={props.label}
        summary={props.summary}
      />
      {/* The same radio mark a question's single-choice option leads with. */}
      <span aria-hidden className={sx(selectStyles.itemIndicator)}>
        <span className={sx(radioMark.radio, props.checked && radioMark.radioChecked)}>
          {props.checked ? <span className={sx(radioMark.radioDot)} /> : null}
        </span>
      </span>
    </RadioRoot>
  );
}

/**
 * The copy column of an option row: leading icon and title on one line, then
 * whatever explains them. Two nested spans and not one, because the outer is
 * the row's first grid TRACK (`itemText`) and the inner is the stack inside it
 * (`itemCopy`, which supplies the line gap the flush two-line rows were
 * missing) — the same anatomy `Select` renders.
 */
function ComposerOptionRowCopy(props: {
  description?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  summary?: ReactNode;
}) {
  useTranslation();
  return (
    <span className={sx(selectStyles.itemText)}>
      <span className={sx(selectStyles.itemCopy)}>
        <span className={sx(selectStyles.itemLabelLine)}>
          {props.icon ? (
            <span className={sx(selectStyles.itemLeadingIcon)}>
              {props.icon}
            </span>
          ) : null}
          <span className={sx(selectStyles.itemLabel, optionStyles.rowTitle)}>
            {props.label}
          </span>
        </span>
        {props.summary ? (
          <span className={sx(selectStyles.itemDescription)}>
            {props.summary}
          </span>
        ) : null}
        {props.description ? (
          <span className={sx(selectStyles.itemDescription)}>
            {props.description}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * One model in a list of models — the same row as `ComposerOptionCard`, minus
 * the strategy framing.
 *
 * It used to be the denser `OptionButton density="compact"`: 6px of block
 * padding, no gap between the two lines, and a 1px accent ring drawn straight
 * around them, which is why a two-line entry ("Auto" + what it resolves to)
 * read as cramped and ringed rather than chosen. On the shared recipe the
 * chosen row is marked the way the rest of the system marks one — accent ink
 * plus the trailing check, over the selection fill — and the description gets
 * the recipe's own line gap.
 */
export function ComposerOptionModelRow(props: {
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  active: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  useTranslation();
  return (
    <AuiButton
      layout="host"
      type="button"
      variant="quiet"
      aria-pressed={props.active}
      data-testid={props.testId}
      xstyle={[
        optionStyles.rowReset,
        selectStyles.item,
        props.active && optionStyles.selected,
      ]}
      onClick={props.onSelect}
    >
      <ComposerOptionRowCopy
        description={props.description}
        icon={props.icon}
        label={props.label}
      />
      {props.active ? (
        <span className={sx(selectStyles.itemIndicator)}>
          <Check className={sx(optionStyles.check, optionStyles.selectedCheck)} />
        </span>
      ) : null}
    </AuiButton>
  );
}

/** Explanatory line under a section. */
export function ComposerOptionMenuHint(props: {
  children: ReactNode;
  testId?: string;
}) {
  useTranslation();
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
  tone: Extract<Tone, "info" | "warning">;
  children: ReactNode;
  testId?: string;
}) {
  useTranslation();
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

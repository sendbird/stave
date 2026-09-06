import { controlStyles } from "./composer-control.stylex";
import { sx } from "../ads/utils/stylex";
import type { ReactNode } from "react";

import {
  COMPOSER_CONTROL_LANE,
  ComposerControlDensityProvider,
} from "@/components/ai-elements/composer-control-density";
import { cx } from "../ads/utils/stylex";

export interface ComposerControlMenuItem {
  id: string;
  label: string;
  node: ReactNode;
  /** The control shows no label of its own, so the list has to supply one. */
  iconOnly?: boolean;
}

/**
 * Both overflow menus — the in-card toolbar's `⋯` and the bottom shelf's —
 * hang off a composer control and portal dialogs of their own, so they share
 * one surface: composer-anchored chrome that must not paint over the dialog it
 * just opened (hence `layer="floatingChrome"` at both call sites).
 */
export const COMPOSER_CONTROL_MENU_CONTENT = controlStyles.menu;

/**
 * A demoted control, stacked.
 *
 * Position carries the meaning in a horizontal toolbar; in a vertical list it
 * does not, so every row is full width, left-aligned and — for controls that
 * are a bare glyph in the row they came from — captioned. That layout is the
 * `menu` lane's job, which is why the list wraps each item identically instead
 * of letting the icon-only ones take a different shape.
 */
export function ComposerControlMenuList(props: {
  items: readonly ComposerControlMenuItem[];
  className?: string;
}) {
  return (
    <ComposerControlDensityProvider value="default">
      <div
        data-composer-control-menu="true"
        className={cx(
          sx(controlStyles.menuList),
          COMPOSER_CONTROL_LANE.menu,
          props.className,
        )}
      >
        {props.items.map((item) => (
          <div key={item.id} data-composer-control-menu-item={item.id} className={sx(controlStyles.menuRow)}>
            {item.node}
            {item.iconOnly ? (
              // Decorative: the control is already named for assistive tech,
              // but a stacked glyph needs a visible caption.
              <span aria-hidden="true" className={sx(controlStyles.menuLabel)}>
                {item.label}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </ComposerControlDensityProvider>
  );
}

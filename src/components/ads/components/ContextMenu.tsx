import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import type * as React from "react";

import {
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuPortal,
  ContextMenuPositioner,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuSubmenuRoot,
  ContextMenuSubmenuTrigger,
  ContextMenuTrigger,
  type ContextMenuRootProps,
} from "../headless/context-menu";
import { focusRing } from "../recipes/focus-ring";
import { menu } from "../recipes/menu";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import {
  Menu,
  type MenuCheckboxItemProps,
  type MenuRadioItemProps,
} from "./Menu";

/**
 * `className` on a Base UI part may be a string or a `(state) => string`
 * callback. Merge Atelier's base styles with a caller-supplied `className` of
 * either shape, preserving the state argument.
 */
type ClassNameProp<State> =
  | string
  | undefined
  | ((state: State) => string | undefined);

function mergeClassName<State>(
  base: (state: State) => string | undefined,
  className: ClassNameProp<State>,
): (state: State) => string | undefined {
  return (state) =>
    cx(
      base(state),
      typeof className === "function" ? className(state) : className,
    );
}

// ---------------------------------------------------------------------------
// Compound parts (compositional ContextMenu API). Styled wrappers over the
// Base UI `headless/context-menu` parts, sharing the `recipes/menu` styling
// with Menu/DropdownMenu. Items default to `itemKind="default"` (arrow cursor)
// because a context menu opens on right-click, not on a pointer target.
// ---------------------------------------------------------------------------

export type ContextMenuRootCompoundProps = React.ComponentProps<
  typeof ContextMenuRoot
>;

function Root(props: ContextMenuRootCompoundProps) {
  return <ContextMenuRoot {...props} />;
}

export type ContextMenuTriggerProps = React.ComponentProps<
  typeof ContextMenuTrigger
>;

/**
 * The right-clickable area. Unstyled passthrough — the trigger is the caller's
 * own surface (a canvas, row, card, …), not a button. The array API's dashed
 * demo panel is array-API-only chrome.
 */
function Trigger(props: ContextMenuTriggerProps) {
  return <ContextMenuTrigger {...props} />;
}

export type ContextMenuPortalProps = React.ComponentProps<
  typeof ContextMenuPortal
>;

function Portal(props: ContextMenuPortalProps) {
  return <ContextMenuPortal {...props} />;
}

export type ContextMenuPositionerProps = React.ComponentProps<
  typeof ContextMenuPositioner
>;

function Positioner({ className, ...props }: ContextMenuPositionerProps) {
  return (
    <ContextMenuPositioner
      {...props}
      className={mergeClassName(() => sx(menu.positioner), className)}
    />
  );
}

export type ContextMenuPopupProps = React.ComponentProps<
  typeof ContextMenuPopup
>;

function Popup({ className, ...props }: ContextMenuPopupProps) {
  return (
    <ContextMenuPopup
      {...props}
      className={mergeClassName(
        () =>
          cx(sx(menu.popup, menu.popupTransform), "atelier-motion-dropdown"),
        className,
      )}
    />
  );
}

export type ContextMenuGroupProps = React.ComponentProps<
  typeof ContextMenuGroup
>;

function Group({ className, ...props }: ContextMenuGroupProps) {
  return (
    <ContextMenuGroup
      {...props}
      className={mergeClassName(() => sx(menu.group), className)}
    />
  );
}

export type ContextMenuGroupLabelProps = React.ComponentProps<
  typeof ContextMenuGroupLabel
>;

function GroupLabel({ className, ...props }: ContextMenuGroupLabelProps) {
  return (
    <ContextMenuGroupLabel
      {...props}
      className={mergeClassName(() => sx(menu.groupLabel), className)}
    />
  );
}

export type ContextMenuItemProps = React.ComponentProps<
  typeof ContextMenuItem
> & {
  tone?: "danger" | "default";
};

function Item({ className, tone = "default", ...props }: ContextMenuItemProps) {
  return (
    <ContextMenuItem
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            menu.item,
            transition.colors,
            menu.itemDefault,
            state.highlighted && menu.itemHighlighted,
            tone === "danger" && menu.itemDanger,
            state.disabled && menu.itemDisabled,
          ),
        className,
      )}
    />
  );
}

export type ContextMenuSeparatorProps = React.ComponentProps<
  typeof ContextMenuSeparator
>;

function SeparatorPart({ className, ...props }: ContextMenuSeparatorProps) {
  return (
    <ContextMenuSeparator
      {...props}
      className={mergeClassName(() => sx(menu.separator), className)}
    />
  );
}

export type ContextMenuSubmenuRootProps = React.ComponentProps<
  typeof ContextMenuSubmenuRoot
>;

function SubmenuRoot(props: ContextMenuSubmenuRootProps) {
  return <ContextMenuSubmenuRoot {...props} />;
}

export type ContextMenuSubmenuTriggerProps = React.ComponentProps<
  typeof ContextMenuSubmenuTrigger
>;

function SubmenuTrigger({
  className,
  ...props
}: ContextMenuSubmenuTriggerProps) {
  return (
    <ContextMenuSubmenuTrigger
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            menu.item,
            menu.itemDefault,
            state.highlighted && menu.itemHighlighted,
            state.disabled && menu.itemDisabled,
          ),
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Checkable parts.
//
// `@base-ui/react/context-menu` re-exports Menu's own `CheckboxItem` /
// `RadioGroup` / `RadioItem` — they are the SAME components, so these are thin
// wrappers over the already-styled `Menu` parts rather than a second styling of
// the same recipe. The only thing that differs is the pointer default: a
// context menu opens on right-click, so its rows use `itemKind="default"` (the
// arrow cursor) exactly as `ContextMenu.Item` above does.
//
// They were missing entirely while `Menu`, `DropdownMenu` and `Menubar` all
// shipped them, which is backwards — a right-click menu is the surface where a
// checkable row ("Show gridlines", "Snap to grid") is most idiomatic, and a
// consumer who wanted one had to drop to raw Base UI and restyle it.
// ---------------------------------------------------------------------------

export type ContextMenuCheckboxItemProps = MenuCheckboxItemProps;

function CheckboxItem({
  itemKind = "default",
  ...props
}: ContextMenuCheckboxItemProps) {
  return <Menu.CheckboxItem {...props} itemKind={itemKind} />;
}

export type ContextMenuRadioItemProps = MenuRadioItemProps;

function RadioItem({
  itemKind = "default",
  ...props
}: ContextMenuRadioItemProps) {
  return <Menu.RadioItem {...props} itemKind={itemKind} />;
}

const compoundParts = {
  Root,
  Trigger,
  Portal,
  Positioner,
  Popup,
  Group,
  GroupLabel,
  Item,
  Separator: SeparatorPart,
  SubmenuRoot,
  SubmenuTrigger,
  CheckboxItem,
  // The indicators and the radio group carry no pointer default of their own —
  // an indicator is a glyph and a radio group is a value container — so they
  // are Menu's parts verbatim rather than a wrapper that only forwards.
  CheckboxItemIndicator: Menu.CheckboxItemIndicator,
  RadioGroup: Menu.RadioGroup,
  RadioItem,
  RadioItemIndicator: Menu.RadioItemIndicator,
  Shortcut: Menu.Shortcut,
} as const;

// ---------------------------------------------------------------------------
// Array (back-compat convenience) API — re-implemented on the compound parts
// ---------------------------------------------------------------------------

export type ContextMenuItemConfig = {
  disabled?: boolean;
  icon?: React.ReactNode;
  label: React.ReactNode;
  onSelect?: () => void;
  shortcut?: string;
  /** Nested actions rendered in a real Base UI submenu. */
  submenu?: ContextMenuItemConfig[];
  tone?: "default" | "danger";
};

export type ContextMenuGroupConfig = {
  items: ContextMenuItemConfig[];
  label?: string;
};

export type ContextMenuProps = Omit<ContextMenuRootProps, "children"> & {
  children: React.ReactNode;
  groups: ContextMenuGroupConfig[];
};

/**
 * Renders array-config groups as compound `Item`/`Group` parts. Shared by the
 * array API and by components that embed a context menu around their own
 * surfaces (e.g. `Tree` rows).
 */
export function ContextMenuGroups({
  groups,
}: {
  groups: ContextMenuGroupConfig[];
}) {
  // Leading 18px cell only when this menu level uses icons. A recursively
  // rendered icon-less submenu therefore stays flush-left, while sibling
  // groups in the same popup retain their shared alignment.
  const hasIcons = groups.some((group) =>
    group.items.some((item) => item.icon),
  );

  return (
    <>
      {groups.map((group, groupIndex) => {
        return (
          <Group key={group.label ?? groupIndex}>
            {group.label ? <GroupLabel>{group.label}</GroupLabel> : null}
            {group.items.map((item, itemIndex) => {
              const content = (
                <>
                  {hasIcons ? (
                    <span className={sx(menu.itemIcon)}>{item.icon}</span>
                  ) : null}
                  <span className={sx(menu.itemLabel)}>{item.label}</span>
                  {item.shortcut ? (
                    <Menu.Shortcut>{item.shortcut}</Menu.Shortcut>
                  ) : null}
                  {item.submenu?.length ? (
                    <ChevronRight
                      aria-hidden
                      className={sx(menu.chevron)}
                      size={14}
                    />
                  ) : null}
                </>
              );
              const key = `${group.label ?? groupIndex}-${itemIndex}`;
              return item.submenu?.length ? (
                <SubmenuRoot key={key}>
                  <SubmenuTrigger disabled={item.disabled}>
                    {content}
                  </SubmenuTrigger>
                  <Portal>
                    <Positioner sideOffset={4}>
                      <Popup>
                        <ContextMenuGroups groups={[{ items: item.submenu }]} />
                      </Popup>
                    </Positioner>
                  </Portal>
                </SubmenuRoot>
              ) : (
                <Item
                  disabled={item.disabled}
                  key={key}
                  onClick={item.onSelect}
                  tone={item.tone}
                >
                  {content}
                </Item>
              );
            })}
            {groupIndex < groups.length - 1 ? <SeparatorPart /> : null}
          </Group>
        );
      })}
    </>
  );
}

function ContextMenuArray({ children, groups, ...props }: ContextMenuProps) {
  return (
    <Root {...props}>
      <Trigger className={sx(styles.trigger, focusRing.ring)}>
        {children}
      </Trigger>
      <Portal>
        <Positioner>
          <Popup>
            <ContextMenuGroups groups={groups} />
          </Popup>
        </Positioner>
      </Portal>
    </Root>
  );
}

/**
 * ContextMenu supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<ContextMenu groups={[…]}>…</ContextMenu>`
 * - **Compound (compositional):**
 *   `<ContextMenu.Root><ContextMenu.Trigger>…</ContextMenu.Trigger>…</ContextMenu.Root>`
 * - **Nested actions:** array items accept `submenu`; compound consumers can
 *   use `ContextMenu.SubmenuRoot` / `ContextMenu.SubmenuTrigger` directly.
 * - **Checkable rows:** `ContextMenu.CheckboxItem` and
 *   `ContextMenu.RadioGroup` / `ContextMenu.RadioItem`, with
 *   `ContextMenu.Shortcut` for the trailing accelerator hint.
 *
 * The compound namespace is attached via `Object.assign`, so both call styles
 * resolve through the same `ContextMenu` export.
 */
export const ContextMenu = Object.assign(ContextMenuArray, compoundParts);

const styles = stylex.create({
  trigger: {
    alignItems: "center",
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    display: "grid",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    inlineSize: "min(360px, 100%)",
    justifyItems: "center",
    lineHeight: vars.lineHeightNormal,
    minBlockSize: 168,
    padding: vars.space20,
    textAlign: "center",
    // No transition: this demo drop-zone has a single flat resting state (a
    // context menu opens on right-click and leaves its trigger untouched), so
    // the three transition declarations that used to sit here animated
    // properties that never change.
    userSelect: "none",
  },
});

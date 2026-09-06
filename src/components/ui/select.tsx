import { sx } from "../ads/utils/stylex";
import { overlayLayout } from "./overlay-layout.styles";
import { Select as AdsSelect } from "../ads/components/Select";
"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";

import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react";

type SelectProps<Value> = Omit<
  SelectPrimitive.Root.Props<Value, false>,
  "multiple" | "onValueChange"
> & {
  onValueChange?: (
    value: Value,
    eventDetails: SelectPrimitive.Root.ChangeEventDetails,
  ) => void;
};

function inferSelectItems(children: React.ReactNode) {
  const items: Array<{ label: React.ReactNode; value: unknown }> = [];

  function visit(node: React.ReactNode) {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement<SelectPrimitive.Item.Props>(child)) {
        return;
      }
      if (child.type === SelectItem) {
        items.push({
          label: child.props.children,
          value: child.props.value,
        });
        return;
      }
      visit(child.props.children);
    });
  }

  visit(children);
  return items;
}

function Select<Value = string>({
  children,
  items,
  onValueChange,
  ...props
}: SelectProps<Value>) {
  // Radix resolved the selected ItemText automatically. Base UI intentionally
  // requires Root.items, so infer the same label map for our JSX-based API.
  const inferredItems = React.useMemo(
    () => (items === undefined ? inferSelectItems(children) : undefined),
    [children, items],
  );

  return (
    <SelectPrimitive.Root
      data-slot="select"
      items={items ?? inferredItems}
      {...props}
      onValueChange={(value, eventDetails) => {
        if (value !== null) {
          onValueChange?.(value, eventDetails);
        }
      }}
    >
      {children}
    </SelectPrimitive.Root>
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <AdsSelect.Group
      data-slot="select-group"
      className={className}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <AdsSelect.Value
      data-slot="select-value"
      className={className}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
}) {
  return (
    <AdsSelect.Trigger
      data-slot="select-trigger"
      data-size={size}
      size={size === "sm" ? "sm" : "md"}
      className={className}
      {...props}
    >
      {children}
      <AdsSelect.Icon
        render={
          <ChevronDownIcon className={sx(overlayLayout.selectArrow)} />
        }
      />
    </AdsSelect.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  collisionBoundary,
  collisionPadding,
  sticky,
  positionMethod,
  collisionAvoidance,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "alignItemWithTrigger"
    | "collisionBoundary"
    | "collisionPadding"
    | "sticky"
    | "positionMethod"
    | "collisionAvoidance"
  >) {
  return (
    <AdsSelect.Portal>
      <AdsSelect.Positioner
        data-ui-popup-positioner=""
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        sticky={sticky}
        positionMethod={positionMethod}
        collisionAvoidance={collisionAvoidance}
        className={UI_LAYER_CLASS.popover}
      >
        <AdsSelect.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={className}
          {...props}
        >
          <SelectScrollUpButton />
          <AdsSelect.List className={sx(overlayLayout.selectList)}>
            {children}
          </AdsSelect.List>
          <SelectScrollDownButton />
        </AdsSelect.Popup>
      </AdsSelect.Positioner>
    </AdsSelect.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <AdsSelect.GroupLabel
      data-slot="select-label"
      className={className}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <AdsSelect.Item
      data-slot="select-item"
      className={className}
      {...props}
    >
      <AdsSelect.ItemText className={sx(overlayLayout.selectLabel)}>
        {children}
      </AdsSelect.ItemText>
      <AdsSelect.ItemIndicator
        render={
          <span className={sx(overlayLayout.selectIndicator)} />
        }
      >
        <CheckIcon className={sx(overlayLayout.decorative)} />
      </AdsSelect.ItemIndicator>
    </AdsSelect.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <AdsSelect.Separator
      data-slot="select-separator"
      className={className}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <AdsSelect.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={className}
      {...props}
    >
      <ChevronUpIcon />
    </AdsSelect.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <AdsSelect.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={className}
      {...props}
    >
      <ChevronDownIcon />
    </AdsSelect.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

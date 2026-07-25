import { describe, expect, test } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { TooltipContent } from "@/components/ui/tooltip";

type ElementWithChildren = ReactElement<{
  children?: ReactNode;
  className?: string;
  sideOffset?: number;
}>;

function getPopup(element: ElementWithChildren) {
  const positioner = element.props.children as ElementWithChildren;
  return positioner.props.children as ElementWithChildren;
}

describe("popup layout primitives", () => {
  test("dropdown popup expands beyond icon anchors without escaping the viewport", () => {
    const popup = getPopup(
      DropdownMenuContent({ children: "Menu content" }) as ElementWithChildren,
    );

    expect(popup.props.className).toContain("w-max");
    expect(popup.props.className).toContain(
      "min-w-[max(8rem,var(--anchor-width))]",
    );
    expect(popup.props.className).toContain(
      "max-w-[min(var(--available-width),calc(100vw-1rem))]",
    );
  });

  test("explicit menu widths override intrinsic sizing without losing the viewport cap", () => {
    const popup = getPopup(
      DropdownMenuContent({
        children: "Menu content",
        className: "w-52",
      }) as ElementWithChildren,
    );

    expect(popup.props.className).toContain("w-52");
    expect(popup.props.className).not.toContain("w-max");
    expect(popup.props.className).toContain(
      "max-w-[min(var(--available-width),calc(100vw-1rem))]",
    );
  });

  test("select popup follows the same anchor and viewport sizing contract", () => {
    const popup = getPopup(
      SelectContent({ children: "Select content" }) as ElementWithChildren,
    );

    expect(popup.props.className).toContain("w-max");
    expect(popup.props.className).toContain(
      "min-w-[max(8rem,var(--anchor-width))]",
    );
    expect(popup.props.className).toContain(
      "max-w-[min(var(--available-width),calc(100vw-1rem))]",
    );
  });

  test("menu and select items occupy and left-align the popup row", () => {
    const menuItem = DropdownMenuItem({
      children: "Inspect attachment",
    }) as ElementWithChildren;
    const selectItem = SelectItem({
      children: "A model name that can be truncated",
      value: "model",
    }) as ElementWithChildren;
    const contextMenuItem = ContextMenuItem({
      children: "Copy path",
    }) as ElementWithChildren;

    expect(menuItem.props.className).toContain("w-full");
    expect(menuItem.props.className).toContain("min-w-0");
    expect(menuItem.props.className).toContain("text-left");
    expect(selectItem.props.className).toContain("w-full");
    expect(selectItem.props.className).toContain("min-w-0");
    expect(selectItem.props.className).toContain("text-left");
    expect(contextMenuItem.props.className).toContain("w-full");
    expect(contextMenuItem.props.className).toContain("text-left");

    const menuItemLabel = (menuItem.props.children as ElementWithChildren[])[0];
    expect(menuItemLabel.props.className).toContain("flex-1");
    expect(menuItemLabel.props.className).toContain("truncate");

    const selectItemText = (
      selectItem.props.children as ElementWithChildren[]
    )[0];
    expect(selectItemText.props.className).toContain("min-w-0");
    expect(selectItemText.props.className).toContain("truncate");
  });

  test("select list owns one shared inset for grouped and ungrouped options", () => {
    const popup = getPopup(
      SelectContent({ children: "Select content" }) as ElementWithChildren,
    );
    const popupChildren = popup.props.children as ElementWithChildren[];
    const list = popupChildren[1];

    expect(list.props.className).toContain("w-full");
    expect(list.props.className).toContain("p-1");
  });

  test("tooltips clear the trigger border by default", () => {
    const tooltip = TooltipContent({
      children: "Reference details",
    }) as ElementWithChildren;
    const positioner = tooltip.props.children as ElementWithChildren;

    expect(positioner.props.sideOffset).toBe(8);
  });
});

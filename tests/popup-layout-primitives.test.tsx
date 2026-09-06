import { sx } from "@/components/ads/utils/stylex";
import { overlayLayout } from "@/components/ui/overlay-layout.styles";
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
  // Popup geometry and row alignment are verified in popup-layout.e2e.ts.
  test("select list owns one shared inset for grouped and ungrouped options", () => {
    const popup = getPopup(
      SelectContent({ children: "Select content" }) as ElementWithChildren,
    );
    const popupChildren = popup.props.children as ElementWithChildren[];
    const list = popupChildren[1];

    expect(list.props.className).toBe(sx(overlayLayout.selectList));
    expect(list.props.children).toBe("Select content");
  });

  test("tooltips clear the trigger border by default", () => {
    const tooltip = TooltipContent({
      children: "Reference details",
    }) as ElementWithChildren;
    const positioner = tooltip.props.children as ElementWithChildren;

    expect(positioner.props.sideOffset).toBe(8);
  });
});

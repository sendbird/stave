import { describe, expect, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ContextMenu as AdsContextMenu } from "@/components/ads/components/ContextMenu";
import { DropdownMenu as AdsDropdownMenu } from "@/components/ads/components/DropdownMenu";
import { menu } from "@/components/ads/recipes/menu";
import { sx } from "@/components/ads/utils/stylex";
import { UI_LAYER_CLASS, UI_LAYER_VALUE } from "@/lib/ui-layers";

// Base UI menu parts refuse to render outside `Menu.Portal`, and a portal is a
// no-op under `react-dom/server` (this repo has no DOM harness), so the popup
// never appears in server markup. The shim's tree is inspected as React
// elements instead, which is where the regressions below actually live.
function findElement(
  node: React.ReactNode,
  match: (element: React.ReactElement) => boolean,
): React.ReactElement | null {
  if (!React.isValidElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findElement(child, match);
        if (found) return found;
      }
    }
    return null;
  }
  if (match(node)) return node;
  const props = node.props as { children?: React.ReactNode };
  return findElement(props.children, match);
}

function partOf(tree: React.ReactNode, part: unknown) {
  const element = findElement(tree, (candidate) => candidate.type === part);
  if (!element) throw new Error("part not found in shim tree");
  return element.props as Record<string, unknown>;
}

/** Resolve a Base UI `className` prop, which may be a state callback. */
function resolveClassName(value: unknown, state: unknown = {}) {
  return typeof value === "function"
    ? (value as (s: unknown) => string | undefined)(state) ?? ""
    : ((value as string | undefined) ?? "");
}

/**
 * The class an ADS part would put on its Base UI child, without rendering that
 * child.
 *
 * `Menu.Popup` reads the menu density from context now, so it can no longer be
 * invoked as a plain function; and its Base UI child refuses to render outside
 * `Menu.Portal` / `Menu.Positioner`, which are no-ops under `react-dom/server`.
 * Calling the part inside another component's body is what satisfies both: the
 * hook resolves against the probe's own render, and the element it returns is
 * inspected rather than mounted.
 */
function classNameOf(part: unknown, props: Record<string, unknown>) {
  let resolved = "";
  function Probe() {
    const element = (part as (p: unknown) => React.ReactElement)(props);
    resolved = resolveClassName(
      (element.props as { className?: unknown }).className,
    );
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  return resolved;
}

const popupClasses = sx(menu.popup).split(" ").filter(Boolean);

describe.each([
  [
    "dropdown",
    DropdownMenuContent,
    DropdownMenuItem,
    "dropdown-menu-content",
    AdsDropdownMenu,
  ],
  [
    "context",
    ContextMenuContent,
    ContextMenuItem,
    "context-menu-content",
    AdsContextMenu,
  ],
])("ui/%s-menu shim popup surface", (_name, Content, Item, slot, AdsMenu) => {
  // The shim components are plain functions; call one to get the element tree
  // it would render (no hooks involved on this path).
  const tree = (Content as (props: unknown) => React.ReactElement)({
    children: <Item>Only</Item>,
  });

  test("routes the popup through the ADS Menu.Popup surface recipe", () => {
    const popup = partOf(tree, AdsMenu.Popup);
    expect(popup["data-slot"]).toBe(slot);

    // `AdsMenu.Popup` is what carries `menu.popup` (the themed
    // `colorSurfaceRaised` fill, the hairline border, `radiusPanel`,
    // `elevationOverlay`) plus the ADS open/close motion class. A shim that
    // renders a bare Base UI popup, or overrides the class instead of
    // composing it, is the regression this pins.
    const rendered = classNameOf(AdsMenu.Popup, popup).split(" ");
    for (const cls of popupClasses) expect(rendered).toContain(cls);
    expect(rendered).toContain("atelier-motion-dropdown");
  });

  test("pins the positioner to the popover band inline", () => {
    const positioner = partOf(tree, AdsMenu.Positioner);
    // The layer class stays on for `uiLayerClassesAtOrAbove` occlusion
    // detection...
    expect(positioner.className).toBe(UI_LAYER_CLASS.popover);
    // ...but it cannot be the only declaration: `Menu.Positioner` string-joins
    // its own `menu.positioner` (`zIndex: zIndexDropdown` = 60) with the
    // caller's class, and a string join cannot resolve two competing StyleX
    // `z-index` rules — ADS's 60 wins, dropping the menu below the `dialog`
    // (80) and `popover` (90) bands. An inline value outranks every class.
    expect(positioner.style).toEqual({ zIndex: UI_LAYER_VALUE.popover });
    expect(UI_LAYER_VALUE.popover).toBeGreaterThan(UI_LAYER_VALUE.dialog);
  });
});

import {
  themeFocusProperties,
  themeSpaceProperties,
  themeSurfaceProperties,
  themeTypographyProperties,
} from "./theme-contract";
import type { ThemeTargetRegistry } from "./theme-target-types";

/** Paint + text, the allowance a part that owns a surface gets. */
const surface = [
  ...themeSurfaceProperties,
  ...themeTypographyProperties,
] as const;

/** A region that owns its own box: its surface and its internal air. */
const region = [...surface, ...themeSpaceProperties] as const;

/** A control: a region that also takes the keyboard focus ring. */
const control = [...region, ...themeFocusProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/** A drawn bar or block — a separator, a skeleton bar, a scroll thumb. */
const mark = ["backgroundColor", "borderRadius", "opacity"] as const;

/**
 * The shell family: the application frame, the navigation rail, and the
 * bounded work surfaces (`ScrollArea`, `PanelGroup`, `SplitPane`,
 * `CanvasViewport`, `CappedViewport`).
 *
 * **Why the rail is one target with slots and not twenty.** `Sidebar` publishes
 * more parts than any other composition in ADS, and almost all of them are
 * boxes that share the `<nav>`'s canvas and only ever move with it — a header
 * grid, a scrolling content column, a group, a `<ul>`, an `<li>`. A brand that
 * wants a different rail wants one rule with refinements, not fifteen targets
 * whose relationship it has to reconstruct. Every one of those parts is also
 * always rendered INSIDE the `<nav>`, which is what makes the scoped slot
 * selector reach it in the first place.
 *
 * **What still gets its own target, and the mechanical reason.** A slot carries
 * a property list and nothing else — no axes, no states. So a rail part that
 * paints a `:hover` wash, takes the focus ring, or switches on a `size` /
 * `variant` prop cannot be expressed as one: `sidebar-menu-button`,
 * `sidebar-menu-sub-button`, `sidebar-group-action`, `sidebar-menu-action`,
 * `sidebar-input`, `sidebar-search` and `sidebar-rail` are targets because they
 * are controls. `sidebar-trigger` is a target for a second reason on top of
 * that: it is routinely rendered OUTSIDE the rail, in an `AppShell` chrome band
 * (`useClaimShellChromeSidebarTrigger`), where a `.ads-sidebar` slot rule would
 * never reach it. `sidebar-inset` is the workspace region BESIDE the rail, so
 * it is not a descendant either.
 *
 * **`AppShell` is a layout frame, and its themeable surface is small.** The
 * shell grid paints the ground, one hairline and the corner; the raised body
 * surface and the scrolling content region are the only two parts a brand has
 * ever needed to address, so they are the only two slots. The header/rail slot
 * wrappers are placement boxes for whatever the app put in them — that content
 * carries its own paint, and a slot there would be a permanent handle on a
 * `<div>` that exists only to hold a grid track.
 */
export const shellThemeTargets = {
  "app-shell": {
    exports: ["AppShell"],
    /*
     * No space allowance. The shell is a grid whose tracks are the app rail,
     * the frame and the header rows; padding here would move the rail off the
     * window edge it is deliberately flush to (`shellWithAppRail`).
     */
    properties: surface,
    root: "the `<div>` `AppShell` renders as the shell grid",
    slots: {
      /* The raised body surface, its hairline, corner and lift. */
      frame: surface,
      /* The scrolling main region — the one part of the shell with padding. */
      content: region,
    },
  },
  "canvas-viewport": {
    exports: ["CanvasViewport"],
    /*
     * `backgroundImage` earns its place here: the dotted grid that gives
     * panning visible feedback is a background layer, so a brand changes the
     * canvas texture through the same property the component draws it with.
     */
    properties: control,
    root: "the `role=\"application\"` `<div>` `CanvasViewport` renders",
    states: ["focus-visible"],
  },
  "capped-viewport": {
    exports: ["CappedViewport"],
    /*
     * Paint only, and deliberately no space: the fade is a `maxBlockSize`-tall
     * mask anchored to the scroll box, so padding inside the box offsets the
     * content against the band it is measured against — the "faded before it
     * overflows" bug this component exists to prevent.
     */
    properties: ["backgroundColor", "borderRadius", "color", "opacity"],
    root: "the `role=\"log\"` scroll box `CappedViewport` renders",
  },
  "page-header": {
    exports: ["PageHeader", "PageHeaderMetaItem"],
    properties: region,
    root: "the `<header>` `PageHeader` renders",
    slots: {
      description: ink,
      "meta-item": ink,
      title: ink,
    },
  },
  "panel-group": {
    exports: ["PanelGroup"],
    properties: surface,
    root: "the `<div>` `PanelGroup` renders as the panel grid",
    /*
     * No `handle` slot. The separator's focus answer is an accent bar owned by
     * `recipes/resize-handle`, chosen because a 1px-wide control inside an
     * `overflow: hidden` surface has nowhere to paint a ring; handing a brand a
     * selector on it would invite exactly the outline that was measured to be
     * invisible there.
     */
    slots: { panel: region },
  },
  "resizable-panel": {
    exports: ["ResizablePanel"],
    properties: region,
    root: "the `<section>` `ResizablePanel` renders",
    slots: {
      body: region,
      description: ink,
      footer: region,
      header: region,
      title: ink,
    },
  },
  "scroll-area": {
    exports: ["ScrollArea"],
    properties: surface,
    root: "the Base UI scroll-area root element",
    slots: {
      content: region,
      /* The track and the thumb, which is what a brand actually reaches for. */
      scrollbar: mark,
      thumb: mark,
    },
  },
  sidebar: {
    axes: {
      density: ["comfortable", "compact"],
      variant: ["floating", "inset", "sidebar"],
    },
    exports: [
      "Sidebar",
      "SidebarContent",
      "SidebarFooter",
      "SidebarGroup",
      "SidebarGroupContent",
      "SidebarGroupLabel",
      "SidebarHeader",
      "SidebarMenu",
      "SidebarMenuBadge",
      "SidebarMenuInitial",
      "SidebarMenuItem",
      "SidebarMenuSkeleton",
      "SidebarMenuSub",
      "SidebarMenuSubItem",
      "SidebarSeparator",
    ],
    properties: region,
    root: "the `<nav>` `Sidebar` renders",
    slots: {
      content: region,
      footer: region,
      group: region,
      "group-content": region,
      /*
       * Both forms of the section heading: the standalone `SidebarGroupLabel`
       * and the label span inside a collapsible group's own trigger. A brand
       * that restyled only one of them would ship a rail whose headings changed
       * weight depending on whether the group happened to collapse.
       */
      "group-label": [...ink, ...themeSpaceProperties],
      header: region,
      menu: region,
      "menu-badge": ink,
      /* A real painted mark — subtle fill, corner, muted ink. */
      "menu-initial": surface,
      "menu-item": region,
      "menu-skeleton": region,
      /*
       * The placeholder bars, not the row that holds them. Without these the
       * skeleton slot addresses a box with no paint of its own, which is the
       * one part of a loading rail a brand can see.
       */
      "menu-skeleton-bar": mark,
      "menu-sub": region,
      "menu-sub-item": region,
      separator: mark,
    },
  },
  "sidebar-group-action": {
    exports: ["SidebarGroupAction"],
    properties: control,
    root: "the `<button>` (or the caller's `asChild` element) `SidebarGroupAction` renders",
    states: ["hover", "active", "focus-visible"],
  },
  "sidebar-input": {
    exports: ["SidebarInput"],
    properties: control,
    root: "the `<input>` `SidebarInput` renders",
    states: ["hover", "focus-visible", "disabled"],
  },
  "sidebar-inset": {
    exports: ["SidebarInset"],
    properties: region,
    root: "the `<div>` `SidebarInset` renders as the workspace region beside the rail",
  },
  "sidebar-menu-action": {
    exports: ["SidebarMenuAction"],
    properties: control,
    root: "the `<button>` (or the caller's `asChild` element) `SidebarMenuAction` renders",
    states: ["hover", "active", "focus-visible"],
  },
  "sidebar-menu-button": {
    axes: {
      size: ["sm", "md", "lg"],
      variant: ["default", "outline"],
    },
    exports: ["SidebarMenuButton"],
    properties: control,
    root: "the `<a>`, `<button>` or `asChild` element the sidebar row renders",
    slots: {
      /*
       * The row's own parts. `description` is the secondary identity line, and
       * it must stay the quieter of the two in every state — which is a rule
       * about ink, so a brand gets the ink and not the row's fill.
       */
      description: ink,
      /* The glyph box. It paints nothing of its own; what it carries is ink. */
      icon: ["color", "opacity"],
      label: ink,
    },
    /*
     * No `active`. The rail's rows paint one wash for hover and press
     * (`sidebarItem`), on purpose — a separate pressed fill was never drawn, so
     * a generated `:active` rule would be the only thing in the file claiming
     * one exists.
     */
    states: ["hover", "focus-visible", "disabled"],
  },
  "sidebar-menu-sub-button": {
    axes: { size: ["sm", "md"] },
    exports: ["SidebarMenuSubButton"],
    properties: control,
    root: "the `<a>`, `<button>` or `asChild` element the nested sidebar row renders",
    slots: { label: ink },
    states: ["hover", "focus-visible", "disabled"],
  },
  "sidebar-rail": {
    /*
     * One target for the rail's 8px trailing strip, which `SidebarRail` (a
     * collapse toggle) and `SidebarResizeHandle` (a width separator) each
     * render. They cannot coexist — the component docs say to pick one per rail
     * because they share the edge — so this is one part with two
     * implementations, not two parts.
     *
     * No focus properties, deliberately. Both spell `outlineStyle: "none"` and
     * answer focus with an accent bar instead, because the `<nav>` keeps
     * `overflow: hidden` for its collapse transition and a ring on a strip
     * flush to that clip was measured to be 100% invisible. Publishing an
     * outline allowance here would sell a focus cue that cannot render.
     */
    exports: ["SidebarRail", "SidebarResizeHandle"],
    properties: surface,
    root: "the 8px trailing-edge strip — the `<button>` `SidebarRail` renders, or the `role=\"separator\"` `<div>` `SidebarResizeHandle` renders in its place",
    states: ["hover", "focus-visible"],
  },
  "sidebar-search": {
    /*
     * The search CONTROL, which is a different element in each rail state: an
     * `<input>` while expanded, and an icon `<button>` in the collapsed rail,
     * where there is no width for a field. One name for both, so a brand's rule
     * does not silently stop applying when the reader collapses the rail.
     */
    exports: ["SidebarSearch"],
    properties: control,
    root: "the `<input>` the expanded rail renders, or the `<button>` the collapsed icon rail renders in its place",
    states: ["hover", "active", "focus-visible"],
  },
  "sidebar-trigger": {
    /*
     * `size` is the RESOLVED control size — omitted, it follows the nearest
     * rail's density. It is reflected because this control is the one rail part
     * that is routinely hosted elsewhere (a `Topbar`, an app's mobile bar), and
     * there the axis is the only thing that says which rung it is on.
     */
    axes: { size: ["xs", "sm", "md"] },
    exports: ["SidebarTrigger"],
    properties: control,
    root: "the `<button>` `SidebarTrigger` renders",
    states: ["hover", "active", "focus-visible"],
  },
  "split-pane": {
    exports: ["SplitPane"],
    properties: surface,
    root: "the `<div>` `SplitPane` renders as the split grid",
  },
  topbar: {
    exports: ["Topbar"],
    properties: region,
    root: "the `<header>` `Topbar` renders",
    slots: { title: ink },
  },
  "workspace-layout": {
    exports: ["WorkspaceLayout"],
    properties: surface,
    root: "the `<div>` `WorkspaceLayout` renders as the container-query root",
    /*
     * The regions, because the quiet dividers between them are region borders
     * rather than a separator element — a brand changing the seam has to reach
     * the region that draws it.
     */
    slots: {
      inspector: region,
      primary: region,
      rail: region,
    },
  },
} as const satisfies ThemeTargetRegistry;

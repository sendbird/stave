import {
  themeFocusProperties,
  themeSpaceProperties,
  themeSurfaceProperties,
  themeTypographyProperties,
} from "./theme-contract";
import type { ThemeTargetRegistry } from "./theme-target-types";

/** Paint + text, the allowance a target that owns a surface gets. */
const surface = [
  ...themeSurfaceProperties,
  ...themeTypographyProperties,
] as const;

/** A part that owns its surface, its text, and its own internal air. */
const chrome = [...surface, ...themeSpaceProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/** A hand-rolled control: chrome plus the ring it has to keep. */
const control = [...chrome, ...themeFocusProperties] as const;

/**
 * Content: type, code, and the read-only surfaces that render machine output.
 *
 * Two shapes recur here and both are decided the same way — a target exists
 * where a brand needs a selector.
 *
 * 1. **A mono surface paints, its contents set their own type.** `CodeBlock`,
 *    `DiffViewer`, `Terminal`, `LogViewer` and `StackTrace` all draw a panel
 *    and then hand the type to a `<pre>` or a row that declares its own
 *    `fontFamily`/`fontSize`. Those roots get `themeSurfaceProperties` and not
 *    `surface`: a `fontFamily` on the panel is overridden one element down, and
 *    a generated rule that changes no pixel is not support. The type lives on
 *    the slot that actually declares it.
 * 2. **A row group's parts are slots, not targets.** They share the panel's
 *    surface and only ever move with it, so a brand that wants a different log
 *    viewer wants one rule with refinements — `card`'s reasoning, one family
 *    over.
 */
export const contentThemeTargets = {
  "aspect-ratio": {
    axes: { variant: ["plain", "frame"] },
    exports: ["AspectRatio"],
    /*
     * Paint only. The box is a media well whose whole job is to hold a
     * declared ratio, so internal air would inset the media the ratio was
     * measured for; `xstyle` owns that at the call site.
     */
    properties: [...themeSurfaceProperties],
    root: "the `<div>` `AspectRatio` renders",
  },
  carousel: {
    exports: [
      "Carousel",
      "CarouselContent",
      "CarouselItem",
      "CarouselNext",
      "CarouselPrevious",
    ],
    properties: [...themeSurfaceProperties],
    root: "the `<div role=\"region\">` `Carousel` renders",
    slots: {
      /*
       * `CarouselPrevious` / `CarouselNext` are `Button`s and keep
       * `.ads-button`; the slot exists because the carousel overrides their
       * radius and placement itself, so a brand needs the same reach the
       * component already took.
       */
      control: [...themeSurfaceProperties, ...themeFocusProperties],
      /** One slide's own box. */
      slide: [...themeSurfaceProperties],
      /** The scroll-snap viewport, whose gap is the slide gutter. */
      viewport: [...themeSpaceProperties],
    },
  },
  citation: {
    exports: ["Citation"],
    properties: [...chrome],
    root: "the `<span>`, `<a>` or popover-trigger `<button>` the inline mark renders",
    states: ["hover", "focus-visible"],
  },
  "citation-list": {
    exports: ["CitationList"],
    /*
     * The section itself is a grid that paints nothing today, so its allowance
     * is paint and air only — the type belongs to the three ink registers
     * below, each of which declares its own.
     */
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: "the `<section>` `Citation.List` renders",
    slots: {
      /** The rung-3 evidence panel behind the disclosure. */
      panel: [...themeSurfaceProperties, ...themeSpaceProperties],
      /** One source row — a link or a static span, never a `Button`. */
      row: [...chrome],
      /** The disclosure control; hand-rolled from `inlineDisclosure`. */
      trigger: [...control],
    },
  },
  /*
   * Portalled beside the mark, so it cannot be one of `citation`'s slots: a
   * slot selector is scoped under the target's class and the popup leaves that
   * subtree. Its class is applied directly, `dialog-backdrop`-style, which is
   * why it claims no export of its own — `Citation` is the mark.
   */
  "citation-popup": {
    exports: [],
    properties: [...chrome],
    root: "the Base UI popover popup the inline mark opens",
    slots: {
      excerpt: ink,
      title: ink,
    },
  },
  "clamp-text": {
    exports: ["ClampText"],
    /*
     * Ink, because the clamped copy declares no type of its own: what the
     * root sets is what the reader gets. `rowGap` is the air between the copy
     * and its reveal control, which is the one box this component owns.
     */
    properties: [...ink, "rowGap"],
    root: "the `<div>` `ClampText` renders",
  },
  "code-block": {
    exports: ["CodeBlock"],
    properties: [...themeSurfaceProperties],
    root: "the `<figure>` `CodeBlock` renders",
    slots: {
      /** The `<pre>`, or the wrapper a host `highlighter`'s output sits in. */
      code: [...ink, ...themeSpaceProperties],
      header: [...chrome],
      "line-number": ink,
    },
  },
  "diff-viewer": {
    exports: ["DiffViewer"],
    /*
     * The one mono surface that does own its type: the rows are grids with no
     * face of their own and inherit the root's `fontFamily`/`fontSize`.
     */
    properties: [...surface],
    root: "the `<div role=\"group\">` `DiffViewer` renders",
    slots: {
      /*
       * The collapsed-context affordance. A raw `<button>` rather than a
       * `Button`, so `.ads-button` has never reached it.
       */
      expand: [...control],
      "line-number": ink,
    },
  },
  heading: {
    /*
     * `level` verbatim. `display` is a visual step above level 1 and is
     * deliberately not an axis value: it is a boolean prop, and inventing
     * `data-size="display"` for it would be ADS naming a value the caller
     * never wrote.
     */
    axes: { size: ["1", "2", "3", "4"] },
    exports: ["Heading"],
    properties: [...ink],
    root: "the `<h1>`–`<h4>` `Heading` renders",
  },
  "inline-code": {
    exports: ["InlineCode"],
    properties: [...chrome],
    root: "the `<code>` `InlineCode` renders",
  },
  "json-viewer": {
    exports: ["JsonViewer"],
    /*
     * Type included: the tree's rows and literals inherit the root's mono
     * face, and only the value inks are token-driven.
     */
    properties: [...chrome],
    root: "the `<div role=\"group\">` `JsonViewer` renders",
    slots: {
      /** The copy-path control, a raw `<button>` outside `.ads-button`. */
      copy: [...themeSurfaceProperties, ...themeFocusProperties],
      /** An object key or array index label. */
      key: ink,
    },
  },
  kbd: {
    axes: { size: ["sm", "md"] },
    exports: ["Kbd"],
    properties: [...chrome],
    root: "the `<kbd>` `Kbd` renders",
  },
  "log-viewer": {
    exports: ["LogViewer"],
    /*
     * The class sits on the scroller, not on the outer wrapper: the wrapper is
     * a positioning context for the resume pill and paints nothing, so a
     * brand's `background-color` on it would be covered by the scroller's own.
     * The cost is that the find toolbar and the resume pill sit outside the
     * target — both are composed from parts that carry their own.
     */
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: 'the scrolling `<div role="log">` that draws the log panel',
    slots: {
      /** The expanded `<pre>` payload under a row. */
      detail: [...chrome],
      /** The level chip — the only part of a row carrying status color. */
      level: [...chrome],
      row: [...chrome],
    },
  },
  prose: {
    exports: ["Prose"],
    /*
     * Root only, and no slots. Prose sets ink metrics for arbitrary HTML the
     * CONSUMER authors — its headings, lists and paragraphs are never rendered
     * by ADS, so there is no element to hang `data-ads-slot` on. Inheritance
     * is the mechanism: what the section declares is what the subtree reads.
     * `rowGap` is the block rhythm, which the section does own.
     */
    properties: [...ink, "rowGap"],
    root: "the `<section>` `Prose` renders",
  },
  "stack-trace": {
    exports: [
      "StackTrace",
      "StackTraceActions",
      "StackTraceContent",
      "StackTraceCopyButton",
      "StackTraceError",
      "StackTraceErrorMessage",
      "StackTraceErrorType",
      "StackTraceExpandButton",
      "StackTraceFrames",
      "StackTraceHeader",
    ],
    properties: [...themeSurfaceProperties],
    root: "the `<div>` `StackTrace` renders",
    slots: {
      /*
       * The header's copy and expand controls. They are `CopyButton` and
       * `Button` and keep `.ads-button`; the slot is what lets a brand paint
       * the trace's own action chrome without repainting every quiet button.
       */
      action: [...themeSurfaceProperties, ...themeFocusProperties],
      /** The trailing action cluster; its gap is the only thing it owns. */
      actions: [...themeSpaceProperties],
      content: [...chrome],
      /** Groups the type and the message on one baseline. */
      error: [...themeSpaceProperties],
      "error-message": ink,
      "error-type": ink,
      frames: [...themeSpaceProperties],
      header: [...chrome],
      /** The source snippet under an app frame — its own recessed surface. */
      snippet: [...chrome],
    },
  },
  terminal: {
    exports: ["Terminal"],
    properties: [...themeSurfaceProperties],
    root: "the `<figure>` `Terminal` renders",
    slots: {
      /** The streaming caret. A brand's cursor is a brand's cursor. */
      caret: ink,
      header: [...chrome],
      /** The `<pre>` scrollback, which declares the mono face. */
      output: [...ink, ...themeSpaceProperties],
      title: ink,
    },
  },
  text: {
    axes: {
      size: ["sm", "md", "lg"],
      tone: ["default", "muted", "subtle"],
    },
    exports: ["Text"],
    properties: [...ink],
    root: "the `<p>`, `<div>` or `<span>` `Text` renders, per `as`",
  },
  "web-preview": {
    exports: ["WebPreview"],
    properties: [...themeSurfaceProperties],
    root: "the `<section>` `WebPreview` renders",
    slots: {
      /** The log tail under the frame. */
      console: [...chrome],
      /** Its disclosure header, hand-rolled from the headless collapsible. */
      "console-trigger": [...control],
      /** Browser chrome: the row carrying refresh, address, and open. */
      navigation: [...chrome],
      /** The read-only address readout — a quiet inset field, not an input. */
      url: [...chrome],
    },
  },
} as const satisfies ThemeTargetRegistry;

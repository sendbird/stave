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

/** A control: its surface, its own internal air, and its focus ring. */
const control = [
  ...surface,
  ...themeSpaceProperties,
  ...themeFocusProperties,
] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * The first four targets, chosen because each one answers a different question
 * the generator has to get right: a control with three axes and a slot
 * (`button`), a surface whose parts are slots rather than targets (`card`), a
 * form control whose state is authoritative and must not be overridable
 * (`text-field`), and a portalled compound whose parts paint separately
 * (`dialog-*`).
 */
export const pilotThemeTargets = {
  button: {
    axes: {
      size: ["xs", "sm", "md", "lg", "icon", "iconSm", "iconLg"],
      tone: ["default", "success", "warning", "danger"],
      variant: [
        "primary",
        "secondary",
        "soft",
        "outline",
        "dashed",
        "quiet",
        "link",
        "floating",
        "danger",
      ],
    },
    exports: [
      "Button",
      /*
       * Single-control wrappers whose rendered root IS an ADS `Button`, so the
       * `<button>` already carries `.ads-button` with its full size/tone/variant
       * matrix. Listing them here is the pilot rule the actions family stated —
       * a wrapper of `Button` is covered by the `button` target, it does not get
       * a second one. `CallControlBar.Leave` is here deliberately against the
       * collab family's first note: it renders `<Button variant="danger">`, a
       * real Button, not a hand-rolled control, so `.ads-button[data-variant="danger"]`
       * reaches it and excluding it would have hidden an element the target owns.
       */
      "ButtonGroupButton",
      "CallControlBar.Leave",
      "CopyButton",
      "Stream.Copy",
    ],
    properties: control,
    root: "the `<button>` (or the caller's `render` element) Base UI's button behaviour renders",
    slots: {
      /*
       * The corner mark's ANCHOR, not the mark. Its own paint belongs to the
       * caller who passed `indicator`; what a brand can restyle here is the
       * overhang's own chrome.
       */
      indicator: surface,
    },
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  card: {
    axes: { density: ["compact", "regular"] },
    /*
     * One target, six slots. The parts share the card's surface and only ever
     * move with it, so a brand that wants a different card wants one rule with
     * six refinements — not six targets whose relationship it has to
     * reconstruct.
     */
    exports: [
      "Card",
      "CardAction",
      "CardContent",
      "CardDescription",
      "CardFooter",
      "CardHeader",
      "CardTitle",
    ],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<section>` `Card` renders",
    slots: {
      action: [...themeSpaceProperties],
      content: [...surface, ...themeSpaceProperties],
      description: ink,
      footer: [...surface, ...themeSpaceProperties],
      header: [...surface, ...themeSpaceProperties],
      title: ink,
    },
    states: ["hover", "active", "focus-visible"],
  },
  "dialog-backdrop": {
    exports: [],
    properties: ["backgroundColor", "backgroundImage", "opacity"],
    root: "the Base UI dialog backdrop element",
  },
  "dialog-popup": {
    axes: {
      density: ["compact", "regular"],
      /* The panel-width axis, which `DialogPopup` spells `width`. */
      size: ["sm", "md", "lg", "xl"],
    },
    exports: [
      "DialogBackdrop",
      "DialogBody",
      "DialogCloseButton",
      "DialogDescription",
      "DialogFooter",
      "DialogHeader",
      "DialogHeaderContent",
      "DialogPopup",
      "DialogTitle",
    ],
    properties: [...surface, ...themeSpaceProperties],
    root: "the Base UI dialog popup element",
    slots: {
      body: [...surface, ...themeSpaceProperties],
      /*
       * The header's dismiss control. It is a slot rather than the `button`
       * target because it is not one: `DialogCloseButton` hand-rolls a quiet
       * icon square out of `surfaceChrome`, so a brand's `.ads-button` rule has
       * never reached it and saying otherwise would be a documented lie.
       */
      close: [...surface, ...themeFocusProperties],
      description: ink,
      footer: [...surface, ...themeSpaceProperties],
      header: [...surface, ...themeSpaceProperties],
      "header-content": [...themeSpaceProperties],
      title: ink,
    },
  },
  "text-field": {
    axes: {
      size: ["xs", "sm", "md", "lg"],
      /*
       * `tone` is the field's RESOLVED tone — `error` forces `danger`. It is
       * reflected so a brand can paint the invalid state, and it is computed
       * by the component precisely so a caller cannot claim a validity the
       * field does not have.
       */
      tone: ["default", "success", "danger"],
    },
    exports: [
      "TextField",
      /*
       * Renders a `TextField`, so its rendered root is the same `<input>` that
       * carries `.ads-text-field`; the pilot rule covers a wrapper of the field
       * under this target rather than giving it a second one.
       */
      "TimeField",
    ],
    properties: control,
    root: "the `<input>` Base UI's input renders",
    states: ["hover", "focus-visible", "disabled"],
  },
} as const satisfies ThemeTargetRegistry;

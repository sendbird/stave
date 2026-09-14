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

/** A surface that also owns the air between the things standing on it. */
const track = [...themeSurfaceProperties, ...themeSpaceProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * A row/list that paints only the gap between its rows.
 *
 * The list roots in this family are bare grid or flex stacks — no fill, no
 * edge, no type on the element itself — so the gap is the one declaration a
 * rule could change, and the rhythm is what a denser brand reaches for.
 */
const rowGutter = ["rowGap"] as const;

/** A hairline rule: a filled 1px box, not a bordered one. */
const rule = ["backgroundColor", "borderRadius", "opacity"] as const;

/**
 * Data surfaces: tables, lists, boards, trees, property grids, and the
 * reorder/selection chrome that stands on them.
 *
 * Two shapes recur and decide every call below. First, a **row that a reader
 * can press or select** has its own hover/press/current paint, so it is a
 * target of its own even when it sits inside a list's box — only a target
 * carries states, and a brand that cannot write the row's `:hover` cannot
 * restyle the list. Second, a **cell or label that only inherits its row's
 * fill** is a slot: it shares the surface and moves with it, so it is one
 * refinement of the row's rule rather than an unrelated name.
 *
 * `Table` and `DataTable` are two targets, not one. `Table` is the low-level
 * primitive — a bare `<div>` frame the caller fills with their own
 * `TableRow`/`TableCell` — and `DataTable` is the composed grid that owns its
 * scroll frame, toolbar, sortable header, selection column and pagination.
 * They render different DOM and paint different surfaces; collapsing them would
 * force a brand's one `Table` rule onto a grid it never sees. The
 * `.ads-data-table` frame class here is distinct from the UNLAYERED
 * `.ads-data-table--selectable` / `--selection-active` classes in
 * `data-table-motion.css`; those set only `opacity`/`transition` on the
 * selection checkbox — a Checkbox this family does not own — so nothing in the
 * frame's paint allowance below is a promise that stylesheet contradicts.
 */
export const dataThemeTargets = {
  board: {
    /*
     * The scroll row itself paints nothing but the gap between columns — no
     * fill, no edge, no type on the flex track. `columnGap` is the horizontal
     * rhythm between columns, which a denser board reaches for; the column and
     * card surfaces are their own targets below.
     */
    exports: ["Board"],
    properties: ["columnGap"],
    root: "the `<div>` `Board` renders as the horizontal column scroll row",
  },
  "board-card": {
    /*
     * A card is a draggable object with its own resting/lifted paint, so it is
     * a target rather than a slot — `focus-visible` and `active` (grab) are
     * real states here. The lift on drag is `box-shadow`, which the surface
     * allowance already covers.
     */
    exports: ["Board.Card"],
    properties: control,
    root: "the `<div>` (Motion `m.div`) `Board.Card` renders",
    states: ["hover", "active", "focus-visible"],
  },
  "board-column": {
    /*
     * The column paints its own tint surface and owns the air between the
     * header and its card stack, so it is `track`. The header, count badge and
     * card body are slots: they share the column's fill and only move with it.
     * The drop-target highlight is `board?.hoverColumnId`, a boolean with no
     * DOM spelling on this element, so it is not an axis a brand can reach.
     */
    exports: ["Board.Column"],
    properties: track,
    root: "the `<section>` `Board.Column` renders",
    slots: { count: surface, header: track, title: ink },
  },
  "data-list": {
    /*
     * `DataList` renders its rows as `Item variant="row"`, so a row's paint is
     * the `item` target's job (below) and this root only owns the stack gap and
     * the label/description header type. `label` and `description` are slots:
     * static header text sharing the list's surface.
     */
    exports: ["DataList"],
    properties: rowGutter,
    root: "the `<div>` `DataList` renders around its header and row list",
    slots: { description: ink, label: ink },
  },
  "data-table": {
    axes: { density: ["compact", "regular"] },
    /*
     * The scroll frame is the target: it paints the grid's perimeter fill,
     * border and lift, and `density` lets a brand reach the parts underneath.
     * Everything else in the composed grid is a slot — the toolbar band, the
     * empty-state well, and the pagination footer share the frame's surface and
     * only ever move with it. The sortable header cell and the pressable/
     * current row are targets of their own (`data-table-header-cell`,
     * `data-table-row`) because they carry states this frame does not.
     */
    exports: ["DataTable"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the scroll-frame `<div>` `DataTable` renders around its `<table>`",
    slots: {
      /* The filter + column-visibility band across the top of the grid. */
      toolbar: track,
      /* The empty-state well shown in place of rows. */
      empty: [...surface, ...themeSpaceProperties],
      /* The pagination footer row. */
      footer: track,
    },
  },
  "data-table-header-cell": {
    axes: { density: ["compact", "regular"] },
    /*
     * The `<th>` is a target, not a slot: a sortable column is a real button
     * with hover/active/focus paint and a distinct sorted weight, and `aria-sort`
     * is the only thing that told the sorted state apart before. `exports: []`
     * because the `<th>` has no public export of its own — the one public name
     * is `DataTable`, the frame above.
     */
    exports: [],
    properties: control,
    root: "each `<th>` in the `DataTable` header row, sortable or not",
    states: ["hover", "active", "focus-visible"],
  },
  "data-table-row": {
    /*
     * A DataTable body row has clickable/selected/current paint of its own, so
     * it is a target. Its cells only inherit the row's fill and are the `cell`
     * slot. No public export beyond `DataTable`.
     */
    exports: [],
    properties: themeSurfaceProperties,
    root: "each body `<tr>` `DataTable` renders, clickable or static",
    slots: { cell: ink },
    states: ["hover", "active", "focus-visible"],
  },
  inbox: {
    /*
     * The list and its day groups paint no surface of their own — the root sets
     * the family and the stack gap, the group its own gap and label. The row is
     * the `inbox-item` target below, because it is the pressable object.
     */
    exports: ["Inbox", "Inbox.Group"],
    properties: rowGutter,
    root: "the `role=\"list\"` `<div>` `Inbox` renders",
    slots: { "group-label": ink },
  },
  "inbox-item": {
    /*
     * A notification row: a real `<button>` with hover/active/focus paint and a
     * selected wash, so it is a target. Its inner text spans (actor, action,
     * target, body, chips) are slots — they inherit the row's fill and only
     * carry type/ink. `unread` is a boolean with no DOM spelling here, not an
     * axis.
     */
    exports: ["Inbox.Item"],
    properties: [...surface, ...themeSpaceProperties, ...themeFocusProperties],
    root: "the row `<div>` `Inbox.Item` renders around its button, time and actions",
    slots: {
      action: ink,
      actor: ink,
      body: ink,
      chips: ink,
      target: ink,
    },
    states: ["hover", "active", "focus-visible"],
  },
  item: {
    axes: {
      density: ["compact", "regular"],
      variant: ["navigation", "surface", "row"],
    },
    /*
     * A list row that becomes a real `<button>` when given `onClick`, with
     * hover/active/focus paint and a selected state per variant — a target. Its
     * title/description/meta are slots that inherit the row's fill. Both axes
     * are reflected: they select which resting/selected paint the row and its
     * slots carry (`surface` keeps a perimeter, `row`/`navigation` go flat).
     */
    exports: ["Item"],
    properties: control,
    root: "the `<button>` or `<div>` `Item` renders",
    slots: { description: ink, meta: ink, title: ink },
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "overflow-list": {
    /*
     * A single-line row that measures itself and moves the overflow into a
     * menu. It paints no fill or edge — only the horizontal gap between the
     * items it lays out — so the gap is its whole allowance. The items are the
     * consumer's own nodes and the trigger is a `Button` (its own target).
     */
    exports: ["OverflowList"],
    properties: ["columnGap"],
    root: "the flex `<div>` `OverflowList` renders as its measured row",
  },
  "property-list": {
    /*
     * The `<dl>` grid: it owns the row rhythm and the label/value type, and the
     * per-row hairline is the one edge. `readOnly` is a boolean, not an axis.
     * `label` and `value` are slots — static label text and the value cell that
     * shares the row's surface. The in-place edit trigger is a quiet in-row
     * button with its own hover paint, so it is the `property-list-value`
     * target below rather than a slot here.
     */
    exports: [
      "PropertyList",
      "PropertyList.Row",
      "PropertyList.SelectRow",
      "PropertyList.TextRow",
    ],
    properties: [...themeSurfaceProperties, ...themeTypographyProperties, "rowGap"],
    root: "the `<dl>` `PropertyList` renders",
    slots: { label: ink, value: ink },
  },
  "property-list-value": {
    /*
     * The click-to-edit value control (`PropertyList.TextRow` /
     * `PropertyList.SelectRow`): transparent at rest, a hover wash, a shared
     * focus ring — a pressable part with its own states, so a target. No public
     * export beyond the row types above, which name the whole row.
     */
    exports: [],
    properties: control,
    root: "the quiet value `<button>` a `TextRow`/`SelectRow` renders when editable",
    states: ["hover", "active", "focus-visible"],
  },
  "selection-action-bar": {
    /*
     * The floating bulk-actions pill, portalled to `document.body`. It paints a
     * raised surface with its own air and a separator between clusters. It has
     * no interactive state of its own — the controls inside it are the app's
     * `Button`s — so it lists no states. `separator` is a hairline rule.
     */
    exports: ["SelectionActionBar", "SelectionActionBar.Separator"],
    properties: track,
    root: "the floating `<div>` (Motion `m.div`) portalled to `document.body`",
    slots: { count: ink, separator: rule },
  },
  "sortable-list": {
    /*
     * A vertical reorderable stack. The root paints nothing but the gap between
     * rows (or drops even that when `unstyled`), so `rowGutter`. The row is the
     * `sortable-list-item` target and the grip is `sortable-list-handle`.
     */
    exports: ["SortableList"],
    properties: rowGutter,
    root: "the `role=\"list\"` `<ul>` `SortableList` renders",
  },
  "sortable-list-handle": {
    /*
     * The ⋮⋮ grab handle: a `<button>` with hover/active paint, a grabbed wash,
     * and a focus ring. Pressable with its own states, so a target. `disabled`
     * is absent — the handle has no disabled paint and is never disabled.
     */
    exports: ["DragHandle"],
    properties: control,
    root: "the grip `<button>` `SortableList.DragHandle` renders",
    states: ["hover", "active", "focus-visible"],
  },
  "sortable-list-item": {
    /*
     * A reorderable row with a resting card surface and a lifted state while
     * dragging (`box-shadow`, covered by surface). `focus-visible` reaches it
     * through the whole-row `longPressToDrag` affordance. The insertion line is
     * an accent bar carrying SIGNAL, not a themeable slot.
     */
    exports: ["SortableList.Item"],
    properties: [...surface, ...themeSpaceProperties, ...themeFocusProperties],
    root: "the `<li>` (Motion `m.li`) `SortableList.Item` renders",
    states: ["hover", "active", "focus-visible"],
  },
  table: {
    axes: { density: ["compact", "regular"] },
    /*
     * The low-level table primitive: the frame `<div>` paints the perimeter and
     * owns the cell block-padding density. `TableHeader`/`TableBody`/
     * `TableFooter` paint band fills and are slots; `TableCaption` is caption
     * ink; `TableHead`/`TableCell` only inherit their row's fill, so they are
     * `head`/`cell` slots. The pressable/current `TableRow` is its own
     * `table-row` target below.
     */
    exports: [
      "Table",
      "TableBody",
      "TableCaption",
      "TableCell",
      "TableFooter",
      "TableHead",
      "TableHeader",
    ],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<div>` frame `Table` renders around its `<table>`",
    slots: {
      body: themeSurfaceProperties,
      caption: ink,
      cell: ink,
      footer: themeSurfaceProperties,
      head: ink,
      header: themeSurfaceProperties,
    },
  },
  "table-row": {
    /*
     * The `<tr>` `TableRow` renders. It carries a hover/press wash and a
     * `current` location fill, so it is a target with states. The `current`
     * marker is `aria-current` + `data-current`, a Base UI-style reserved state
     * attribute, so it is not an axis. Cells inside it are the `table` target's
     * `cell`/`head` slots.
     */
    exports: ["TableRow"],
    properties: themeSurfaceProperties,
    root: "the `<tr>` `TableRow` renders",
    states: ["hover", "active"],
  },
  "transcript-list": {
    /*
     * A time-synced transcript. The `<ol>` owns the stack gap; each segment
     * row becomes a `<button>` under `onSeek` with hover/active paint and an
     * active-playback wash, so the row is the `transcript-list-row` target. The
     * timestamp/speaker/text are its slots.
     */
    exports: ["TranscriptList"],
    properties: rowGutter,
    root: "the `role=\"list\"` `<ol>` `TranscriptList` renders",
  },
  "transcript-list-row": {
    /*
     * One segment row: a real `<button>` under `onSeek` (hover/active/focus) or
     * a static `<span>`. The active segment gets a selection wash — a
     * playback-position state, `aria-current`, not an axis. `speaker` carries a
     * muted chip fill; `text` and `timestamp` are ink. No public export of its
     * own; `TranscriptList` names the whole list.
     */
    exports: [],
    properties: [...surface, ...themeSpaceProperties, ...themeFocusProperties],
    root: "each segment `<button>`/`<span>` `TranscriptList` renders",
    slots: {
      speaker: surface,
      text: ink,
      /* The timestamp switches to accent ink on the active segment — that is
       * the honest second signal for playback position, so it stays ink-only
       * and a brand cannot flatten the two states to one colour. */
      timestamp: themeTypographyProperties,
    },
  },
  tree: {
    axes: { density: ["compact", "regular"] },
    /*
     * A flat `role="tree"` list of rows. The `<ul>` root reflects `density`
     * (already on the element as `data-density`) and owns the row rhythm; the
     * individual `TreeRow` is a private part (no public export) that carries the
     * pressable/selected paint, so its paint reaches a brand through this
     * root's own family/gap and the row's app-owned tokens. The row is not a
     * separate public target because `Tree.row` exports nothing.
     */
    exports: ["Tree"],
    properties: [...themeTypographyProperties, "rowGap"],
    root: "the `role=\"tree\"` `<ul>` `Tree` renders",
  },
  "ticket-row": {
    axes: { density: ["compact", "regular"] },
    /*
     * A dense support-queue row: a `<button>` with hover paint and a selected
     * fill+border, so a target. `density` selects the row's air and nested chip
     * scale. The priority/state Badges and the SLA chip carry SEMANTIC colour
     * (danger/warning/success) a brand must not be able to flatten, so they are
     * not slots here — they follow their own tokens. `customer`/`subject`/
     * `description` are ink slots.
     */
    exports: ["TicketRow"],
    properties: control,
    root: "the `<button>` `TicketRow` renders",
    slots: { customer: ink, description: ink, subject: ink },
    states: ["hover", "active", "focus-visible"],
  },
} as const satisfies ThemeTargetRegistry;

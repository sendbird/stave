# Fleet scale validation

Fixture: 2,000 tasks, 40 workspaces, eight repositories. Measurements use the
actual application in a development build on a shared machine, with fonts ready.
The first-render interval starts immediately before opening Fleet and ends when
all 2,000 logical selection targets register. Scripting is the browser performance
counter delta through locale/theme synchronization. Scroll time covers setting
scrollTop on the actual overflow scroll owner plus two animation frames, rather
than an isolated frame CPU trace. The test asserts that the scroll offset moved.
Heap is the used script heap without forced collection. These are observations,
not production latency or retained-memory guarantees. Concurrent checks and
module compilation affect timings; no statistical speedup claim is made.

| Locale/theme width | DOM rows before → after | First render ms | Scripting ms | Scroll sample ms | Heap MB |
| --- | --- | --- | --- | --- | --- |
| en/light 1024 | 2000 → 15 | 4387 → 276 | 5091 → 363 | 405.6 → 30.6 | 315 → 213 |
| en/light 1440 | 2000 → 22 | 4495 → 375 | 5774 → 487 | 22.6 → 137.4 | 344 → 251 |
| ko/dark 1024 | 2000 → 16 | 4315 → 324 | 5398 → 397 | 26.0 → 33.0 | 298 → 214 |
| ko/dark 1440 | 2000 → 22 | 4030 → 387 | 4853 → 455 | 26.7 → 41.9 | 322 → 252 |

The "after" column is the current windowed list on one local run (en/light 1440
ran first, so its scroll sample includes warm-up). On the PR's shared CI runners
the earlier windowed table measured 13–20 rows, 2.2–2.5 s first render and
100–141 ms for the scroll sample.

## Budgets

The CI gate uses about three times those CI values, so a real regression fails
while runner noise does not: fewer than 66 mounted table rows, 25 Tree cards,
36 workspace cards, 40 rows in an expanded card and 66 sidebar rows; first
render under 7.5 s; the two-frame scroll sample under 450 ms. Mounted counts are
deterministic (viewport plus overscan), so their margin covers window sizes,
not timing. Navigation to the last logical row, a selection spanning unmounted
rows, select-all and Tree navigation are asserted separately, so timing alone
cannot pass a broken list. The initial server-rendered table markup stays
bounded, publishes the full row count and numbers each row once.

Measurement files and screenshots are written only when
`FLEET_SCALE_ARTIFACTS=<directory>` is set; the CI gate writes nothing.

## How the lists are windowed

`src/hooks/use-windowed-list.ts` is the one windowing hook for Fleet and the
sidebar. It renders the rows near the visible area of the list's scroll owner
with spacers in the normal flow for the rest, measures every rendered row, and
estimates unmeasured rows from the median measured size (shared between lists
of the same kind, so a list below the view sizes its spacer from real rows).
The browser's scroll anchoring keeps the view still when a size above it
changes. The row holding focus, and any pinned rows, stay mounted when they
leave the window, so focus never falls to the page. Revealing a row scrolls the
least distance and does nothing when the row is visible. A focus request lands
at most once, only after the row mounts, and is dropped if focus moved anywhere
else or into a text field meanwhile.

- Table: the frame scrolls itself under its sticky column header. Every group
  heading row is sticky under the header; the group of the first visible row
  keeps its heading mounted, so the latest heading to reach the top (the group
  of the first visible row) is the one shown, with the group's only selection
  control. The header row is `aria-rowindex` 1 and body rows follow it.
- Tree: past 80 cards, one list for the whole board, group headings included,
  scrolled by the board. ↑/↓ (k/j) step through every card across groups and
  wrap, and Home/End jump, at any size.
- Cards: past 20 workspaces in a repository, rows of cards are windowed and
  scroll with the board. Each row is a subgrid of the board's card template, so
  the cards in a row share one height. Every card stays mounted as a component
  and draws only into its slot when its row is rendered.
- Expanded card task lists past 80 rows keep their bounded scroller inside the
  card. The Show more/fewer item counts in each row's set size.
- Sidebar workspace lists and Work queue lanes window past 60 rows and render
  exactly as plain lists below that, so a typical sidebar has no empty first
  frame. Windowed rows take the parent's gap as padding, so spacing and the
  scroll area's end padding stay the same.

A separate sidebar fixture covers 400 workspaces and verifies keyboard and
pointer reorder, focus, collapsed navigation and complete accessibility counts.
A separate card fixture covers 40 workspaces in one repository and a 100-task
expanded card, asserting bounded views while retaining selection for 120 task
rows. `tests/e2e/fleet-virtual-focus.e2e.ts`, `fleet-cards-virtual.e2e.ts` and
`sidebar-virtual-geometry.e2e.ts` cover the sticky group, focus, key and spacing
contracts above.


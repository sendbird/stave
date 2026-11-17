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
| en/light 1024 | 2000 → 13 | 4387 → 328 | 5091 → 472 | 405.6 → 25.1 | 315 → 100 |
| en/light 1440 | 2000 → 19 | 4495 → 453 | 5774 → 669 | 22.6 → 34.1 | 344 → 128 |
| ko/dark 1024 | 2000 → 14 | 4315 → 424 | 5398 → 489 | 26.0 → 40.8 | 298 → 259 |
| ko/dark 1440 | 2000 → 19 | 4030 → 504 | 4853 → 589 | 26.7 → 44.2 | 322 → 307 |

The CI regression budgets are fewer than 150 mounted task rows, first render
under 30 seconds, and the two-frame scroll sample under 1 second. The margins
cover cold module compilation and shared-runner scheduling. Navigation to the
last logical row, a selection spanning unmounted rows, select-all, and Tree
navigation are asserted separately, so timing alone cannot pass a broken list.
The grouped table also checks its full accessibility count, offscreen row index,
sticky group geometry and whole-group selection after scrolling.
The initial server-rendered table markup also stays bounded and publishes the
full row count. That assertion fails on the original non-windowed table.

The table shares the installed transcript windowing dependency. Group headings
and columns stay in the table scroll area. Task selection uses the full filtered
model rather than the mounted window. Tree main lists and expanded card task
lists window when long; large card grids retain their models while mounting
only visible views. Sidebar workspace lists and Work queue lanes share their
scroll parent and navigate their complete expanded logical order. Existing
row-local activity subscriptions remain scoped to their task; unmounted views
cannot redraw on clock or activity updates.

A separate sidebar fixture covers 400 workspaces: initial mounted workspace
rows fall from 400 to 20 (queue: 17). It verifies keyboard and pointer reorder,
focus restoration, collapsed navigation and complete accessibility counts.
A separate card fixture covers 40 workspaces in one repository and a 100-task
expanded card, asserting bounded views while retaining selection for 120 task
rows. Small lists preserve their original layout.

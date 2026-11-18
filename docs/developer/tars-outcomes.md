# Tars Outcome Numbers

Run `bun scripts/measure-tars-outcomes.ts` to see how Tars work actually ended.
It reads the saved Tars work and its runs from the app database, read only, and
changes nothing.

```bash
bun scripts/measure-tars-outcomes.ts
bun scripts/measure-tars-outcomes.ts --since=2026-11-17
bun scripts/measure-tars-outcomes.ts /path/to/a/copy/of/stave.sqlite
```

Without a path it reads `~/Library/Application Support/stave/stave.sqlite`.

## What It Prints

One row for each piece of work:

| Column | Meaning |
| --- | --- |
| `result` | `pull-request` (a draft PR opened), `completed`, `accepted-unverified` (you accepted work Stave could not verify), `cancelled`, `taken-over` or `open` |
| `minutes` | From the request to the draft PR. For other ended work, to its run's last event |
| `leadTurns` | Turns the run's lead took |
| `helperStarts` | Helper runs the lead started, the review included |
| `waits` | Times the lead waited on a helper |

Then a summary:

- `unattendedRate`: the share of ended work that reached a pull request or a
  verified completion. Work you accepted, cancelled or took over does not count.
- `medianMinutesToPullRequest`, `medianHelperStarts`, `medianLeadTurns`.

## How To Use It

Compare the same window before and after a change to how Tars runs work. A run
with one owner should show one helper start (the review) or two (a second review
after a fix).

The numbers describe hand-offs and elapsed time. They do not say whether the
result was correct.

## Baseline

Work created on 2026-11-17 and 2026-11-18, before one agent owned each unit
(8 pieces):

| Number | Value |
| --- | --- |
| Reached a pull request | 2 |
| Completed without one | 3 |
| Cancelled or taken over | 3 |
| Median minutes to pull request | 592 |
| Median helper starts | 4 |
| Median lead turns | 6 |

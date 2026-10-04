# AI usage statistics

Open **AI usage** in the sidebar (also available in the collapsed rail), or
choose **View usage statistics** in a status-bar usage popover. The popover
opens the report for that provider and account. Close the page or press Escape
to return to your workspace.

## Browse an account

Choose a provider, account, period and daily or hourly grouping. Presets cover
today, 7/30/90 calendar days and this month. Custom dates include the final date
and span at most 366 days. Your local timezone or UTC controls both date
boundaries and grouping; repeated daylight-saving hours retain their UTC offset.
Selecting a daily bar opens that day's hourly report. Tables expose exact
bucket values and individual turn start times, with pagination.

These filters are read-only. They do not change the account used for new turns,
running turns, queued work or terminal sessions. Account names follow the
registry; removed accounts keep their history. Identity is the registered
account profile: signing in as a different person in the same profile does not
create a new statistics identity. Use separate profiles to keep totals separate.

## What the numbers mean

| Metric | Source and meaning |
| --- | --- |
| Tokens excluding cache reads | Completed Stave turns: Claude adds cache creation to uncached input, Codex removes cache reads from inclusive input, then output is added. Other providers use their reported input and output. Reasoning is not added to output again. This matches the status-bar token convention. |
| Input / output | Raw counters as each provider reports them; their cache conventions differ. |
| Cache / reasoning | Optional reported counters. Missing counters contribute nothing; zero totals do not establish that a provider reported them. |
| Provider-reported USD | Sum only of reported costs, with the number of turns reporting USD. No reported cost displays **Not reported**; a measured zero remains zero. This is not an invoice or a conversion of subscription quota. |
| Turns | Completed persisted task turns, including agent runs and MCP task turns. Running turns appear on completion. Missing measurements remain visible in the coverage count. |
| Account quota | Provider account readings, including usage outside Stave. Each window is independent; percentages from different windows/accounts are never averaged or summed. API billing connections have no subscription quota. |

Token and cost totals cover this device's Stave task turns across workspaces.
Standalone CLI sessions, terminal commands, other applications and secondary
queries without persisted task turns are not token records in this report.
Some runtimes do not report tokens or cost. Unknown measurements are not
displayed as free usage. Models use runtime-resolved identity when available,
otherwise the requested model, or **Model not recorded**.

## Quota history and freshness

The quota summary shows the latest saved observation regardless of the selected
token period. Its observation and reset times remain visible. Observations
older than 15 minutes, or with a reset time already passed, are marked older;
Stave does not turn an expired reading into an assumed 0% usage.
Cached responses, including those served during failure backoff, do not create
new observations or advance the saved observation time.

Choose a provider and one registered account to **Refresh quota**. Existing
provider read caching, request floors and CLI-fallback rules still apply. A
failed read explains the failure and retains the dated saved observations.
Local report refreshes never call a provider. Opening the statistics page does
not start an extra provider polling loop.

**Show quota history** displays readings within the selected period. Each dot
is an observed reading; it does not estimate usage between observations or
allocate a percentage to a turn. The latest observation per account/window per
minute is retained for 366 days. Reports include at most the latest 2,000 quota
observations; a notice asks for a narrower period when that limit is reached.
No historical readings can be reconstructed before recording began.

## Local storage

The local database stores execution profile IDs, model IDs, timestamps, token
counters and reported cost. Quota history stores account/window IDs, percentages,
reset times and source. It stores no prompts, credentials or account-directory
paths. Usage history survives workspace deletion and application restarts.

Existing persisted turns are imported once. They have no account or model
evidence, so they remain **Unattributed history**, separate from every registered
account. They are never assigned to whichever account happens to be selected.

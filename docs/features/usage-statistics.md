# AI usage statistics

Open **AI usage** in the sidebar (also available in the collapsed rail), or
choose **View usage statistics** in a status-bar usage popover. The popover
opens the report for that provider and account. Close the page or press Escape
to return to your workspace.

Use **Tokens & cost** for totals, trends and account/model breakdowns,
**Quota** to compare subscription windows and upcoming resets, and
**History** for individual runs. A status-bar usage popover opens the
account-quota view directly.

## Browse an account

Choose a provider, account, period and daily or hourly grouping. Presets cover
today, 7/30/90 calendar days and this month. Custom dates include the final date
and span at most 366 days. Your local timezone or UTC controls both date
boundaries and grouping; repeated daylight-saving hours retain their UTC offset.
Selecting a daily bar opens that day's hourly report. Tables expose exact
bucket values. Turn history groups records by date in the selected timezone,
with time, model, tokens and reported cost visible in each summary. Expand a
turn for its account, exact start time, input/output and cache counters.
Turn history shows the most recent records first, up to 20 per page. Use
**Previous turns** and **Next turns** to browse the selected period.
Select a model in **By model** to filter totals, trends and turn history to that
provider and model. **Clear model filter** returns to all models. Records with
no saved model remain available as **Model not recorded**. Model filters never
filter subscription quota, which applies to an account rather than a local run.

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
Fresh turn-time quota updates are saved at their actual observation time for
their execution account. A partial Claude update records only the window it
observed; other cached windows keep their earlier times. Codex native-cache
reads keep the original observation time instead of recording another sample.
Each account groups its windows together and shows the last observed remaining
percentage and time until reset. Within a provider, accounts with the soonest
upcoming reset appear first. Expired readings remain marked older, and registered
accounts with no quota observations display **No saved quota** instead of zero.

Choose a provider and one registered account to **Refresh quota**. Existing
provider read caching, request floors and CLI-fallback rules still apply. A
failed read explains the failure and retains the dated saved observations.
The refresh result says whether the provider was read or the last reading was
reused, and shows when another manual refresh is allowed. After a failure it
also shows when automatic reads may resume; a manual retry still follows the
one-minute request floor. Cached results keep their original observation times.
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

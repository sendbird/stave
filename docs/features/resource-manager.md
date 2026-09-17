# Resource Manager

Resource Manager shows process memory, Lens ownership, and controls for releasing hidden pages or cleaning up inactive workspaces. Open it from the memory usage indicator.

## Read the dashboard

The summary remains visible above both views. Memory footprint and RSS include the same Electron and host-service process tree, counting overlapping PIDs once. Footprint substitutes private memory where available; RSS retains working-set measurements. **Electron CPU** covers only Electron processes, not provider or terminal descendants.

Heap gauges compare usage with the V8 heap size limit, not the currently allocated heap. The hidden Lens gauge compares hidden-page RSS with the configured budget. Gauges warn at 60% and 85%; app memory warns at 25% and 40% of device RAM, or 4 GiB and 8 GiB when capacity is unavailable. Electron CPU warns at 60% and 120%. These are application thresholds, not an operating-system pressure measurement.

Status icons and text accompany warning colors. Trends cover up to the last minute of samples collected while the dialog is open. **Workspaces and processes** shows attribution and page controls; **Diagnostics and storage** shows detailed measurements and storage actions.

## Manage Lens memory

1. Expand a workspace to inspect its Lens pages and processes.
2. Choose **Always keep active** to exclude a page from automatic and manual idle release. Choose **Allow idle release** to remove this preference.
3. Choose **Release hidden pages**, review the warning, and confirm.

Visible pages, loading pages, in-flight commands, authentication popups, active downloads, audio playback, and keep-active preferences protect pages from eviction. A document granted microphone input remains protected until navigation, since silent recording must not be mistaken for inactivity. Recently reopened pages also receive a cooldown. Manual release preserves agent-owned pages. Automatic idle policies may release inactive agent pages.

Keep-active preferences are saved locally per workspace and Lens session. They survive application restarts. They do not prevent explicitly closing a tab or archiving its workspace. If preferences cannot be read, pages remain protected until the preference file can be recovered.

Releasing a page requests destruction of its renderer guest. The tab can reopen at its previous URL, but unsaved input and page state may be lost. Automatic detection of unsaved input is not provided; use **Always keep active** for pages whose state must be retained.

### Sleep before release

Choose **Sleep page** for an unprotected hidden page. Sleeping keeps the guest and its current document in memory, including input and scroll state, while requesting the browser frozen lifecycle state. **Wake page**, presenting the tab, or a Lens CDP command wakes it before the command runs. Sleep does not promise a particular RSS reduction or preserve state across crashes, page reloads, or later idle release.

The automatic sweep runs once a minute. Hidden pages become eligible for sleep after one minute; agent pages after five minutes without activity. The existing count, memory and idle release policies still apply. Unsupported lifecycle commands leave the page usable rather than substituting destructive release.

### Adaptive limits

The hidden renderer budget is one thirty-second of device RAM, bounded between 128 and 512 MiB. Unknown capacity uses 512 MiB. This is a device capacity policy, not an operating-system memory-pressure measurement.

Reopening a released page grants a two-minute cooldown. Repeated reopenings within the bounded recent history extend it to four, eight, and at most fifteen minutes. Cooldowns protect every automatic release path and expire naturally. Protected pages can temporarily exceed the budget.

## Stop workspace execution

Expand **Workspace execution**, choose **Stop execution**, review the shutdown warning, and confirm. The host validates the workspace against the project registry and refuses to stop it while a provider turn or script invocation is running or starting.

Once admitted, the host blocks new provider turns, terminal and CLI sessions, and workspace scripts before closing that workspace's PTYs and managed services. Terminal screen snapshots, code, conversations, and tab definitions are retained. Another workspace's sessions remain running. Lens pages have separate sleep and release controls; unknown or externally detached processes are not killed by ancestry guesses.

Choose **Resume execution** to allow new work. Previous commands are not automatically rerun; use the terminal restart control or start a new task. The barrier lasts for the host runtime lifetime, including while Resource Manager is closed. A host restart clears it. It is not a durable automation-pause setting.

If a stop only partially succeeds, new execution remains blocked and the result reports the error. The UI distinguishes an incomplete stop from a completed one. Explicit resume allows work again.

## Understand observations

The overview counts each reported PID once. Its recent range retains at most 120 observations while the overview is mounted. Release results compare Electron RSS snapshots before the request and approximately 1.5 seconds afterward; unrelated activity can change these values, so they are not guaranteed memory savings.

Recent page releases and reopenings retain at most 120 events for the current app run. The list shows the latest ten. A release event records a request, not proof that the operating system reclaimed memory. Events contain workspace and session identities, not page contents or URLs.

## Clean up workspaces

Open **Clean up workspaces**, review checks, optionally scan disk usage, select eligible workspaces, and confirm. The current workspace stays selected. Branches and linked external files are kept.

Confirmed unpushed commits block cleanup. The comparison uses local remote-tracking references and does not fetch the remote. If an upstream is unavailable, the list says so and keeps the branch. Dirty files, running sessions, active agent turns, and pending attention also block cleanup.

A suggestion requires a PR reported as merged within the last five minutes, no commits ahead of the local upstream, and at least fourteen days since recorded activity. Suggestions do not replace the checks immediately before cleanup. Missing or stale evidence produces no suggestion.

## Limits

Automatic disk deletion is not provided. Sleep, release and PTY closure do not guarantee a specific amount of reclaimed operating-system memory. Long-running memory improvement must be measured on the installed application; isolated fixtures establish lifecycle behavior only.

# Resource Manager

Resource Manager shows process memory, Lens ownership, and controls for releasing hidden pages or cleaning up inactive workspaces. Open it from the memory usage indicator in the status bar. The indicator is a diagnostic surface: it appears only while **Developer mode** is on in `Settings > General`.

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

Expand **Workspace execution**, choose **Stop execution**, review the shutdown warning, and confirm. The host validates the workspace against the repository registry and refuses to stop it while a provider turn or script invocation is running or starting.

Once admitted, the host blocks new provider turns, terminal and CLI sessions, and workspace scripts before closing that workspace's PTYs and managed services. Terminal screen snapshots, code, conversations, and tab definitions are retained. Another workspace's sessions remain running. Lens pages have separate sleep and release controls; unknown or externally detached processes are not killed by ancestry guesses.

Choose **Resume execution** to allow new work. Previous commands are not automatically rerun; use the terminal restart control or start a new task. The barrier lasts for the host runtime lifetime, including while Resource Manager is closed. A host restart clears it. It is not a durable automation-pause setting.

If a stop only partially succeeds, new execution remains blocked and the result reports the error. The UI distinguishes an incomplete stop from a completed one. Explicit resume allows work again.

## Understand observations

The overview counts each reported PID once. Its recent range retains at most 120 observations while the overview is mounted. Release results compare Electron RSS snapshots before the request and approximately 1.5 seconds afterward; unrelated activity can change these values, so they are not guaranteed memory savings.

Recent page releases and reopenings retain at most 120 events for the current app run. The list shows the latest ten. A release event records a request, not proof that the operating system reclaimed memory. Events contain workspace and session identities, not page contents or URLs.

## Clean up workspaces

The cleanup center is available to everyone, independently of Developer mode.
Open **Clean up workspaces** from the command palette, a repository menu in the
sidebar, or the Fleet header. Resource Manager retains its shortcut.

The center groups all registered repositories and includes active workspaces,
archived history, and eligible branches without a workspace. Review suggestions,
blockers and optional disk usage before selecting rows. Use modifier-click,
shift-click or **Select all ready**, then choose **Archive**, **Delete
permanently**, **Delete branches**, or **Restore**. Results include skipped
items and their reasons; one failure does not cancel the rest. Archive has Undo.

Archive removes a clean managed worktree and preserves its branch and all
conversation history. It removes the workspace from the sidebar and Fleet.
Restore recreates the worktree when the branch exists. Otherwise it opens
read-only history and offers to create a new workspace with a draft based on
that history. Linked external worktrees are protected.

Permanent deletion confirms removal of history and the clean worktree. Branch
deletion is a separate choice, offered for merged or pushed branches. It uses
safe deletion; force deletion of an unmerged branch requires explicit opt-in,
off by default. Local remote-tracking evidence is used without fetching.

### Automatic cleanup

In **Settings > Workspaces**, each rule has its own toggle and number. All
rules start disabled: archive after a merged PR, archive after inactivity,
remove an archived worktree after a delay, and keep at most a chosen number of
worktrees per repository. **Run cleanup now** evaluates the enabled rules.

The host evaluates automatic cleanup at most hourly. Dirty files, unpushed
commits, current/default workspaces and running work are protected. A workspace
created for a responsibility is eligible only after that responsibility ends
and no publication is waiting. **Recent cleanup** records automatic actions
and provides Restore for retained history.

## Limits

Disk scans are informational and do not guarantee a particular amount of free
space. Cleanup does not fetch remote references. Missing evidence blocks an
action instead of guessing that work is safe to remove. Permanent deletion of
history has no Undo.

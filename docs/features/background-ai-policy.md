# Background AI

## Summary

- Stave makes a number of model calls you never asked for directly: it names your tasks, summarizes each finished turn, checks a diff against pinned intent, drafts PR descriptions, and completes code inline.
- `Settings → Background AI` shows every one of those lanes, lets you switch each off, and lets you choose the provider and model it runs on.

## When To Use It

- Use it when your token or credit usage is higher than the work you did seems to justify.
- Use it when you want a specific background lane to run on a cheaper model, or on the provider you are actually subscribed to.
- Use normal `Settings → Models` when you want to change the model your own turns run on. Background AI never touches that.

## Before You Start

- Open `Settings → Background AI`, under the `AI & Agents` group.
- Have at least one managed provider (Claude or Codex) configured, since every lane runs on one of them.

## Quick Start

1. Open `Settings → Background AI`.
2. Turn off any lane you do not want. It stops making model calls immediately; there is no separate apply step.
3. For a lane you keep, pick its `Provider` and `Model`.

## Interface Walkthrough

### Entry Points

- `Settings → Background AI`.
- Settings search finds the section by lane name (`intent guard`, `turn summary`), or by `cost`, `spend`, `credits`, and `tokens`.

### Key Controls

Each lane is one card with the same three controls:

- The switch decides whether the lane makes a model call at all. Off is always safe: a lane with a non-AI fallback keeps using it, and a lane without one simply produces nothing.
- `Provider` picks which managed provider answers the lane. Unset follows the task's own provider.
- `Model` picks the model. Leaving it empty follows the provider's default for that kind of call.

Lanes that keep a second attempt (currently `Turn summary`) also expose a `Fallback model`, tried once when the primary is unavailable or its answer cannot be parsed.

## Common Workflows

### Reduce Recurring Per-Turn Spend

1. Open `Settings → Background AI`.
2. Turn off `Turn summary` if you do not read the Information panel's summary line.
3. Turn off `Intent guard` if you do not pin intent anchors. (It is already inert when nothing is pinned.)
4. Leave `Task naming` on: by default it makes exactly one call per task.

### Move A Lane To Your Subscribed Provider

1. Open the lane's card.
2. Set `Provider` to the provider you pay for.
3. Set `Model` to that provider's cheapest model that still produces a usable result.

## Files And Data

The whole section is one app setting, exported and imported with the rest of your settings:

```json
{
  "auxiliaryInferencePolicy": {
    "turnSummary": {
      "enabled": true,
      "providerId": "claude-code",
      "model": "claude-haiku-4-5",
      "fallbackModel": null
    }
  }
}
```

## Limitations And Advanced Options

- The defaults are already the cheap ones. A lane whose model is unset resolves to its provider's lightest catalog model, so no background call inherits the model your own turns use.
- Several lanes are additionally gated on there being real work to do: the intent guard skips a turn that changed no files and reuses its previous verdict when the diff is byte-identical; the turn summary skips a turn with no assistant reply; task naming stops after the first user turn unless you raise its window.
- Delegated child tasks are not listed. Their runtime options are assembled in the main process, which has no view of these settings, so a switch here could not take effect.
- `Pre-PR review` still respects `Settings → Prompts → Pre-PR Review`; the switch there controls whether a review runs at all, and this lane controls what it runs on.

## Troubleshooting

### A Lane Still Seems To Run After I Turned It Off

- Symptom: you disabled a lane but still see a background result.
- Cause: the result is the lane's non-AI fallback, not a model call. `PR description` in particular keeps producing a deterministic draft from the branch diff.
- Fix: check whether the output changes between runs. A deterministic fallback does not.

### The Information Panel Summary Stopped Updating

- Symptom: the `Summary` section no longer refreshes after a turn.
- Cause: the `Turn summary` lane is off, the summary prompt is blank, or the turn produced no assistant text.
- Fix: re-enable the lane in `Settings → Background AI` and check `Settings → Prompts → Workspace Latest Turn Summary`.

## Related Docs

- [Workspace latest turn summary](workspace-latest-turn-summary.md)
- [Prompt enhancement](prompt-enhancement.md)
- [Child tasks](child-tasks.md)

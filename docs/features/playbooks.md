# Playbooks (Retired)

## Summary

Playbooks folded into agents. An agent now carries its own **workflow** — the
ordered stages a run follows, each an AI stage (instruction, **Done when**,
optionally done by another agent) or a Stave action (**Open draft PR**,
**Watch checks**, **Ready for review**, **Run script**) — and its own
**Check in with me** setting. See [Agents](agents.md#workflow).

## What Changed On Upgrade

- Each playbook you had saved appears once as a custom agent with the same
  name and stages, the Implementer's instructions (plus the playbook's
  constraints), the playbook's model and permission, and its check-ins. Delete
  the agent if you do not need it; it does not come back.
- The Playbooks tab, the **Start a mission** sheet, the composer's hand-off
  control and `!shortcut` playbook entries are gone. Assign the work to an
  agent instead: the composer's selector (**Agents**), **Assign to an agent…**
  in the command palette, or **Who** in Kickoff.
- Kickoff and the Issues kickoff sheet no longer offer a playbook.
- Playbook missions that were running finish as they are, and their Progress,
  report and Fleet surfaces keep working.
- Saved playbooks are kept read-only for existing [projects](projects.md) and
  for start conditions you set before; both are deprecated and will be
  removed in a later release. A proposal they make opens a task with the
  request drafted, ready for you to choose an agent and **Assign**.

## Related Docs

- [Agents](agents.md)
- [Agent runs and their stages](missions.md)

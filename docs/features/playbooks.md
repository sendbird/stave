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
- A playbook that saved only a permission (no model or effort) becomes an
  agent that Stave Auto routes. 0.23.0 fixed such an agent to Claude with no
  model; the next upgrade moves it to Stave Auto once, unless you changed the
  agent since.
- The Playbooks tab, the **Start a mission** sheet, the composer's hand-off
  control and `!shortcut` playbook entries are gone. Assign the work to an
  agent instead: the composer's selector (**Agents**), **Assign to an agent…**
  in the command palette, or **Who** in Kickoff.
- Kickoff and the Issues kickoff sheet no longer offer a playbook.
- Playbook missions that were running finish as they are, and their Progress,
  report and Fleet surfaces keep working.
- Saved playbooks stay as read-only data. Old playbook missions still render
  from them, and the upgrade that moves converted agents to Stave Auto still
  reads them.
- Start conditions saved on a playbook (an assigned issue, pull request
  trouble, a schedule) and proposed missions are removed. Nothing starts or
  proposes a mission on its own any more; assign the work to an agent instead.
- Projects are removed. Each project's memories were exported once to
  `<user data>/exports/project-memory/<project id>.md`; see
  [Repository Memory](repository-memory.md#upgrade-and-boundaries).

## Related Docs

- [Agents](agents.md)
- [Agent runs and their stages](missions.md)

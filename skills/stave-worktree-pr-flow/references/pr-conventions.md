# PR and Commit Conventions

## PR Title Format

PR titles must follow Conventional Commits: `type(scope): description`.

- Use the same type and scope as the commit message.
- The subject (description part) must be lowercase — never capitalise the first letter.
- Do not use plain natural-language titles.

Examples:
- `fix(workspace): reuse root node_modules in worktrees`
- `feat(ui): add dark mode toggle`

## Commit Messages

All commits must be Conventional Commit compliant. If the combined diff is not a coherent single commit, stop and ask rather than creating a misleading one-commit PR.

# Contributing to Stave

Thanks for your interest in contributing. Stave is a desktop AI coding workspace for Claude and Codex, built with Electron, React 19, and Bun.

## Before You Start

1. Read [AGENTS.md](AGENTS.md) for repository policy, including PR workflow, release workflow, design system, and runtime guardrail skills.
2. Read the [Developer and Contributing Guide](docs/developer/contributing.md) for the local development setup, required toolchains, and validation commands.
3. For anything touching the UI, theme, terminal runtime, IPC schemas, Zustand selectors, or long-lived React effects, follow the guardrail rules called out in [AGENTS.md](AGENTS.md).

## Development Setup

```bash
bun install
bun run dev:desktop
```

Full setup details, native rebuild notes, and troubleshooting live in [docs/developer/contributing.md](docs/developer/contributing.md).

## Local Validation

Run the smallest relevant check set for your change, and the full CI gate before opening a PR:

```bash
bun run typecheck
bun test
bun run build
bun run build:desktop
# or the combined CI gate
bun run test:ci
```

## Pull Requests

- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and PR titles (e.g. `feat(scope): description`, `fix(scope): description`).
- PR titles must be lowercase and use a matching `type(scope):` prefix.
- Fill out the PR template at [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md).
- Keep changes surgical — match the request, match local style, and avoid drive-by refactors.
- Update docs under `docs/` in the same change when behavior, architecture, UX, or release-facing details change.
- User-facing feature documentation lives under `docs/features/` and should start from `docs/templates/feature-guide-template.md`.

## Reporting Bugs And Requesting Features

Open an issue using one of the issue templates under [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/). Include reproduction steps, the environment (OS, Stave version, provider), and relevant logs or screenshots.

## Security

Do not open public issues for suspected vulnerabilities. See [SECURITY.md](SECURITY.md) for the private disclosure process.

## Code Of Conduct

By participating in this project, you agree to abide by the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the project's [Apache License 2.0](LICENSE).

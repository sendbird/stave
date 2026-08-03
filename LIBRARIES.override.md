# LIBRARIES.override.md

## Scope

- Project/Module: Stave desktop runtime
- Effective date: 2026-08-02

## Overrides

- Category: Anthropic Claude Agent SDK
- Packages: `@anthropic-ai/claude-agent-sdk` and its platform packages at `0.3.197`
- License: Anthropic legal agreements; the package metadata is not an open-source license.
- Exception: Keep the current SDK runtime dependency while Anthropic's June 2026 Agent SDK usage change is paused. This exception is limited to the exact package family, version, and `Custom:` license metadata recorded in `config/license-compliance.json`.
- Replaces: the permissive-license-only default for this provider integration.

## Rationale

- Stave's Claude runtime depends on the SDK and bundles its provider vendor.
- Anthropic's official June 15, 2026 usage change was paused; current subscription usage limits remain unchanged until a future notice.
- Reference: [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).
- The exception keeps the existing provider path reviewable without treating Anthropic's proprietary terms as a general license allowlist entry.

## Safety

- `bun run check:licenses` fails if the package family, exact version, or reported license changes.
- Provider authentication and distribution remain subject to Anthropic's current terms; do not add OAuth brokering or token forwarding.
- Re-review this exception before every SDK upgrade and before changing the distribution or authentication model.

# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Stave, please report it privately. Do not open a public GitHub issue, pull request, or discussion post.

Preferred reporting channel: use [GitHub Security Advisories](../../security/advisories/new) on this repository to open a private advisory. This routes the report directly to the maintainers and allows coordinated disclosure.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce, ideally with a minimal test case or proof of concept.
- The Stave version (from `Settings -> About` or `package.json`) and your OS.
- Any relevant logs, configuration, or provider context.

We aim to acknowledge reports within 5 business days and share an initial assessment within 10 business days. We will coordinate a disclosure timeline with the reporter once the issue is confirmed.

## Supported Versions

Security fixes target the latest released version. Older versions are not maintained. We recommend keeping Stave updated from the top-bar in-app update action or by re-running the installer.

## Scope

In scope:

- The Stave desktop application and its Electron main / renderer processes.
- The repository's build and packaging tooling under `scripts/` and `electron-builder.yml`.
- The renderer-to-main IPC bridge and provider runtime adapters.

Out of scope:

- Vulnerabilities in third-party providers (Claude, Codex) — report those upstream to the respective vendor.
- Issues that require a compromised local machine or rely on an attacker already having physical or administrative access.
- Rate limits, SSL/TLS grade, or configuration recommendations for services Stave talks to but does not operate.

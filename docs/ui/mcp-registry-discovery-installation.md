# MCP Registry Discovery and Installation

Status: design draft
Last reviewed: 2026-07-31
Source requirement: Ibis D4, “Stave MCP management improvements”

## Decision Summary

Add an `Installed` and `Discover` split to `Settings > MCP`.

- `Installed` remains the operational view: configuration, provider-specific
  connection state, recent error, and OAuth recovery.
- `Discover` searches an MCP Registry-compatible catalog, explains what a
  server will run or contact, and opens an explicit install review.
- Installation writes provider configuration only in the main process. A
  partial Claude/Codex install is rolled back or reported per target.
- Registry availability, installation state, authentication state, and live
  connection state remain separate concepts in the UI and data model.

The official MCP Registry is already available as a public preview as of this
review. Q4 should therefore be treated as a GA-readiness horizon, not as a
dependency for beginning read-only catalog integration.

## Registry Facts That Shape the Design

The design follows the current official contracts:

- The [official Registry overview](https://modelcontextprotocol.io/registry/about)
  describes a centralized metadata repository and recommends that host
  applications consume compatible downstream aggregators when they need
  additional curation.
- The [Registry quickstart](https://modelcontextprotocol.io/registry/quickstart)
  exposes versioned search and listing endpoints such as
  `GET /v0.1/servers?search=...`.
- Registry entries describe metadata; they do not host the MCP server
  executable or remote endpoint.
- A record may expose installable `packages`, directly connectable `remotes`,
  or both. Remote definitions and header metadata are documented in
  [Remote Servers](https://modelcontextprotocol.io/registry/remote-servers).
- Pagination and lifecycle status such as deprecated or deleted records must
  be preserved when consuming an official or downstream registry. See
  [Registry Aggregators](https://modelcontextprotocol.io/registry/registry-aggregators).
- The current contract is discoverable through the
  [official OpenAPI documentation](https://registry.modelcontextprotocol.io/docs)
  and the [official Registry repository](https://github.com/modelcontextprotocol/registry).

Stave must not depend on undocumented fields or assume that the official
Registry is the only catalog. The client boundary should be compatible with a
future curated or private downstream registry.

## Current Experience Audit

### What Stave can do now

`Settings > MCP` can list and manage configured entries from:

- Claude user, project, and local-project configuration
- Codex user configuration

The settings view supports reviewed create, update, rename, delete, and
Claude/Codex share operations; shows Claude and Codex runtime state; starts
supported OAuth recovery; and manages Stave's own local MCP registration
separately. A manual add can target Claude, Codex, or both. Configuration
writes accept environment-variable references rather than raw credential
values.

### Where the manual flow breaks down

There is now a general-purpose manual MCP transaction, but users still have to
find and evaluate a server elsewhere. Before Registry discovery ships, they
must:

1. Find a server elsewhere.
2. Decide whether its package, command, URL, and publisher are trustworthy.
3. Translate its instructions into Stave's command, URL, environment, and
   header fields.
4. Know which provider and scope should receive the configuration.

Stave now handles provider syntax, safe writes, review, and connection
diagnostics. Registry discovery still needs to supply provenance, compatible
variants, lifecycle metadata, and a coordinated multi-provider install review.

## Goals

- Make reputable MCP servers searchable without requiring prior knowledge of
  their exact package or URL.
- Show provenance, transport, authentication, execution, and requested secret
  inputs before installation.
- Install into Claude, Codex, or both with a clear target and scope.
- Reuse the same connection and recent-error model shown in `Installed`.
- Keep credentials and bound secret values out of renderer state, IPC
  responses, logs, and transcripts.
- Support official, curated downstream, and future private registries through
  one versioned client contract.
- Preserve a fully manual path for unlisted or private servers.

## Non-goals

- Ranking servers by an opaque Stave popularity score.
- Treating Registry publication as a security audit or endorsement.
- Automatically executing package setup from a search result.
- Sending private server definitions or local configuration to the public
  Registry.
- Building a private Registry service as part of the first release.

## Information Architecture

```text
Settings > MCP
┌───────────────────────────────────────────────────────────────┐
│ [Installed 18] [Discover]                    [Refresh status] │
├───────────────────────────────────────────────────────────────┤
│ Installed                                                     │
│ Summary: Connected 12/16 · Needs attention 3                 │
│ Server rows: source · transport · Claude · Codex · last error │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ [Installed 18] [Discover]                                     │
├───────────────────────────────────────────────────────────────┤
│ Search servers…                     Transport  Auth  Registry  │
│                                                               │
│ Publisher / Server name                         [View details] │
│ Short description · Remote or package · OAuth                │
│ Verified metadata · version · updated date                    │
└───────────────────────────────────────────────────────────────┘
```

`Installed` should remain the default tab so opening Settings never depends on
Registry network availability. Search is initiated only after the user opens
`Discover`.

## Discover Results

Each result row shows:

- display name and canonical server name
- publisher identity and Registry source
- short description
- remote, package, or both
- supported transport
- declared authentication mechanism
- latest compatible version and update date
- lifecycle warning for deprecated or deleted entries
- `Installed`, `Update available`, or `Not installed`

“Verified metadata” means only that the Registry's namespace and metadata
checks passed. It must not be rendered as “safe”, “audited”, or “endorsed”.

Default sorting:

1. exact name match
2. non-deprecated compatible entries
3. curated downstream rank, when the selected registry supplies one
4. canonical name

The UI must disclose when ordering comes from a downstream registry.

## Server Details

Opening a result shows a side sheet or nested settings page with:

- publisher and Registry provenance
- full description and documentation link
- package identifiers, runtime, version, registry URL, and integrity metadata
- remote URL, transport, and required header names
- requested environment variable names and which are secrets
- declared capabilities when available
- supported Claude/Codex install targets
- version history and lifecycle status
- the exact command or endpoint Stave proposes to configure

External links use the existing safe external-URL path. Rich Registry content
is rendered as plain text or sanitized Markdown; arbitrary HTML is never
executed.

## Install Review

Installation never starts from the search row itself. `Install` opens a review:

```text
Install “Example MCP”

Target providers
  [x] Claude
  [x] Codex

Scope
  (•) User
  ( ) Current project      unavailable for targets that lack this scope

Connection
  Remote: https://mcp.example.com
  Authentication: OAuth

Secrets
  API_TOKEN  [Select from Stave Vault…]

Changes
  Claude user config: add mcpServers.example
  Codex user config: add mcp_servers.example

                          [Cancel] [Install]
```

For packages, the review includes the executable, package registry, resolved
version, arguments, and integrity data. Never hide a shell command behind a
generic “Install” label.

Secret inputs select or create Vault records by ID. Values are resolved only in
the main process at provider runtime start and never return to the renderer.

## State Model

The UI must model these axes independently:

| Axis           | States                                                                           |
| -------------- | -------------------------------------------------------------------------------- |
| Catalog        | loading, ready, empty, unavailable, stale                                        |
| Installation   | not-installed, installing, installed, partial, updating, removing, failed        |
| Authentication | not-required, required, waiting-for-browser, authenticated, expired, unavailable |
| Connection     | configured, starting, connected, failed, disabled, unknown                       |

A server can be `installed + authentication required + connection failed`.
Collapsing those into one “error” badge would remove the next action the user
needs.

Recent connection errors remain visible after recovery for the current app
session. A later persistence design may retain bounded, sanitized diagnostics
across restarts, but it must define expiry and secret-redaction behavior first.

## Installation Transaction

1. Fetch the selected record again by canonical identity and version.
2. Validate it against the supported Registry schema version.
3. Resolve a remote or package variant compatible with the selected provider.
4. Collect target scope and Vault secret IDs.
5. Show the exact provider-specific change.
6. Re-read each destination to detect changes since review.
7. Write through a provider-specific main-process adapter using an atomic
   temporary file and rename where the platform permits.
8. Refresh discovery and provider runtime status.
9. If authentication is required, start the provider's OAuth flow.
10. Poll status until connected, failed, cancelled, or timed out.
11. Report one outcome per provider.

If the second provider fails after the first succeeds, the result is `partial`.
The user can keep the successful target or roll it back. Stave must never imply
that both targets were installed successfully.

## Proposed Internal Boundaries

```ts
interface McpRegistryClient {
  search(input: McpRegistrySearchInput): Promise<McpRegistrySearchPage>;
  getServer(input: McpRegistryServerLookup): Promise<McpRegistryServerRecord>;
}

interface McpConfigAdapter {
  preview(input: McpInstallIntent): Promise<McpConfigChangePreview>;
  apply(input: McpInstallIntent): Promise<McpConfigMutationResult>;
  remove(input: McpRemoveIntent): Promise<McpConfigMutationResult>;
}
```

The Registry client owns:

- endpoint selection and API-version negotiation
- cursor pagination
- timeout, retry, cancellation, and bounded response size
- schema validation and lifecycle normalization
- short-lived, non-sensitive search caching

Provider config adapters own:

- Claude/Codex schema translation
- supported scope detection
- concurrent-edit detection
- atomic mutation and rollback metadata
- preserving comments and unrelated configuration where possible

The renderer sends install intent and Vault record IDs, never raw secret
values. It receives sanitized previews and results.

## Security and Trust

- Registry presence is metadata provenance, not a security guarantee.
- Default to exact versions for packages. Updates require a new review if the
  command, package source, permissions, remote origin, or secret requirements
  change.
- Show publisher namespace, package registry, remote hostname, and integrity
  metadata before install.
- Permit only supported package registries and transports in the first release.
- Do not interpolate Registry strings into a shell command. Spawn an executable
  with an argument array through the existing subprocess boundary.
- Block remote redirects to unsupported protocols.
- Never log authorization URLs after they may contain short-lived state, OAuth
  callback payloads, bearer values, or resolved Vault secrets.
- Private registry credentials belong in main-process credential storage and
  are referenced from renderer settings by opaque ID.
- Provide a `Report metadata issue` link to the selected Registry's canonical
  record when supported.

## Failure and Offline Experience

- `Installed` continues working when every Registry is offline.
- `Discover` distinguishes no results from network failure.
- A cached page is visibly labeled with its fetch time and is never used to
  install without revalidation.
- Search retries use bounded exponential backoff and respect explicit user
  cancellation.
- Schema incompatibility identifies the Registry source and supported API
  versions without exposing raw response bodies.
- Install failures show the failed step, affected provider, rollback result,
  and a retry action.

## Accessibility

- Tabs use the existing accessible tabs primitive and preserve focus when
  results refresh.
- Search has a persistent label; filters are keyboard reachable and announce
  result count changes politely.
- Result rows are not click-only containers. Name links and action buttons have
  distinct focus targets.
- Status never relies on color alone; every badge has text.
- Install progress uses `aria-live="polite"`. Destructive rollback failure uses
  an alert.
- Focus returns to the originating result after closing details or install
  review.

## Rollout

### Phase 1: read-only discovery

- Add the Registry client behind a feature flag.
- Support official Preview search plus one configurable compatible endpoint.
- Ship details, provenance, pagination, offline states, and “copy manual
  configuration”; do not mutate provider config.

### Phase 2: remote installation

- Support reviewed Streamable HTTP and SSE entries.
- Add Claude/Codex user-scope config adapters.
- Connect install completion to provider status and OAuth.
- Add atomic rollback and partial-result recovery.

### Phase 3: package and downstream support

- Add an allowlisted package-runtime matrix.
- Pin versions and surface integrity metadata.
- Add curated downstream and credentialed private registry profiles.
- Add update and remove transactions.

### Phase 4: GA hardening

- Validate against the current stable Registry API.
- Migrate Preview cache and identities if the schema changes.
- Complete telemetry, load, failure-recovery, and accessibility audits.
- Remove the feature flag only after provider config round-trip tests pass on
  every supported platform.

## Success Measures

- Median time from opening `Discover` to a connected server.
- Search-to-details and details-to-install conversion.
- Install success and rollback success by provider and transport.
- Share of installs that require leaving Stave.
- OAuth completion rate and median completion time.
- Connection failure rate grouped by configuration, authentication, startup,
  and transport.
- Registry unavailable rate. Search text, credentials, secret names, and
  private server metadata are excluded from telemetry.

## Open Questions

- Which curated downstream registry, if any, should Stave select by default?
- Should project scope be offered only when both providers support an
  equivalent durable configuration?
- Which package runtimes are safe and supportable for the first package phase?
- How should Stave preserve comments when updating Codex TOML?
- What publisher or namespace signals may be described as verified without
  implying a security audit?
- What bounded retention policy is acceptable if recent errors become
  persistent?

## Acceptance Criteria for the First Implemented Slice

- Opening `Installed` performs no Registry network request.
- `Discover` can search, paginate, cancel, retry, and render an unavailable
  state against an MCP Registry-compatible endpoint.
- Every result exposes Registry source, publisher, transport, authentication,
  lifecycle status, and exact package or remote target.
- No config mutation occurs without an explicit review.
- A remote install reports Claude and Codex outcomes independently.
- OAuth-required installs continue into the existing provider-specific OAuth
  flow and update connection status without reopening Settings.
- Secret values never enter renderer state, IPC responses, diagnostics, or
  Registry requests.
- Keyboard-only and screen-reader flows cover search, details, review,
  installation, OAuth waiting, failure, and retry.

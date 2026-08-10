# Hirondelle Sync (Stave) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Stave half of Hirondelle ↔ Stave workspace sync: generalize the Crane connector into an Atelier connector (scoped credentials, OS-encrypted vault, one-time migration), add a durable SQLite outbox + retrying sync runtime that pushes workspace events and resource links to Hirondelle, pull project context bundles into `<worktree>/.stave/context/hirondelle/<slug>.md`, expose 4 MCP tools, and surface settings + Information-panel UI. Assumes the Atelier server API (spec §4) already exists.

**Architecture:** Renderer trigger points (`pr.afterOpen`, task archiving, turn summaries, WI edits) send `hirondelle-sync:*` IPC to Electron main. Main owns credentials (`electron/main/atelier-connector/`, vault at `userData/atelier-connector.v1.json`, migrated once from `crane-connector.v1.json`) and the sync engine (`electron/main/hirondelle-sync/`): synchronous enqueue into the `hirondelle_sync_outbox` SQLite table, then a Crane-style serialized operation queue with generation-guarded `setTimeout` and exponential backoff drains it against 4 Atelier HTTPS endpoints. Agent-driven WI changes are observed in main via the existing `local-mcp.workspace-information-updated` host-service event. The workspace ↔ project mapping is a first-class `hirondelleProject` field on `WorkspaceInformationState`, mutated only through a new host-service local-mcp action so all consumers (renderer panel, MCP tools, persistence) stay consistent. Contract `stave-sync-v1` is a shared Zod module with JSON fixtures duplicated in both repos (same pattern as `stave-dispatch-v1`).

**Tech Stack:** TypeScript, Electron (main/preload/host-service), Zod v3-style schemas, better-sqlite3 (prod) / `bun:sqlite` (tests), Zustand renderer store, `@modelcontextprotocol/sdk` `registerTool`, `bun test`.

## Global Constraints

- Use Bun for everything: `bun test`, `bun run typecheck`, `bunx --bun` instead of `npx`; run all commands from the worktree root `<stave-worktree>`.
- Per-task gate: `bun run typecheck` + the task's focused `bun test tests/hirondelle-*.test.ts` must pass before commit.
- `src/store/app.store.ts` is ratcheted at 3148 lines (currently 3108) — keep total additions there under ~25 lines; all logic lives in `src/lib/hirondelle-sync/renderer-triggers.ts`.
- Any `switch` over the new unions (`HirondelleOutboxKind`, `HirondelleOutboxStatus`, `StaveSyncEventKind`) must be exhaustive (`default` returning `never`-checked value) so `check:switch-exhaustiveness` conventions hold.
- The contract version literal is `"stave-sync-v1"` — it appears only in `src/lib/hirondelle-sync/contract.ts` and fixtures; everything else imports it.
- Secrets (`stc_`) live only in the OS-encrypted vault file; never in `AppSettings`, IPC responses, logs, or error messages (follow crane `safeConnectorErrorMessage` / log-sanitizer patterns).
- No competing-product references in code, docs, commits, or fixtures (AGENTS.md rule); commit messages use Conventional Commits.

---

### Task 1: Shared `stave-sync-v1` contract, settings types, and link mapping

**Files:**
- Create: `src/lib/hirondelle-sync/contract.ts`
- Create: `src/lib/hirondelle-sync/types.ts`
- Create: `src/lib/hirondelle-sync/links.ts`
- Create: `tests/fixtures/stave-sync-v1/valid-project-list.json`, `valid-context-bundle.json`, `valid-events-request.json`, `valid-events-response.json`, `valid-links-merge-request.json`, `invalid-event-kind.json`, `invalid-event-forbidden-property.json`, `invalid-links-non-https.json`
- Test: `tests/hirondelle-sync-contract.test.ts`, `tests/hirondelle-sync-settings.test.ts`

**Interfaces:**
- Consumes: `WorkspaceInformationState` from `src/lib/workspace-information.ts` (links.ts only).
- Produces: `STAVE_SYNC_CONTRACT_VERSION`, `StaveSyncEventV1Schema`, `StaveSyncEventsRequestV1Schema`, `StaveSyncEventsResponseV1Schema`, `StaveSyncLinkV1Schema`, `StaveSyncLinksMergeRequestV1Schema`, `StaveSyncLinksMergeResponseV1Schema`, `HirondelleProjectRowV1Schema`, `HirondelleProjectListResponseV1Schema`, `HirondelleContextBundleV1Schema`, `toHirondelleProjectSummary(row, baseUrl): HirondelleProjectSummary`; `HirondelleSyncSettingsSchema`, `DEFAULT_HIRONDELLE_SYNC_SETTINGS`, `normalizeHirondelleSyncSettings(value: unknown): HirondelleSyncSettings`; `buildHirondelleSyncLinks(info: WorkspaceInformationState): StaveSyncLinkV1[]`.

- [ ] **Step 1: Write the failing tests**

`tests/hirondelle-sync-contract.test.ts` (model: `tests/crane-stave-contract.test.ts`):

```ts
import { describe, expect, test } from "bun:test";
import {
  HirondelleContextBundleV1Schema,
  HirondelleProjectListResponseV1Schema,
  STAVE_SYNC_CONTRACT_VERSION,
  StaveSyncEventsRequestV1Schema,
  StaveSyncEventsResponseV1Schema,
  StaveSyncLinksMergeRequestV1Schema,
} from "../src/lib/hirondelle-sync/contract";
import { buildHirondelleSyncLinks } from "../src/lib/hirondelle-sync/links";
import { createEmptyWorkspaceInformation } from "../src/lib/workspace-information";

const fixtureDirectory = new URL("./fixtures/stave-sync-v1/", import.meta.url);
async function readFixture(name: string) {
  return Bun.file(new URL(name, fixtureDirectory)).json();
}

describe("stave-sync-v1 contract", () => {
  test("exposes the pinned contract version", () => {
    expect(STAVE_SYNC_CONTRACT_VERSION).toBe("stave-sync-v1");
  });

  test("accepts the shared valid fixtures", async () => {
    expect(
      StaveSyncEventsRequestV1Schema.safeParse(
        await readFixture("valid-events-request.json"),
      ).success,
    ).toBe(true);
    expect(
      StaveSyncEventsResponseV1Schema.safeParse(
        await readFixture("valid-events-response.json"),
      ).success,
    ).toBe(true);
    expect(
      StaveSyncLinksMergeRequestV1Schema.safeParse(
        await readFixture("valid-links-merge-request.json"),
      ).success,
    ).toBe(true);
    expect(
      HirondelleProjectListResponseV1Schema.safeParse(
        await readFixture("valid-project-list.json"),
      ).success,
    ).toBe(true);
    expect(
      HirondelleContextBundleV1Schema.safeParse(
        await readFixture("valid-context-bundle.json"),
      ).success,
    ).toBe(true);
  });

  test("rejects invalid fixtures", async () => {
    expect(
      StaveSyncEventsRequestV1Schema.safeParse(
        await readFixture("invalid-event-kind.json"),
      ).success,
    ).toBe(false);
    expect(
      StaveSyncEventsRequestV1Schema.safeParse(
        await readFixture("invalid-event-forbidden-property.json"),
      ).success,
    ).toBe(false);
    expect(
      StaveSyncLinksMergeRequestV1Schema.safeParse(
        await readFixture("invalid-links-non-https.json"),
      ).success,
    ).toBe(false);
  });

  test("rejects event batches above 20 entries", async () => {
    const { events } = await readFixture("valid-events-request.json");
    const oversized = Array.from({ length: 21 }, (_, index) => ({
      ...events[0],
      staveEventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    expect(
      StaveSyncEventsRequestV1Schema.safeParse({ events: oversized }).success,
    ).toBe(false);
  });

  test("maps workspace information resources to hirondelle links", () => {
    const info = createEmptyWorkspaceInformation();
    info.linkedPullRequests.push({
      id: "pr-1", title: "Add sync", url: "https://github.com/acme/repo/pull/12",
      status: "open", note: "",
    });
    info.figmaResources.push({
      id: "figma-1", title: "Sync flows", url: "https://www.figma.com/design/abc",
      nodeId: "", note: "",
    });
    info.jiraIssues.push({
      id: "jira-1", issueKey: "ACME-7", title: "Sync epic",
      url: "https://acme.atlassian.net/browse/ACME-7", status: "", note: "",
    });
    info.slackThreads.push({
      id: "slack-1", url: "https://acme.slack.com/archives/C1/p1",
      channelName: "#eng", note: "",
    });
    const links = buildHirondelleSyncLinks(info);
    expect(links).toEqual([
      { kind: "github", url: "https://github.com/acme/repo/pull/12", label: "Add sync" },
      { kind: "figma", url: "https://www.figma.com/design/abc", label: "Sync flows" },
      { kind: "slack", url: "https://acme.slack.com/archives/C1/p1", label: "#eng" },
      { kind: "other", url: "https://acme.atlassian.net/browse/ACME-7", label: "ACME-7: Sync epic" },
    ]);
  });

  test("skips resources without an https url", () => {
    const info = createEmptyWorkspaceInformation();
    info.jiraIssues.push({
      id: "jira-2", issueKey: "ACME-8", title: "Draft", url: "", status: "", note: "",
    });
    expect(buildHirondelleSyncLinks(info)).toEqual([]);
  });
});
```

`tests/hirondelle-sync-settings.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_HIRONDELLE_SYNC_SETTINGS,
  normalizeHirondelleSyncSettings,
} from "../src/lib/hirondelle-sync/types";

describe("hirondelle sync settings", () => {
  test("defaults are factual-on, interpretive-off, master-off", () => {
    expect(DEFAULT_HIRONDELLE_SYNC_SETTINGS).toEqual({
      enabled: false,
      prOpened: true,
      taskCompleted: true,
      resourceLinks: true,
      turnSummaries: false,
    });
  });

  test("normalize returns defaults for garbage", () => {
    expect(normalizeHirondelleSyncSettings(undefined)).toEqual(
      DEFAULT_HIRONDELLE_SYNC_SETTINGS,
    );
    expect(normalizeHirondelleSyncSettings("nope")).toEqual(
      DEFAULT_HIRONDELLE_SYNC_SETTINGS,
    );
    expect(normalizeHirondelleSyncSettings(null)).toEqual(
      DEFAULT_HIRONDELLE_SYNC_SETTINGS,
    );
  });

  test("normalize salvages known booleans and drops unknown keys", () => {
    expect(
      normalizeHirondelleSyncSettings({
        enabled: true,
        turnSummaries: true,
        futureField: "from-a-newer-build",
      }),
    ).toEqual({
      enabled: true,
      prOpened: true,
      taskCompleted: true,
      resourceLinks: true,
      turnSummaries: true,
    });
  });
});
```

Fixture `valid-events.json` (same file name as the Atelier side):

```json
{
  "contract": "stave-sync-v1",
  "events": [
    {
      "staveEventId": "3f1c2a34-9d1e-4b7a-8f7d-2f6f0f9a1b2c",
      "kind": "pr_opened",
      "tier": "factual",
      "summary": "PR #12: Add sync",
      "sourceUrl": "https://github.com/acme/repo/pull/12",
      "workspaceName": "feat/sync",
      "branch": "feat/sync"
    }
  ]
}
```

`valid-project-list.json`, `valid-context-bundle.json`, `valid-links-merge.json` and the
invalid fixtures are **byte-identical copies** of the Atelier repo's
`apps/hirondelle/tests/fixtures/stave-sync-v1/` (authored in the Atelier plan, Task 4);
copy them verbatim rather than re-authoring — the duplicated fixtures are the
cross-repo contract check.

- [ ] **Step 2: Run tests to verify they fail** — `bun test tests/hirondelle-sync-contract.test.ts tests/hirondelle-sync-settings.test.ts`; expect `error: Cannot find module '../src/lib/hirondelle-sync/contract'`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/hirondelle-sync/contract.ts` (model: `src/lib/crane-connector/contract.ts` — trimmed strings, `.strict()`, byte-free limits object):

```ts
import { z } from "zod";

export const STAVE_SYNC_CONTRACT_VERSION = "stave-sync-v1" as const;

// Mirrors the SERVER module apps/hirondelle/src/server/stave-sync-contract.mjs
// (Atelier plan Task 4) — limits, field names, and wire shapes are the server's.
// Do not "improve" them on this side; fixtures are byte-identical copies of the
// Atelier repo's apps/hirondelle/tests/fixtures/stave-sync-v1/.
export const STAVE_SYNC_LIMITS = Object.freeze({
  batch: 20,
  branch: 200,
  label: 300,
  linksPerMerge: 50,
  note: 500,
  summary: 2_000,
  url: 2_048,
  workspaceName: 200,
});

// Outbound-only tightening: the server accepts any URL ≤ 2048; Stave never
// SENDS a non-HTTPS URL. Response fields parse as plain strings.
const httpsUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(STAVE_SYNC_LIMITS.url)
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Hirondelle sync links must use HTTPS.",
  });

export const STAVE_SYNC_EVENT_KINDS = [
  "pr_opened",
  "task_completed",
  "workspace_linked",
  "workspace_unlinked",
  "work_update",
] as const;
export type StaveSyncEventKind = (typeof STAVE_SYNC_EVENT_KINDS)[number];

// Full server enum (hirondelle_links.kind); Stave only emits a subset
// (github/figma/slack/other) but must parse all of them in bundles.
export const STAVE_SYNC_LINK_KINDS = [
  "prd",
  "api_spec",
  "figma",
  "slack",
  "github",
  "other",
] as const;

export const StaveSyncEventV1Schema = z
  .object({
    staveEventId: z.string().uuid(),
    kind: z.enum(STAVE_SYNC_EVENT_KINDS),
    summary: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.summary),
    sourceUrl: httpsUrlSchema.nullish(),
    tier: z.enum(["factual", "interpretive"]).default("factual"),
    workspaceName: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.workspaceName),
    branch: z.string().trim().max(STAVE_SYNC_LIMITS.branch).default(""),
  })
  .strict();

export const StaveSyncEventsRequestV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    events: z.array(StaveSyncEventV1Schema).min(1).max(STAVE_SYNC_LIMITS.batch),
  })
  .strict();

export const StaveSyncEventsResponseV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    results: z.array(
      z
        .object({
          staveEventId: z.string().uuid(),
          status: z.enum(["inserted", "duplicate"]),
        })
        .strict(),
    ),
  })
  .strict();

export const StaveSyncLinkV1Schema = z
  .object({
    kind: z.enum(STAVE_SYNC_LINK_KINDS),
    label: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.label),
    url: httpsUrlSchema,
    note: z.string().max(STAVE_SYNC_LIMITS.note).default(""),
  })
  .strict();

export const StaveSyncLinksMergeRequestV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    links: z.array(StaveSyncLinkV1Schema).min(1).max(STAVE_SYNC_LIMITS.linksPerMerge),
  })
  .strict();

export const StaveSyncLinksMergeResponseV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    results: z.array(
      z
        .object({
          url: z.string(),
          action: z.enum(["inserted", "updated", "skipped"]),
        })
        .strict(),
    ),
  })
  .strict();

// Server project row (13 fields, `id` not `ref`, and NO `url`). Stave derives
// the web URL and the stable ref client-side via toHirondelleProjectSummary.
export const HirondelleProjectRowV1Schema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    summary: z.string(),
    status: z.enum(["active", "archived"]),
    visibility: z.enum(["personal", "shared"]),
    syncIntervalMinutes: z.number(),
    lastSyncedAt: z.string().nullable(),
    archivedAt: z.string().nullable(),
    archiveReason: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export const HirondelleProjectListResponseV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    projects: z.array(HirondelleProjectRowV1Schema),
  })
  .strict();

const bundleSectionsSchema = z
  .object({
    members: z.array(
      z
        .object({ id: z.string(), role: z.string(), name: z.string(), userId: z.string().nullable(), scope: z.string(), position: z.number() })
        .strict(),
    ),
    links: z.array(
      z
        .object({ id: z.string(), kind: z.enum(STAVE_SYNC_LINK_KINDS), label: z.string(), url: z.string(), note: z.string(), origin: z.enum(["stave"]).nullable(), position: z.number() })
        .strict(),
    ),
    properties: z.array(
      z
        .object({ id: z.string(), group: z.enum(["environment", "github"]), label: z.string(), value: z.string(), position: z.number() })
        .strict(),
    ),
    stages: z.array(
      z
        .object({ id: z.string(), name: z.string(), plannedDate: z.string(), actualDate: z.string(), status: z.enum(["예정", "진행중", "대기", "완료", "지연", "취소"]), note: z.string(), position: z.number() })
        .strict(),
    ),
    memory: z.array(
      z
        .object({ id: z.string(), kind: z.enum(["decision", "constraint", "gotcha"]), body: z.string(), sourceUrl: z.string().nullable(), sourceLabel: z.string().nullable(), autoExtracted: z.boolean(), changeEventId: z.string().nullable(), position: z.number() })
        .strict(),
    ),
  })
  .strict();

export const HirondelleContextBundleV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT_VERSION),
    project: HirondelleProjectRowV1Schema,
    sections: bundleSectionsSchema,
    events: z.array(
      z
        .object({
          id: z.string(),
          projectId: z.string(),
          source: z.string(),
          kind: z.string(),
          summary: z.string(),
          sourceUrl: z.string().nullable(),
          tier: z.enum(["factual", "interpretive"]),
          metadata: z.record(z.string(), z.unknown()),
          detectedAt: z.string(),
        })
        .strict(),
    ),
    markdown: z.string(),
  })
  .strict();

// Client-side convenience shape used by the picker, the WI field, and MCP tools.
export type HirondelleProjectSummary = {
  ref: string; // slug — human-readable and stable enough as the mapping key
  slug: string;
  name: string;
  status: "active" | "archived";
  summary: string;
  url: string; // `${baseUrl}/apps/hirondelle/p/${slug}`
  updatedAt: string;
};

export function toHirondelleProjectSummary(
  row: HirondelleProjectRowV1,
  baseUrl: string,
): HirondelleProjectSummary {
  return {
    ref: row.slug,
    slug: row.slug,
    name: row.name,
    status: row.status,
    summary: row.summary,
    url: `${baseUrl.replace(/\/+$/, "")}/apps/hirondelle/p/${row.slug}`,
    updatedAt: row.updatedAt,
  };
}

export type StaveSyncEventV1 = z.infer<typeof StaveSyncEventV1Schema>;
export type StaveSyncLinkV1 = z.infer<typeof StaveSyncLinkV1Schema>;
export type HirondelleProjectRowV1 = z.infer<typeof HirondelleProjectRowV1Schema>;
export type HirondelleContextBundleV1 = z.infer<typeof HirondelleContextBundleV1Schema>;
```

`src/lib/hirondelle-sync/types.ts` — `HirondelleSyncSettingsSchema` strict object of the five booleans, `DEFAULT_HIRONDELLE_SYNC_SETTINGS` frozen, `normalizeHirondelleSyncSettings` = safeParse, else per-key `typeof x === "boolean"` salvage over defaults (mirror `normalizeCraneConnectorSettings` in `src/lib/crane-connector/types.ts:294`). Also define the IPC arg schemas used later (kept here so `electron/main/ipc/schemas.ts` can re-export, same as crane):

```ts
export const HirondelleSyncConfigureArgsSchema = HirondelleSyncSettingsSchema;
export const HirondelleListProjectsArgsSchema = z
  .object({ query: z.string().trim().max(200).optional(), limit: z.number().int().min(1).max(50).optional() })
  .strict();
export const HirondelleWorkspaceArgsSchema = z
  .object({ workspaceId: z.string().trim().min(1).max(256) })
  .strict();
export const HirondelleLinkProjectArgsSchema = z
  .object({ workspaceId: z.string().trim().min(1).max(256), projectRef: z.string().trim().min(1).max(128) })
  .strict();
export const HirondelleSyncEnqueueArgsSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(256),
    projectRef: z.string().trim().min(1).max(128),
    kind: z.enum(STAVE_SYNC_EVENT_KINDS),
    summary: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.summary),
    sourceUrl: z.string().trim().max(STAVE_SYNC_LIMITS.url).optional(),
    workspaceName: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.workspaceName),
    branch: z.string().trim().max(STAVE_SYNC_LIMITS.branch),
  })
  .strict();
export const HirondelleSyncLinksChangedArgsSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(256),
    projectRef: z.string().trim().min(1).max(128),
    links: z.array(StaveSyncLinkV1Schema).max(STAVE_SYNC_LIMITS.linksPerMerge),
  })
  .strict();
```

`src/lib/hirondelle-sync/links.ts` — pure mapping per spec §6.2, ordered PRs → figma → slack → jira → confluence → storybook → amplify; skip entries whose `url` fails `StaveSyncLinkV1Schema` https check; labels: PR title (fallback url), figma/storybook/confluence/amplify title/label, slack `channelName` fallback url, jira `` `${issueKey}: ${title}` ``.

- [ ] **Step 4: Run tests to verify they pass** — `bun test tests/hirondelle-sync-contract.test.ts tests/hirondelle-sync-settings.test.ts` and `bun run typecheck`.
- [ ] **Step 5: Commit** — `git add src/lib/hirondelle-sync tests/hirondelle-sync-contract.test.ts tests/hirondelle-sync-settings.test.ts tests/fixtures/stave-sync-v1 && git commit -m "feat(hirondelle-sync): add stave-sync-v1 contract, settings types, and link mapping" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 2: Atelier credential vault with scopes + one-time crane vault migration

**Files:**
- Create: `src/lib/atelier-connector/types.ts`
- Create: `electron/main/atelier-connector/credential-vault.ts`
- Create: `electron/main/atelier-connector/credential-service.ts`
- Modify: `electron/main/crane-connector/credential-service.ts` (delegate to atelier vault)
- Modify: `electron/main/crane-connector/runtime.ts` (~line 30/66: widen `vault` dependency to a structural interface)
- Modify: `electron/main/crane-connector/credential-vault.ts` (export the structural `CraneCredentialStore` interface)
- Test: `tests/hirondelle-atelier-vault.test.ts`

**Interfaces:**
- Consumes: `CraneConnectorMetadataSchema` from `src/lib/crane-connector/types.ts`; `CraneCredentialVaultCrypto` shape from `electron/main/crane-connector/credential-vault.ts`.
- Produces:
  - `src/lib/atelier-connector/types.ts`: `ATELIER_CONNECTOR_SCOPES = ["crane", "hirondelle"] as const`, `AtelierConnectorScope`, `AtelierConnectorScopeSchema`, `AtelierConnectorPairInputSchema` (`{ baseUrl, code (stp_), name, requestedScopes: array of scope enum, min 1 }` — extends `CraneConnectorPairInputSchema` shape), `AtelierConnectorPublicStatusSchema` (`{ paired, connector: CraneConnectorMetadata | null, scopes: AtelierConnectorScope[], secureStorageAvailable, lastErrorCode }`).
  - `AtelierConnectorCredentialVault` class: same public surface as `CraneConnectorCredentialVault` (`isSecureStorageAvailable`, `getMetadata`, `getCredential`, `saveCredential`, `clear`, `putLease`, `getLease`, `deleteLease`) with `getCredential(): Promise<AtelierConnectorCredential | null>` where `AtelierConnectorCredential = { baseUrl; connector; scopes: AtelierConnectorScope[]; secret }`, and `saveCredential(input: { baseUrl; connector; secret; scopes?: AtelierConnectorScope[] })` defaulting `scopes` to `["crane"]` so the crane runtime's `pair()` call is behavior-identical.
  - `getAtelierConnectorCredentialVault()` singleton (file `atelier-connector.v1.json` in `app.getPath("userData")`, crypto wiring copied from `electron/main/crane-connector/credential-service.ts:13`).
  - Migration: constructor takes optional `legacyCraneFilePath`; `readDocument()` on ENOENT of the atelier file parses the legacy crane document (duplicate the crane `VaultDocumentSchema` locally as `LegacyCraneVaultDocumentSchema`), transforms via exported pure `migrateCraneVaultDocument(legacy)` (adds `scopes: ["crane"]` to the stored connector), writes the new file atomically (`0o600`, temp+rename, reuse crane `writeDocument` logic), then `fs.rm(legacyCraneFilePath)`.

- [ ] **Step 1: Write the failing test** — `tests/hirondelle-atelier-vault.test.ts` modeled on `tests/crane-connector-credential-vault.test.ts` (fake crypto `encrypted:` prefix, tmpdir per test):
  - save/get round-trip preserves `scopes: ["crane", "hirondelle"]`;
  - `saveCredential` without `scopes` stores `["crane"]`;
  - migration: write a legacy `crane-connector.v1.json` document (version 1, connector + one lease, secret ciphertext `Buffer.from("encrypted:stc_legacy").toString("base64")`) at `legacyCraneFilePath`, construct vault with both paths, `getCredential()` returns the legacy secret with `scopes: ["crane"]`, the atelier file now exists, and the legacy file is deleted (`existsSync(legacyPath) === false`);
  - migration is one-time: a second vault instance reads the atelier file without touching the (now absent) legacy path;
  - corrupted legacy file → vault behaves as empty (returns `null`, does not throw on read) and leaves the corrupted file in place;
  - insecure backend (`isInsecureBackend: () => true`) → `getCredential` throws the crane-style error.
- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-atelier-vault.test.ts`; expect `Cannot find module '../electron/main/atelier-connector/credential-vault'`.
- [ ] **Step 3: Write minimal implementation** — copy `CraneConnectorCredentialVault` structure (mutation queue, `assertSecureEncryption`, bounded schemas, atomic write) into `AtelierConnectorCredentialVault` with `StoredConnectorSchema.extend({ scopes: z.array(AtelierConnectorScopeSchema).min(1).max(2) })`. Then rewire crane:

```ts
// electron/main/crane-connector/credential-service.ts (replace body)
import { getAtelierConnectorCredentialVault } from "../atelier-connector/credential-service";

export function getCraneConnectorCredentialVault() {
  return getAtelierConnectorCredentialVault();
}
export function resetCraneConnectorCredentialVaultForTests() {
  resetAtelierConnectorCredentialVaultForTests();
}
```

In `electron/main/crane-connector/credential-vault.ts` export a structural interface and use it in `runtime.ts`:

```ts
export interface CraneCredentialStore {
  isSecureStorageAvailable(): boolean;
  getMetadata(): Promise<Omit<CraneConnectorCredential, "secret"> | null>;
  getCredential(): Promise<CraneConnectorCredential | null>;
  saveCredential(input: CraneConnectorCredential): Promise<void>;
  clear(): Promise<boolean>;
  putLease(input: CraneConnectorLease): Promise<void>;
  getLease(jobId: string): Promise<CraneConnectorLease | null>;
  deleteLease(jobId: string): Promise<boolean>;
}
```

Change `CraneRuntimeDependencies.vault: CraneConnectorCredentialVault` → `vault: CraneCredentialStore` in `electron/main/crane-connector/runtime.ts` (~line 66). `AtelierConnectorCredential` is a superset (`scopes` extra property) so assignment is sound; **no Crane behavior change**. Keep the legacy `CraneConnectorCredentialVault` class and its test untouched (it documents the legacy on-disk format the migration reads).
- [ ] **Step 4: Run tests to verify pass** — `bun test tests/hirondelle-atelier-vault.test.ts tests/crane-connector-credential-vault.test.ts tests/crane-connector-runtime.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit** — `git add src/lib/atelier-connector electron/main/atelier-connector electron/main/crane-connector tests/hirondelle-atelier-vault.test.ts && git commit -m "feat(atelier-connector): scoped credential vault with one-time crane vault migration" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 3: Atelier HTTP client (pairing with `requestedScopes` + 4 Hirondelle endpoints)

**Files:**
- Create: `electron/main/atelier-connector/http-client.ts`
- Test: `tests/hirondelle-http-client.test.ts`

**Interfaces:**
- Consumes: contract schemas from Task 1; `CraneConnectorMetadataSchema`; fixtures from Task 1.
- Produces: `AtelierConnectorHttpError` (code/status/retryAfterMs — clone of `CraneConnectorHttpError`), `normalizeAtelierBaseUrl` (re-export/wrap `normalizeCraneConnectorBaseUrl`), and:

```ts
export class AtelierConnectorHttpClient {
  constructor(args: { baseUrl: string; fetch?: typeof fetch; allowInsecureLocalhost?: boolean; requestTimeoutMs?: number });
  exchangePairingCode(args: { code: string; name: string; appVersion: string; requestedScopes: AtelierConnectorScope[]; signal?: AbortSignal }):
    Promise<{ connector: CraneConnectorMetadata; secret: string; pollRetryMs: number; scopes: AtelierConnectorScope[] }>;
  listHirondelleProjects(args: { secret: string; query?: string; limit?: number; signal?: AbortSignal }): Promise<HirondelleProjectSummary[]>;
  getHirondelleContextBundle(args: { secret: string; projectRef: string; signal?: AbortSignal }): Promise<HirondelleContextBundleV1>;
  postHirondelleEvents(args: { secret: string; projectRef: string; events: StaveSyncEventV1[]; signal?: AbortSignal }):
    Promise<Array<{ staveEventId: string; status: "inserted" | "duplicate" }>>;
  mergeHirondelleLinks(args: { secret: string; projectRef: string; links: StaveSyncLinkV1[]; signal?: AbortSignal }):
    Promise<{ ok: true; inserted: number; updated: number; skipped: number }>; // aggregated client-side from the server's per-item results
}
```

- [ ] **Step 1: Write the failing test** — model `tests/crane-connector-http-client.test.ts` style with an injected `fetch` stub returning `new Response(JSON.stringify(...), { status, headers })`:
  - `exchangePairingCode` sends `requestedScopes` in the JSON body and parses granted scopes from **`connector.scopes`** in the response (`{ connector: { …, scopes: ["crane","hirondelle"] }, secret: "stc_x", pollRetryMs: 15000 }` — the Atelier route returns the connector row, which carries `scopes`); when `connector.scopes` is absent (pre-scopes server) it defaults to `["crane"]`;
  - `listHirondelleProjects` hits `/api/hirondelle/stave/projects?query=alpha&limit=10` with `Authorization: Bearer stc_x`, parses the `valid-project-list.json` fixture (`{ contract, projects: [13-field rows] }`) and maps rows through `toHirondelleProjectSummary`; unknown extra key in a project → throws `invalid_response`;
  - `getHirondelleContextBundle` parses `valid-context-bundle.json`; a response with `content-length` header of `600_000` throws `AtelierConnectorHttpError` code `response_too_large`; a `~100KB` markdown body under the 512KB bound succeeds (proves the per-endpoint bound);
  - `postHirondelleEvents` posts `{ contract: "stave-sync-v1", events }` matching `StaveSyncEventsRequestV1Schema` and returns the parsed per-item `results` (`status`); >20 events throws before any fetch;
  - `mergeHirondelleLinks` posts `{ contract: "stave-sync-v1", links }` and aggregates the server's `results[].action` into `{ ok: true, inserted, updated, skipped }` counts;
  - non-2xx with `{ "error": "forbidden" }` → error code `forbidden` with status; fetch rejection → `network_unavailable`;
  - constructor rejects `http://` non-localhost base URLs.
- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-http-client.test.ts`; expect module-not-found for `../electron/main/atelier-connector/http-client`.
- [ ] **Step 3: Write minimal implementation** — copy the crane `request<T>()` core (`electron/main/crane-connector/http-client.ts:212`) verbatim semantics: `AbortSignal.timeout(30_000)` merged with caller signal, `redirect: "error"`, `cache: "no-store"`, `readBoundedJson` parameterized as `maxResponseBytes` per call — `24_000` default, `CONTEXT_BUNDLE_MAX_RESPONSE_BYTES = 524_288` (512KB) for `getHirondelleContextBundle`, `64_000` for list/events/links responses. `ErrorResponseSchema` identical to crane's. Exchange path stays `/api/crane/stave/connectors/exchange` (spec §4.1 keeps the path); body adds `requestedScopes`. Response schema: crane `ExchangeResponseSchema` with its `connector` metadata object extended by `scopes: z.array(AtelierConnectorScopeSchema).min(1).max(2).optional()` → client defaults to `["crane"]` when absent. Hirondelle paths: `` `/api/hirondelle/stave/projects` ``, `` `/api/hirondelle/stave/projects/${encodeURIComponent(projectRef)}/context-bundle` ``, `.../events`, `.../links/merge`. Validate outbound payloads with `StaveSyncEventsRequestV1Schema.parse` / `StaveSyncLinksMergeRequestV1Schema.parse` before sending.
- [ ] **Step 4: Run test to verify it passes** — `bun test tests/hirondelle-http-client.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit** — `git add electron/main/atelier-connector/http-client.ts tests/hirondelle-http-client.test.ts && git commit -m "feat(atelier-connector): http client for pairing scopes and hirondelle sync endpoints" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 4: Durable outbox SQLite store `hirondelle_sync_outbox`

**Files:**
- Create: `electron/persistence/hirondelle-sync-outbox-store.ts`
- Modify: `electron/persistence/sqlite-store.ts` (~line 189/229: private field + construction; ~line 2845: delegate methods next to the crane binding delegates)
- Test: `tests/hirondelle-sync-outbox-store.test.ts`

**Interfaces:**
- Consumes: raw sqlite database handle (same duck-typed `exec`/`prepare` interfaces as `crane-job-binding-store.ts:11-20`).
- Produces:

```ts
export type HirondelleOutboxKind = "event" | "links_merge";
export type HirondelleOutboxStatus = "pending" | "delivered" | "failed" | "held";
export interface HirondelleOutboxEntry {
  id: string; workspaceId: string; projectRef: string;
  kind: HirondelleOutboxKind; payloadJson: string;
  attempts: number; nextAttemptAt: string; createdAt: string;
  deliveredAt: string | null; status: HirondelleOutboxStatus;
}
export class HirondelleSyncOutboxStore {
  constructor(database: unknown);                       // bootstrap() creates table + indexes
  enqueue(input: { workspaceId: string; projectRef: string; kind: "event"; payloadJson: string; now: string }): HirondelleOutboxEntry;
  upsertLinksMerge(input: { workspaceId: string; projectRef: string; payloadJson: string; nextAttemptAt: string; now: string }): HirondelleOutboxEntry;
  listDue(args: { now: string; limit: number }): HirondelleOutboxEntry[];   // status='pending' AND next_attempt_at <= now, ordered created_at ASC
  markDelivered(id: string, deliveredAt: string): void;
  markRetry(id: string, attempts: number, nextAttemptAt: string): void;
  markFailed(id: string): void;
  setWorkspaceHeld(workspaceId: string, held: boolean): number;             // pending<->held flips
  retryFailed(): number;                                                    // failed -> pending, attempts=0, next_attempt_at=now
  counts(): { pending: number; failed: number };
  pruneDeliveredBefore(cutoff: string): number;
}
```

- [ ] **Step 1: Write the failing test** — model `tests/crane-job-binding-store.test.ts` (`import { Database } from "bun:sqlite"`, `new HirondelleSyncOutboxStore(new Database(":memory:"))`):
  - enqueue → `listDue` returns it; `next_attempt_at` in the future → not due;
  - `upsertLinksMerge` twice for the same workspace keeps exactly one non-terminal `links_merge` row, with the second call's payload and `nextAttemptAt` (coalescing/debounce semantics);
  - `markRetry` bumps attempts and hides until due; `markFailed` removes from `listDue` and shows in `counts().failed`; `retryFailed` requeues;
  - `setWorkspaceHeld(w, true)` hides that workspace's pending rows; `false` restores them;
  - restart recovery: construct a **second** store over the same `Database` handle — pending rows are still returned by `listDue` (durability across process restarts);
  - `pruneDeliveredBefore` deletes only delivered rows older than cutoff.
- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-sync-outbox-store.test.ts`; expect module-not-found.
- [ ] **Step 3: Write minimal implementation** — bootstrap SQL:

```sql
CREATE TABLE IF NOT EXISTS hirondelle_sync_outbox (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hirondelle_outbox_due
  ON hirondelle_sync_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_hirondelle_outbox_workspace
  ON hirondelle_sync_outbox (workspace_id, status);
```

Row ids via `randomUUID()`. `upsertLinksMerge`: `UPDATE ... WHERE workspace_id = ? AND kind = 'links_merge' AND status IN ('pending','held')`; if `changes === 0`, INSERT. Parse rows through a `HirondelleOutboxEntrySchema` Zod strict object (crane store pattern `parseBindingRow`). In `sqlite-store.ts` add `private hirondelleSyncOutbox: HirondelleSyncOutboxStore;` + `this.hirondelleSyncOutbox = new HirondelleSyncOutboxStore(this.db);` (constructor, next to line 229) and delegates `enqueueHirondelleOutboxEntry`, `upsertHirondelleLinksMergeEntry`, `listDueHirondelleOutboxEntries`, `markHirondelleOutboxDelivered`, `markHirondelleOutboxRetry`, `markHirondelleOutboxFailed`, `setHirondelleOutboxWorkspaceHeld`, `retryFailedHirondelleOutboxEntries`, `countHirondelleOutbox`, `pruneHirondelleOutboxDeliveredBefore` (next to the crane delegates at ~line 2845).
- [ ] **Step 4: Run test to verify it passes** — `bun test tests/hirondelle-sync-outbox-store.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit** — `git add electron/persistence tests/hirondelle-sync-outbox-store.test.ts && git commit -m "feat(hirondelle-sync): durable sqlite outbox store" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 5: Sync runtime + main-process service + quit cleanup

**Files:**
- Create: `electron/main/hirondelle-sync/runtime.ts`
- Create: `electron/main/hirondelle-sync/service.ts`
- Modify: `electron/main.ts` (~line 39-43: add `stopHirondelleSyncRuntime()` to `runBeforeQuitCleanup`)
- Test: `tests/hirondelle-sync-runtime.test.ts`

**Interfaces:**
- Consumes: `computeCraneConnectorRetryDelay` (import from `electron/main/crane-connector/runtime.ts:143`), `AtelierConnectorHttpClient`/`AtelierConnectorHttpError` (Task 3), outbox delegate interface (Task 4), `getAtelierConnectorCredentialVault` (Task 2), `ensurePersistenceReadySync` from `electron/main/state.ts`, `getMainWindow` from `electron/main/window.ts`.
- Produces:

```ts
export interface HirondelleSyncPublicStatus {
  runtimeState: "disabled" | "unpaired" | "idle" | "syncing" | "offline" | "unauthorized" | "error";
  lastErrorCode: string | null;
  pendingCount: number;
  failedCount: number;
  lastDeliveredAt: string | null;
}
export class HirondelleSyncRuntime {
  constructor(dependencies: HirondelleSyncRuntimeDependencies);
  configure(settings: HirondelleSyncSettings): HirondelleSyncPublicStatus;
  getStatus(): HirondelleSyncPublicStatus;
  getSettings(): HirondelleSyncSettings;
  enqueueEvent(args: { workspaceId: string; projectRef: string; event: StaveSyncEventV1 }): void;
  noteLinksChanged(args: { workspaceId: string; projectRef: string; links: StaveSyncLinkV1[] }): void;
  retryFailed(): void;
  holdWorkspace(workspaceId: string): void;
  shutdown(): void;
}
// service.ts
export function getHirondelleSyncRuntime(): HirondelleSyncRuntime;
export function configureHirondelleSync(settings: HirondelleSyncSettings): HirondelleSyncPublicStatus;
export function getHirondelleSyncStatus(): HirondelleSyncPublicStatus;
export function enqueueHirondelleSyncEvent(args: EnqueueEventArgs): void;
export function noteHirondelleWorkspaceLinksChanged(args: LinksChangedArgs): void;
export function retryFailedHirondelleSync(): HirondelleSyncPublicStatus;
export function stopHirondelleSyncRuntime(): void;
export function resetHirondelleSyncRuntimeForTests(): void;
```

Dependencies (all injectable for tests, crane pattern):

```ts
interface HirondelleSyncRuntimeDependencies {
  persistence: HirondelleSyncOutboxPersistence;          // sqlite delegate subset
  getCredential: () => Promise<{ baseUrl: string; secret: string; scopes: AtelierConnectorScope[] } | null>;
  createHttpClient: (baseUrl: string) => AtelierConnectorHttpClient;
  emitStatus: (status: HirondelleSyncPublicStatus) => void;
  emitMappingStale: (args: { workspaceId: string; projectRef: string; code: "project_not_found" | "project_archived" }) => void;
  now?: () => Date; random?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}
```

- [ ] **Step 1: Write the failing test** — model `tests/crane-connector-runtime.test.ts` harness: injected timers array, fixed `now`, fake persistence backed by an in-memory `Map`, fake client with programmable failures:
  - `enqueueEvent` while disabled → row written (synchronous durability) but no timer scheduled; after `configure({ ...DEFAULTS, enabled: true })` a drain runs and posts one batch, `markDelivered` called, status `idle`, `lastDeliveredAt` set;
  - `duplicate` status also marks delivered;
  - network error (`network_unavailable`) → `markRetry` with delay `computeCraneConnectorRetryDelay({ baseDelayMs: 5_000, failureCount: 1, random: () => 0.5 })`, status `offline`, timer scheduled; generation guard: `shutdown()` then firing the captured timer does nothing;
  - after `MAX_HIRONDELLE_SYNC_ATTEMPTS` (8) failures → `markFailed`, status counts `failedCount: 1`; `retryFailed()` requeues and drains again;
  - 401 (`AtelierConnectorHttpError("unauthorized", 401)`) → status `unauthorized`, **no** retry timer scheduled;
  - 404 → `setWorkspaceHeld(workspaceId, true)` and `emitMappingStale` fired with `project_not_found`; 409 → `project_archived`;
  - coalescing: two `noteLinksChanged` calls 5 "seconds" apart (advance fake now) produce a single `links_merge` row with the **second** payload, and it is not due until 30s after the second call (`HIRONDELLE_LINKS_MERGE_DEBOUNCE_MS = 30_000`); after the debounce, one `mergeHirondelleLinks` call with the latest links;
  - events for the same projectRef are batched ≤ 20 per `postHirondelleEvents` call.
- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-sync-runtime.test.ts`; expect module-not-found.
- [ ] **Step 3: Write minimal implementation** — runtime clones the crane concurrency skeleton (`electron/main/crane-connector/runtime.ts`): `private operationQueue: Promise<void>`, `private generation = 0`, `private timer`, `enqueue()` / `schedule(delayMs)` / `stopPendingWork()` copied semantics (lines 1180-1214). Drain algorithm inside `enqueue(() => this.drain())`:
  1. If `!settings.enabled` → status `disabled`, return. `getCredential()` null or missing `"hirondelle"` scope → status `unpaired`, return (no timer).
  2. `listDue({ now, limit: 50 })`; empty → status `idle`, schedule next poll only if any pending-in-future rows exist (`counts().pending > 0` → schedule at 5s granularity is fine: `schedule(5_000)`).
  3. Group `kind === "event"` rows by `projectRef` into ≤20 chunks → `postHirondelleEvents`; each result → `markDelivered`. Each `kind === "links_merge"` row → parse payload `{ links }` → `mergeHirondelleLinks` → `markDelivered`. Exhaustive switch on `kind` with `never` default.
  4. Error handling per entry group: 401/403 → `runtimeState: "unauthorized"`, `lastErrorCode`, stop (no reschedule; user must re-pair). 404/409 → `setWorkspaceHeld` + `emitMappingStale`, continue with other workspaces. Other errors → `markRetry(id, attempts + 1, nowMs + computeCraneConnectorRetryDelay({ baseDelayMs: 5_000, failureCount: attempts + 1, random }))`; if `attempts + 1 >= 8` → `markFailed`. Status `offline` for `network_unavailable`, else `error`; `schedule(minRetryDelay)`.
  5. Emit status after every drain (includes fresh `counts()`).
  - `enqueueEvent`: `StaveSyncEventV1Schema.parse(event)` → `persistence.enqueueHirondelleOutboxEntry({ ..., payloadJson: JSON.stringify(event), now })` → `schedule(0)` when enabled.
  - `noteLinksChanged`: `upsertHirondelleLinksMergeEntry({ ..., payloadJson: JSON.stringify({ links }), nextAttemptAt: iso(now + 30_000) })` → `schedule(30_000)`; the row's `next_attempt_at` implements the trailing debounce so it survives restarts.
  - `service.ts` mirrors `electron/main/crane-connector/service.ts`: lazy singleton, `sendToRenderer("hirondelle-sync:status", status)` and `sendToRenderer("hirondelle-sync:mapping-stale", payload)` via `getMainWindow()`. `electron/main.ts`: add `import { stopHirondelleSyncRuntime } from "./main/hirondelle-sync/service";` and `Promise.resolve(stopHirondelleSyncRuntime()),` inside the `Promise.allSettled` at line 39.
- [ ] **Step 4: Run test to verify it passes** — `bun test tests/hirondelle-sync-runtime.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit** — `git add electron/main/hirondelle-sync electron/main.ts tests/hirondelle-sync-runtime.test.ts && git commit -m "feat(hirondelle-sync): outbox runtime with backoff, dead-letter, and link coalescing" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 6: `WorkspaceInformationState.hirondelleProject` + host-service set action (4-step recipe, part 1)

**Files:**
- Modify: `src/lib/workspace-information.ts` (interface at line 245, `createEmptyWorkspaceInformation` at line 1504)
- Modify: `electron/host-service/protocol.ts` (`HostLocalMcpAction` union ending line 443)
- Modify: `electron/host-service/local-mcp-runtime.ts` (new exported function next to `updateWorkspaceInformationState` at line 731)
- Modify: `electron/host-service.ts` (`invokeLocalMcpAction` switch at line 507)
- Modify: `electron/main/stave-mcp-service.ts` (wrapper next to `getWorkspaceInformation` at line 74)
- Modify: `src/lib/workspace-kickoff.ts` (`buildWorkspaceInformationSeed` at line 568 + `KickoffProposalDraft` optional field)
- Test: `tests/hirondelle-workspace-information.test.ts`

**Interfaces:**
- Produces in `src/lib/workspace-information.ts`:

```ts
export interface WorkspaceHirondelleProjectLink {
  ref: string;
  slug: string;
  name: string;
  url: string;
  linkedAt: string;
  lastPulledAt: string | null;
  /** Set when the server reported the project deleted/archived (404/409). */
  stale?: boolean;
}
// added to WorkspaceInformationState:
hirondelleProject?: WorkspaceHirondelleProjectLink | null;
```

- Host-service: `setWorkspaceHirondelleProject(args: { workspaceId: string; project: WorkspaceHirondelleProjectLink | null }): Promise<WorkspaceInformationMutationResult>` — implemented with `updateWorkspaceInformationState` so it persists and emits `local-mcp.workspace-information-updated`.
- Protocol: `| "set-workspace-hirondelle-project"` appended to `HostLocalMcpAction`.
- `stave-mcp-service.ts`: same-named async wrapper via `invokeLocalMcp`.
- Kickoff: `KickoffProposalDraft` gains `hirondelleProject?: WorkspaceHirondelleProjectLink | null`; `buildWorkspaceInformationSeed` copies it into the seed when present.

- [ ] **Step 1: Write the failing test** — `tests/hirondelle-workspace-information.test.ts`:
  - `createEmptyWorkspaceInformation().hirondelleProject` is `null`;
  - `buildWorkspaceInformationSeed({ ...draft, hirondelleProject: link })` carries the link into the returned state; without it, seed keeps `null` (build a minimal `KickoffProposalDraft` with empty `panelEntries`/`todos`/`notes` — mirror the draft shape returned by the deterministic fallback at `workspace-kickoff.ts:553-565`).
- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-workspace-information.test.ts`; expect a type/compile error (`hirondelleProject` does not exist) or `undefined !== null` assertion failure.
- [ ] **Step 3: Write minimal implementation** — add the interface + field; set `hirondelleProject: null` in `createEmptyWorkspaceInformation`. Host-service function:

```ts
export async function setWorkspaceHirondelleProject(args: {
  workspaceId: string;
  project: WorkspaceHirondelleProjectLink | null;
}) {
  return updateWorkspaceInformationState({
    workspaceId: args.workspaceId,
    updater: (current) => ({ ...current, hirondelleProject: args.project }),
  });
}
```

Add the dispatch case in `electron/host-service.ts` (`case "set-workspace-hirondelle-project": ... localMcpRuntime.setWorkspaceHirondelleProject(args as never)` — match the casting convention of adjacent cases). Add the `stave-mcp-service.ts` wrapper following the `replaceWorkspaceNotes` template (lines 81-89). Renderer display works automatically through the existing `local-mcp:workspace-information-updated` → `applyExternalWorkspaceInformationUpdate` path.
- [ ] **Step 4: Run test to verify it passes** — `bun test tests/hirondelle-workspace-information.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit** — `git add src/lib/workspace-information.ts src/lib/workspace-kickoff.ts electron/host-service tests/hirondelle-workspace-information.test.ts electron/host-service.ts electron/main/stave-mcp-service.ts && git commit -m "feat(hirondelle-sync): first-class hirondelleProject field on workspace information" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 7: Link/unlink/pull orchestration, context snapshot file, staleness helper, WI-update subscription

**Files:**
- Create: `electron/main/hirondelle-sync/project-link.ts`
- Create: `electron/main/hirondelle-sync/context-snapshot.ts`
- Create: `src/lib/hirondelle-sync/staleness.ts`
- Modify: `electron/main/hirondelle-sync/service.ts` (add credential accessor + `local-mcp.workspace-information-updated` subscription)
- Test: `tests/hirondelle-context-snapshot.test.ts` (staleness + snapshot path/write)

**Interfaces:**
- Consumes: `setWorkspaceHirondelleProject`, `getWorkspaceInformation`, `listKnownProjects` from `electron/main/stave-mcp-service.ts`; `AtelierConnectorHttpClient` + vault; `buildHirondelleSyncLinks`; `onHostServiceEvent` from `electron/main/host-service-client.ts:487`; runtime service (Task 5).
- Produces:

```ts
// src/lib/hirondelle-sync/staleness.ts
export const HIRONDELLE_CONTEXT_MAX_AGE_MS = 60 * 60 * 1_000;
export function isHirondelleContextStale(args: { lastPulledAt: string | null; now?: Date; maxAgeMs?: number }): boolean;

// electron/main/hirondelle-sync/context-snapshot.ts
export function buildHirondelleContextSnapshotRelativePath(slug: string): string; // ".stave/context/hirondelle/<slug>.md"
export async function writeHirondelleContextSnapshot(args: { workspacePath: string; slug: string; markdown: string }): Promise<{ absolutePath: string; relativePath: string }>;

// electron/main/hirondelle-sync/project-link.ts
export async function listHirondelleProjects(args: { query?: string; limit?: number }): Promise<HirondelleProjectSummary[]>;
export async function linkHirondelleProject(args: { workspaceId: string; projectRef: string }): Promise<{ project: WorkspaceHirondelleProjectLink; snapshotRelativePath: string }>;
export async function unlinkHirondelleProject(args: { workspaceId: string }): Promise<{ ok: true }>;
export async function refreshHirondelleContext(args: { workspaceId: string }): Promise<{ project: WorkspaceHirondelleProjectLink; snapshotRelativePath: string; markdown: string }>;
```

- [ ] **Step 1: Write the failing test** — `tests/hirondelle-context-snapshot.test.ts`:
  - `isHirondelleContextStale({ lastPulledAt: null })` → `true`; 59 minutes old → `false`; 61 minutes old → `true` (fixed `now`);
  - slug sanitization: `buildHirondelleContextSnapshotRelativePath("checkout-v2")` → `".stave/context/hirondelle/checkout-v2.md"`; a slug containing `../` or path separators throws (defense: the contract slug regex should already forbid it — assert both);
  - `writeHirondelleContextSnapshot` to a tmpdir creates nested dirs and round-trips content; a second write replaces content.
- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-context-snapshot.test.ts`; expect module-not-found.
- [ ] **Step 3: Write minimal implementation** — snapshot writer uses `fs.mkdir(dir, { recursive: true })` + atomic temp-rename (crane vault `writeDocument` pattern, no `0o600` needed — it's workspace content). `project-link.ts` orchestration (all functions resolve the client via a shared helper):

```ts
async function requireHirondelleClient() {
  const credential = await getAtelierConnectorCredentialVault().getCredential();
  if (!credential) throw new Error("connector_unpaired");
  if (!credential.scopes.includes("hirondelle")) throw new Error("scope_missing");
  return {
    secret: credential.secret,
    client: new AtelierConnectorHttpClient({
      baseUrl: credential.baseUrl,
      allowInsecureLocalhost: process.env.STAVE_DEV === "1" && !app.isPackaged,
    }),
  };
}
```

`linkHirondelleProject`: fetch bundle → resolve workspace path/name/branch via `listKnownProjects()` (flatten `RegisteredProjectInfo.workspaces`, `RegisteredWorkspaceInfo.path/name/branch` — `local-mcp-runtime.ts:116-123`) → `writeHirondelleContextSnapshot` → `setWorkspaceHirondelleProject` with `{ ref, slug, name, url, linkedAt: nowIso, lastPulledAt: nowIso }` → if master switch on, `enqueueHirondelleSyncEvent` `workspace_linked` (summary `` `${workspaceName} (${branch})` ``, `sourceUrl: project.url`) and `noteHirondelleWorkspaceLinksChanged` with `buildHirondelleSyncLinks(result.workspaceInformation)`. `unlinkHirondelleProject`: read current WI for the projectRef, set field to `null`, enqueue `workspace_unlinked`. `refreshHirondelleContext`: fetch bundle, rewrite snapshot, update `lastPulledAt` (clear `stale`). Service subscription (register once in `getHirondelleSyncRuntime()` bootstrap):

```ts
onHostServiceEvent("local-mcp.workspace-information-updated", (payload) => {
  const project = payload.workspaceInformation.hirondelleProject;
  const settings = getHirondelleSyncRuntime().getSettings();
  if (!project || project.stale || !settings.enabled || !settings.resourceLinks) return;
  const links = buildHirondelleSyncLinks(payload.workspaceInformation);
  const fingerprint = JSON.stringify(links);
  if (linksFingerprintByWorkspace.get(payload.workspaceId) === fingerprint) return;
  linksFingerprintByWorkspace.set(payload.workspaceId, fingerprint);
  getHirondelleSyncRuntime().noteLinksChanged({
    workspaceId: payload.workspaceId, projectRef: project.ref, links,
  });
});
```

Wire `emitMappingStale` (Task 5) to call `setWorkspaceHirondelleProject` with `{ ...current, stale: true }` (read-modify via `getWorkspaceInformation`).
- [ ] **Step 4: Run test to verify it passes** — `bun test tests/hirondelle-context-snapshot.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit** — `git add electron/main/hirondelle-sync src/lib/hirondelle-sync/staleness.ts tests/hirondelle-context-snapshot.test.ts && git commit -m "feat(hirondelle-sync): project link lifecycle, context snapshot pull, staleness helper" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 8: IPC handlers, preload bridge, window API contract

**Files:**
- Create: `electron/main/ipc/atelier-connector.ts`, `electron/main/ipc/hirondelle-sync.ts`
- Modify: `electron/main/ipc/schemas.ts` (top re-export block, lines 21-26 pattern), `electron/main/ipc/index.ts` (import + call in `registerHandlers`)
- Modify: `electron/preload.ts` (subscriber sets near line 220; bridge objects after `craneConnector` at line 1532)
- Modify: `src/types/window-api.d.ts` (new interfaces near `WindowCraneConnectorApi` line 702; optional members near line 2468)

**Interfaces:**
- IPC channels (all `ipcMain.handle`, args validated with `safeParse`, safe error messages — clone `registerCraneConnectorHandlers` shape from `electron/main/ipc/crane-connector.ts`):
  - `atelier-connector:get-status` → `{ ok, status: AtelierConnectorPublicStatus }` (paired/scopes/connector/lastSeen from vault metadata; never the secret)
  - `atelier-connector:pair` (`AtelierConnectorPairArgsSchema` with `requestedScopes`) → exchanges via `AtelierConnectorHttpClient`, saves credential+scopes to the atelier vault
  - `hirondelle-sync:get-status`, `hirondelle-sync:configure` (`HirondelleSyncConfigureArgsSchema`), `hirondelle-sync:enqueue` (`HirondelleSyncEnqueueArgsSchema` — builds the wire event in main: `staveEventId: randomUUID()`, `tier` derived from kind exhaustively: `work_update → "interpretive"`, others `"factual"`; the top-level `{ contract, events }` wrapper is added by the HTTP client), `hirondelle-sync:links-changed` (`HirondelleSyncLinksChangedArgsSchema`), `hirondelle-sync:retry-failed`, `hirondelle-sync:list-projects`, `hirondelle-sync:link-project`, `hirondelle-sync:unlink-project`, `hirondelle-sync:refresh-context`
  - push events: `hirondelle-sync:status`, `hirondelle-sync:mapping-stale` (emitted by Task 5 service)
- Preload `window.api.atelierConnector = { getStatus, pair }` and `window.api.hirondelleSync = { getStatus, configure, enqueue, notifyLinksChanged, retryFailed, listProjects, linkProject, unlinkProject, refreshContext, subscribeStatus, subscribeMappingStale }` — invoke/subscribe shapes copied from the `craneConnector` bridge (preload lines 1466-1532).
- `src/types/window-api.d.ts`: `WindowAtelierConnectorApi`, `WindowHirondelleSyncApi` with all members optional-function style matching `WindowCraneConnectorApi` (lines 702-744), registered as `atelierConnector?:` / `hirondelleSync?:`.

- [ ] **Step 1: Write the failing test** — this is contract glue; the test asserts the arg schemas exported through `electron/main/ipc/schemas.ts` (same role as `crane-stave-contract.test.ts` lines importing from `../electron/main/ipc/schemas`). Add to `tests/hirondelle-sync-contract.test.ts`:

```ts
import {
  AtelierConnectorPairArgsSchema,
  HirondelleSyncEnqueueArgsSchema,
} from "../electron/main/ipc/schemas";

test("ipc arg schemas validate pairing and enqueue payloads", () => {
  expect(
    AtelierConnectorPairArgsSchema.safeParse({
      baseUrl: "https://atelier.delight-tools.ai",
      code: "stp_abc",
      name: "My Stave",
      requestedScopes: ["crane", "hirondelle"],
    }).success,
  ).toBe(true);
  expect(
    HirondelleSyncEnqueueArgsSchema.safeParse({
      workspaceId: "worktree:abc",
      projectRef: "checkout-v2",
      kind: "pr_opened",
      summary: "PR #12: Add sync",
      sourceUrl: "https://github.com/acme/repo/pull/12",
      workspaceName: "feat/sync",
      branch: "feat/sync",
    }).success,
  ).toBe(true);
  expect(
    HirondelleSyncEnqueueArgsSchema.safeParse({ kind: "nope" }).success,
  ).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-sync-contract.test.ts`; expect export-not-found from `../electron/main/ipc/schemas`.
- [ ] **Step 3: Write minimal implementation** — re-export block in `schemas.ts`; two handler files with `safeConnectorErrorMessage`-style sanitizers (map `unauthorized|forbidden` → "Atelier rejected this connector. Pair it again.", `network_unavailable` → "Atelier is currently unreachable.", never echo raw errors); register `registerAtelierConnectorHandlers(); registerHirondelleSyncHandlers();` in `electron/main/ipc/index.ts`; preload bridge + window-api types exactly mirroring the crane pattern (including the subscriber `Set` + `ipcRenderer.on("hirondelle-sync:status", ...)` fanout at the top of preload near line 234). Per `docs/architecture/contracts.md` Window API checklist: verify `electron/preload.ts`, `src/types/window-api.d.ts`, `electron/main/ipc/*`, and renderer call sites stay aligned.
- [ ] **Step 4: Run test to verify it passes** — `bun test tests/hirondelle-sync-contract.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit** — `git add electron/main/ipc electron/preload.ts src/types/window-api.d.ts tests/hirondelle-sync-contract.test.ts && git commit -m "feat(hirondelle-sync): ipc handlers, preload bridge, and window api contract" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 9: MCP tools (4-step recipe, part 2)

**Files:**
- Modify: `electron/main/stave-mcp-server.ts` (register 4 tools next to the workspace tools, after `stave_list_projects` block at line 278)

**Interfaces:**
- Consumes: `listHirondelleProjects`, `linkHirondelleProject`, `unlinkHirondelleProject`, `refreshHirondelleContext` from `electron/main/hirondelle-sync/project-link.ts`; `toStructuredResult` (line 88).
- Produces MCP tools: `stave_hirondelle_list_projects`, `stave_hirondelle_link_project`, `stave_hirondelle_unlink_project`, `stave_hirondelle_get_context`.

- [ ] **Step 1: Write the failing test** — no MCP server harness exists in `tests/`; gate this task with typecheck + a grep-visible registration instead (UI-task exemption). Verification step below substitutes.
- [ ] **Step 2: Verify absence** — `grep -c "stave_hirondelle" electron/main/stave-mcp-server.ts` returns 0.
- [ ] **Step 3: Write minimal implementation** (pattern: `stave_register_project` at line 290):

```ts
server.registerTool(
  "stave_hirondelle_list_projects",
  {
    description:
      "Search Hirondelle projects reachable through the paired Atelier connector.",
    inputSchema: {
      query: z.string().max(200).optional()
        .describe("Optional name/slug filter."),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  async ({ query, limit }) =>
    toStructuredResult({
      projects: await listHirondelleProjects({ query, limit }),
    }),
);

server.registerTool(
  "stave_hirondelle_link_project",
  {
    description:
      "Link a Stave workspace to a Hirondelle project and pull its context snapshot.",
    inputSchema: {
      workspaceId: z.string().min(1).describe("Target workspace id."),
      projectRef: z.string().min(1)
        .describe("Hirondelle project slug or id."),
    },
  },
  async ({ workspaceId, projectRef }) =>
    toStructuredResult(await linkHirondelleProject({ workspaceId, projectRef })),
);

server.registerTool(
  "stave_hirondelle_unlink_project",
  {
    description: "Unlink a Stave workspace from its Hirondelle project.",
    inputSchema: {
      workspaceId: z.string().min(1).describe("Target workspace id."),
    },
  },
  async ({ workspaceId }) =>
    toStructuredResult(await unlinkHirondelleProject({ workspaceId })),
);

server.registerTool(
  "stave_hirondelle_get_context",
  {
    description:
      "Fetch the latest Hirondelle project context bundle for a linked workspace and refresh the local snapshot file.",
    inputSchema: {
      workspaceId: z.string().min(1).describe("Target workspace id."),
    },
  },
  async ({ workspaceId }) =>
    toStructuredResult(await refreshHirondelleContext({ workspaceId })),
);
```

Import the four functions at the top of `stave-mcp-server.ts` from `"./hirondelle-sync/project-link"`.
- [ ] **Step 4: Verify** — `bun run typecheck` passes and `grep -c "stave_hirondelle" electron/main/stave-mcp-server.ts` returns ≥ 4.
- [ ] **Step 5: Commit** — `git add electron/main/stave-mcp-server.ts && git commit -m "feat(hirondelle-sync): register hirondelle project mcp tools" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 10: AppSettings.hirondelleSync + rehydrate normalization + SettingDefinition + configure push

**Files:**
- Modify: `src/store/app-settings.ts` (interface after `craneConnector` line 283; default after lines 505-508)
- Modify: `src/store/app-store-persistence.ts` (after `normalizeCraneConnectorSettings` block, lines 143-145)
- Modify: `src/components/layout/settings-dialog.registry.ts` (append after craneConnector definition, line 159)
- Modify: `src/App.tsx` (extend the crane connector effect at lines 119-204 with a parallel hirondelle push)
- Test: extend `tests/hirondelle-sync-settings.test.ts`

**Interfaces:**
- `AppSettings` gains `/** Hirondelle workspace sync toggles. Secrets stay in the Electron main vault. */ hirondelleSync: HirondelleSyncSettings;`; `defaultSettings` gains `hirondelleSync: { ...DEFAULT_HIRONDELLE_SYNC_SETTINGS },`.
- Rehydrate: `state.settings.hirondelleSync = normalizeHirondelleSyncSettings(raw.hirondelleSync);`.
- Registry entry:

```ts
{
  key: "hirondelleSync",
  sectionId: "integrations",
  fieldId: "settings-field-hirondelle-sync",
  title: "Hirondelle sync",
  description:
    "Push workspace events and resource links to a linked Hirondelle project and pull its context snapshot.",
  keywords: ["hirondelle", "atelier", "sync", "project", "events", "links", "outbox", "connector"],
  schema: HirondelleSyncSettingsSchema,
  defaultValue: { ...DEFAULT_HIRONDELLE_SYNC_SETTINGS },
  scope: "app",
  sensitivity: "sensitive",
  applyMode: "immediate",
  importExport: "exclude",
} satisfies SettingDefinition<"hirondelleSync">,
```

- `App.tsx`: inside the existing connector effect, `pushHirondelleConfig(settings)` calling `window.api?.hirondelleSync?.configure?.(normalizeHirondelleSyncSettings(settings.hirondelleSync))` on mount and whenever any of the five booleans change in the store subscription (compare normalized prev/next like lines 174-204).

- [ ] **Step 1: Write the failing test** — add to `tests/hirondelle-sync-settings.test.ts`:

```ts
import { defaultSettings } from "../src/store/app-settings";
import { settingDefinitions } from "../src/components/layout/settings-dialog.registry";

test("app settings carry hirondelle sync defaults", () => {
  expect(defaultSettings.hirondelleSync).toEqual(DEFAULT_HIRONDELLE_SYNC_SETTINGS);
});

test("hirondelle sync setting definition is sensitive and excluded from export", () => {
  const definition = settingDefinitions.find((d) => d.key === "hirondelleSync");
  expect(definition?.sectionId).toBe("integrations");
  expect(definition?.sensitivity).toBe("sensitive");
  expect(definition?.importExport).toBe("exclude");
});
```

(Confirm the exported name of the defaults object in `app-settings.ts` — it is the object literal at line ~370-555; use its actual export identifier when writing the test.)
- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-sync-settings.test.ts`; expect `hirondelleSync` undefined / definition not found.
- [ ] **Step 3: Write minimal implementation** — the four file edits above.
- [ ] **Step 4: Run test to verify it passes** — `bun test tests/hirondelle-sync-settings.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit** — `git add src/store/app-settings.ts src/store/app-store-persistence.ts src/components/layout/settings-dialog.registry.ts src/App.tsx tests/hirondelle-sync-settings.test.ts && git commit -m "feat(hirondelle-sync): app settings, rehydrate normalization, and setting definition" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 11: Renderer trigger wiring (pr.afterOpen, task.archiving, turn summaries, WI edits, open-staleness)

**Files:**
- Create: `src/lib/hirondelle-sync/renderer-triggers.ts`
- Modify: `src/store/app.store.ts` (inside `runScriptHookInBackground` at line ~647 and `applyWorkspaceTurnSummaryToState` after `didUpdate` check at line ~878 — **keep total additions ≤ ~20 lines, ratchet is 3148**)
- Modify: `src/components/layout/TopBarOpenPR.tsx` (after PR success, next to the existing `pr.afterOpen` hook at line 1479)
- Modify: `src/store/app-store-task-core-actions.ts` (`updateWorkspaceInformation` at line 414)
- Modify: `src/store/app-store-workspace-management-actions.ts` (end of `switchWorkspace`, line 370 block)
- Test: `tests/hirondelle-renderer-triggers.test.ts`

**Interfaces:**
- Produces (all read `window.api?.hirondelleSync` lazily; accept a minimal structural state to avoid store import cycles):

```ts
export interface HirondelleTriggerWorkspaceContext {
  workspaceId: string;
  workspaceName: string;
  branch: string;
  hirondelleProject: WorkspaceHirondelleProjectLink | null | undefined;
}
export function shouldPushHirondelleEvent(args: {
  settings: HirondelleSyncSettings;
  kind: StaveSyncEventKind;
}): boolean;   // master switch AND per-kind toggle; workspace_linked/unlinked only need master
export function notifyHirondelleTaskArchived(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  taskTitle: string;
}): void;      // kind "task_completed", summary = taskTitle
export function notifyHirondellePrOpened(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  prUrl: string;
  prTitle: string;
}): void;      // kind "pr_opened", summary = prTitle, sourceUrl = prUrl
export function notifyHirondelleTurnSummary(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  workSummary: string;
}): void;      // kind "work_update" (interpretive, off by default)
export function notifyHirondelleInformationEdited(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  previous: WorkspaceInformationState;
  next: WorkspaceInformationState;
}): void;      // computes buildHirondelleSyncLinks for both; if JSON differs → window.api.hirondelleSync.notifyLinksChanged
export function maybeRefreshHirondelleContext(args: {
  workspaceId: string;
  hirondelleProject: WorkspaceHirondelleProjectLink | null | undefined;
}): void;      // isHirondelleContextStale → window.api.hirondelleSync.refreshContext (fire-and-forget)
```

- [ ] **Step 1: Write the failing test** — `tests/hirondelle-renderer-triggers.test.ts` for the pure/decision surface (stub `window.api` on `globalThis` with a recording fake, following existing renderer tests that stub `window`):
  - `shouldPushHirondelleEvent`: master off → always false; master on → `pr_opened`/`task_completed` true by default, `work_update` false, `workspace_linked` true regardless of individual toggles;
  - `notifyHirondellePrOpened` with a linked context calls `enqueue` once with `kind: "pr_opened"`, `summary: prTitle`, `sourceUrl: prUrl`, `projectRef` from `hirondelleProject.ref`; with `hirondelleProject: null` or `stale: true` it does not call;
  - `notifyHirondelleInformationEdited` with identical links arrays makes no call; with a new PR added calls `notifyLinksChanged` with the mapped links;
  - `maybeRefreshHirondelleContext` calls `refreshContext` only when stale.
- [ ] **Step 2: Run test to verify it fails** — `bun test tests/hirondelle-renderer-triggers.test.ts`; expect module-not-found.
- [ ] **Step 3: Write minimal implementation** — helpers as above. Call-site edits:
  - `app.store.ts` `runScriptHookInBackground` (single dispatcher already covering `task.archiving`; per the ratchet, one compact block):

```ts
if (args.trigger === "task.archiving" && args.taskTitle) {
  notifyHirondelleTaskArchived({
    context: collectHirondelleTriggerContext(get(), args.workspaceId),
    settings: get().settings.hirondelleSync,
    taskTitle: args.taskTitle,
  });
}
```

  where `collectHirondelleTriggerContext(state, workspaceId)` (exported from renderer-triggers.ts, accepts a structural `{ workspaces, workspaceBranchById, activeWorkspaceId, workspaceInformation, workspaceRuntimeCacheById }`) resolves name/branch/WI for active or cached workspaces via the same lookup `applyWorkspaceTurnSummaryToState` uses.
  - `app.store.ts` `applyWorkspaceTurnSummaryToState` after the `if (!didUpdate) return;` guard (line 878): `notifyHirondelleTurnSummary({ context: collectHirondelleTriggerContext(get(), args.workspaceId), settings: get().settings.hirondelleSync, workSummary: args.summary.workSummary });`
  - `TopBarOpenPR.tsx` after the PR-created toast block (line ~1475): `notifyHirondellePrOpened({ context: ..., settings: ..., prUrl: prResult.prUrl ?? "", prTitle: dialogTitle })` guarded on `prResult.prUrl` (use the component's PR title state variable — confirm exact name in file).
  - `app-store-task-core-actions.ts` `updateWorkspaceInformation` (line 414): capture `previous = state.workspaceInformation` before `set`, then after `set` call `notifyHirondelleInformationEdited` with previous/next and the active workspace context.
  - `app-store-workspace-management-actions.ts` `switchWorkspace`: at the end of the successful switch (after workspace information is in place), `maybeRefreshHirondelleContext({ workspaceId, hirondelleProject: get().workspaceInformation.hirondelleProject });`
- [ ] **Step 4: Run test to verify it passes** — `bun test tests/hirondelle-renderer-triggers.test.ts && bun run typecheck && bun run check:max-lines-ratchet`.
- [ ] **Step 5: Commit** — `git add src/lib/hirondelle-sync/renderer-triggers.ts src/store/app.store.ts src/store/app-store-task-core-actions.ts src/store/app-store-workspace-management-actions.ts src/components/layout/TopBarOpenPR.tsx tests/hirondelle-renderer-triggers.test.ts && git commit -m "feat(hirondelle-sync): wire renderer lifecycle triggers into the sync outbox" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 12: Settings UI card + Information panel Hirondelle card

**Files:**
- Create: `src/components/layout/settings-dialog-hirondelle-sync.tsx`
- Create: `src/components/layout/WorkspaceInformationHirondelleCard.tsx`
- Modify: `src/components/layout/settings-dialog-sections.tsx` (`case "integrations"` at line 3993)
- Modify: `src/components/layout/WorkspaceInformationPanel.tsx` (render the card in the sections list, near the linked-PRs section render at ~line 2099)

**Interfaces:**
- Consumes: `window.api.atelierConnector` / `window.api.hirondelleSync` (Task 8), `useAppStore` settings + `updateSettings({ patch })` (pattern at `settings-dialog-sections.tsx:3930`), UI kit from `@/components/ui` (see imports of `settings-dialog-crane-connector.tsx:12-24`).
- Produces: `HirondelleSyncSettingsSection` (Atelier connector status: paired/scopes/last seen, pair form with base URL + `stp_` code + scope checkboxes, master + 4 toggles, outbox pending/failed counts, "Retry failed" button) and `WorkspaceInformationHirondelleCard` (linked: project name → `window.api.shell/openExternal` on `project.url`, "Last pulled …", Refresh + Unlink buttons, stale warning badge; unlinked: query input + `listProjects` results + Link button).

- [ ] **Step 1: Write concrete implementation** (UI task — TDD swapped for typecheck + manual verification). Skeleton of the settings card (real code, condensed):

```tsx
export function HirondelleSyncSettingsSection() {
  const hirondelleSync = useAppStore((state) => state.settings.hirondelleSync);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [status, setStatus] = useState<HirondelleSyncPublicStatus | null>(null);
  const [connector, setConnector] = useState<AtelierConnectorPublicStatus | null>(null);

  useEffect(() => {
    void window.api?.hirondelleSync?.getStatus?.().then((r) => r && setStatus(r.status));
    void window.api?.atelierConnector?.getStatus?.().then((r) => r && setConnector(r.status));
    return window.api?.hirondelleSync?.subscribeStatus?.(setStatus);
  }, []);

  const patch = (partial: Partial<HirondelleSyncSettings>) =>
    updateSettings({ patch: { hirondelleSync: { ...hirondelleSync, ...partial } } });

  return (
    <SettingsCard
      id="settings-field-hirondelle-sync"
      title="Hirondelle sync"
      description="Push workspace events and links to a linked Hirondelle project."
    >
      {/* connector status row: paired badge, scopes list, re-pair form calling
          window.api.atelierConnector.pair({ baseUrl, code, name, requestedScopes }) */}
      <SettingsToggleRow title="Enable Hirondelle sync" checked={hirondelleSync.enabled}
        onCheckedChange={(enabled) => patch({ enabled })} />
      <SettingsToggleRow title="PR opened events" checked={hirondelleSync.prOpened}
        onCheckedChange={(prOpened) => patch({ prOpened })} />
      <SettingsToggleRow title="Task completed events" checked={hirondelleSync.taskCompleted}
        onCheckedChange={(taskCompleted) => patch({ taskCompleted })} />
      <SettingsToggleRow title="Resource link mirroring" checked={hirondelleSync.resourceLinks}
        onCheckedChange={(resourceLinks) => patch({ resourceLinks })} />
      <SettingsToggleRow title="Turn summaries (interpretive)" checked={hirondelleSync.turnSummaries}
        onCheckedChange={(turnSummaries) => patch({ turnSummaries })} />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Outbox: {status?.pendingCount ?? 0} pending</span>
        <span>{status?.failedCount ?? 0} failed</span>
        {(status?.failedCount ?? 0) > 0 ? (
          <Button size="sm" variant="outline"
            onClick={() => void window.api?.hirondelleSync?.retryFailed?.()}>
            Retry failed
          </Button>
        ) : null}
      </div>
    </SettingsCard>
  );
}
```

(Match the actual `SettingsCard`/toggle-row component names used inside `settings-dialog-sections.tsx` — the `EditorFormatOnSave` block at line 3930 shows the toggle component in use; reuse those exact components.) Change the switch case to:

```tsx
case "integrations":
  return (
    <>
      <CraneConnectorSettingsSection />
      <HirondelleSyncSettingsSection />
    </>
  );
```

`WorkspaceInformationHirondelleCard` reads `useAppStore((s) => s.workspaceInformation.hirondelleProject)` and `activeWorkspaceId`; unlink/refresh call the bridge and rely on the `local-mcp:workspace-information-updated` push to refresh the store; picker keeps `query`/`results` local state.
- [ ] **Step 2: Typecheck** — `bun run typecheck` (also confirms `case "integrations"` stays a valid `SectionId` switch).
- [ ] **Step 3: Manual verification** — `bun run dev` (or the repo's electron dev script from `package.json`), open Settings → Integrations: both cards render, toggles persist across reload (rehydrate normalization), pair form disabled without secure storage message parity with the crane card; open a workspace → Information panel shows the Hirondelle card in unlinked state.
- [ ] **Step 4: Re-run gates** — `bun run typecheck && bun test tests/hirondelle-sync-settings.test.ts`.
- [ ] **Step 5: Commit** — `git add src/components/layout/settings-dialog-hirondelle-sync.tsx src/components/layout/settings-dialog-sections.tsx src/components/layout/WorkspaceInformationHirondelleCard.tsx src/components/layout/WorkspaceInformationPanel.tsx && git commit -m "feat(hirondelle-sync): settings card and information panel project card" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

### Task 13: Feature doc + full gate pass

**Files:**
- Create: `docs/features/hirondelle-sync.md` (from `docs/templates/feature-guide-template.md`)
- Modify (if publishing publicly): `site/src/public-docs.ts`

**Interfaces:** none (documentation).

- [ ] **Step 1: Write the doc** — sections per template: Summary (link a Stave workspace to a Hirondelle project; factual events pushed automatically, turn summaries opt-in; context snapshot at `.stave/context/hirondelle/<slug>.md`), When To Use It, Before You Start (Atelier connector paired with the `hirondelle` scope — re-pair if the connector predates scopes; OS credential encryption required), Quick Start (Settings → Integrations → pair → enable → link from the Information panel), How It Works (outbox survives offline/quit; dead-lettered items visible in settings with Retry), Limitations (no reverse-merge of Hirondelle links into Stave resources; deleted/archived projects mark the mapping stale and hold pushes), Privacy (only workspace name, branch, titles, URLs, and opt-in summaries are sent — never file paths, diffs, or transcripts). Every file path referenced in the doc must exist (`check:doc-paths`).
- [ ] **Step 2: Verify doc gate** — `bun run check:doc-paths`.
- [ ] **Step 3: Full focused suite** — `bun test tests/hirondelle-sync-contract.test.ts tests/hirondelle-sync-settings.test.ts tests/hirondelle-atelier-vault.test.ts tests/hirondelle-http-client.test.ts tests/hirondelle-sync-outbox-store.test.ts tests/hirondelle-sync-runtime.test.ts tests/hirondelle-workspace-information.test.ts tests/hirondelle-context-snapshot.test.ts tests/hirondelle-renderer-triggers.test.ts tests/crane-connector-runtime.test.ts tests/crane-connector-credential-vault.test.ts tests/crane-stave-contract.test.ts`
- [ ] **Step 4: Full gates** — `bun run typecheck && bun run check:max-lines-ratchet && bun run check:switch-exhaustiveness && bun run check:doc-paths`.
- [ ] **Step 5: Commit** — `git add docs/features/hirondelle-sync.md site/src/public-docs.ts && git commit -m "docs(hirondelle-sync): add feature guide" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Deviations from spec

1. **Exchange response scopes ride on `connector.scopes`** (reconciled against the Atelier plan of the same date: `staveConnectorRow` gains `scopes`, and the exchange route returns that connector row). The client defaults to `["crane"]` when the field is absent (pre-scopes server). The `stave-sync-v1` fixtures are byte-identical copies of the Atelier repo's and are the ongoing cross-repo contract check.
2. **`turn.completed` → `work_update` is hooked at `applyWorkspaceTurnSummaryToState`, not the script-trigger dispatcher.** Spec §5.3 routes it through the script-trigger emission point, but at `turn.completed` time the summary text does not exist yet — `generateWorkspaceTurnSummaryInBackground` (`src/store/app.store.ts:894`) produces it asynchronously and lands it via `applyWorkspaceTurnSummaryToState` (`app.store.ts:815`). Hooking there sends the actual `workSummary` text instead of a placeholder. `task.archiving` and `pr.afterOpen` follow the spec's dispatcher points exactly.
3. **Crane runtime keeps its code; only its vault instance changes.** Spec §5.1 says "runtime.ts keeps only job polling; credentials come from the atelier service." In the code, `CraneConnectorRuntime` already receives the vault by dependency injection, so swapping `getCraneConnectorCredentialVault()` to return the atelier vault (plus widening the dependency type to a structural `CraneCredentialStore`) achieves this with zero crane behavior change and no risky refactor. The legacy `CraneConnectorCredentialVault` class is retained because it documents the on-disk format the one-time migration must read (and keeps its existing test).
4. **Outbox "hold" is a fourth `status` value (`held`)** rather than a separate mechanism — spec §7's "해당 워크스페이스의 outbox 항목은 보류" maps to `setWorkspaceHeld(workspaceId, true)` on 404/409, restorable when the user re-links.
5. **The events wire format is flat and server-canonical** (reconciled against the Atelier plan): each event carries `staveEventId`/`kind`/`tier`/`summary`/`sourceUrl`/`workspaceName`/`branch` with `contract` on the request wrapper only — no `occurredAt` (the server stamps `detected_at`) and no per-event `contract`; the server assembles `metadata_json` and forces `source='stave'`. Responses: events → `{ contract, results: [{ staveEventId, status }] }`; links merge → `{ contract, results: [{ url, action }] }` aggregated client-side into counts. The shared fixtures pin all of this.
6. **`src/lib/atelier-connector/types.ts` is used for connector-scope/pairing types** alongside `src/lib/hirondelle-sync/` (explicitly allowed by the task brief) so the renderer settings card can type connector status without importing hirondelle contract code.
7. **Kickoff seed inclusion is a pass-through field** (`KickoffProposalDraft.hirondelleProject?`) — no kickoff classifier work; nothing currently produces a linked draft, but the seed path (spec §5.4) is ready for it.

### Critical Files for Implementation

- <stave-worktree>/electron/main/crane-connector/runtime.ts (concurrency skeleton: `computeCraneConnectorRetryDelay` line 143, `schedule`/`enqueue`/`stopPendingWork` lines 1180-1214, vault dependency line 66)
- <stave-worktree>/electron/main/crane-connector/http-client.ts (bounded-read + strict-Zod request core to clone for the Atelier client)
- <stave-worktree>/electron/persistence/crane-job-binding-store.ts (SQLite table/store pattern the outbox store mirrors; SqliteStore integration at electron/persistence/sqlite-store.ts:229 and ~2845)
- <stave-worktree>/electron/host-service/local-mcp-runtime.ts (`updateWorkspaceInformationState` line 731 — the single WI mutation path the new `set-workspace-hirondelle-project` action and MCP tools flow through)
- <stave-worktree>/src/store/app.store.ts (ratcheted at 3148 lines; trigger hook points: `runScriptHookInBackground` line 600, `applyWorkspaceTurnSummaryToState` line 815, `turn.completed` dispatch lines 3039-3062)

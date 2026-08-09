# Hirondelle Stave Sync (Atelier) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Atelier a connector-authenticated Stave sync surface for Hirondelle: generalize the existing Crane↔Stave `stc_` connector with scopes, and add four `/api/hirondelle/stave/*` routes (project picker list, context-bundle pull, idempotent change-event push, server-side links merge) behind a feature flag, with contract fixtures shared with the Stave repo.

**Architecture:** The Crane connector resolver (`resolveStaveConnectorCaller`) moves to a platform-shared module `src/stave-connector/auth.mjs` and gains per-request scope + app-permission checks; `crane_stave_connectors` gains a `scopes` JSON column (backfilled `["crane"]`); the pairing exchange endpoint gains `requestedScopes` granted as an intersection with the user's live permissions. Hirondelle gains a new route module `apps/hirondelle/src/server/stave-sync-routes.mjs` (registered from `registerHirondelleRoutes`), a data module `stave-sync-data.mjs` (idempotent conditional event inserts, links merge in one `db.batch`), and a Zod contract module `stave-sync-contract.mjs` validated against `stave-sync-v1` JSON fixtures. Two D1 migrations: `0025` (scopes) and `0026` (change_events table rebuild to add the `stave` source, partial expression unique index on `staveEventId`, `hirondelle_links.origin`).

**Tech Stack:** Bun workspaces, Hono routes on a Cloudflare Worker, D1/SQLite migrations in `migrations/d1/`, Zod v4 (`^4.1.13`), `bun:sqlite` D1-like test harness (`apps/hirondelle/tests/test-db.ts`).

## Global Constraints

- Repo: `/Users/heath.sinn/Workspace/Atelier`, branch `feat/heath/hirondelle-stave-sync` (branch format `<type>/<person>/<work-summary>` per AGENTS.md).
- Toolchain: Bun; run all commands from the repo root (`cd /Users/heath.sinn/Workspace/Atelier` first, since agent cwd resets).
- Feature flag: `HIRONDELLE_STAVE_SYNC_ENABLED` — absent/off ⇒ every `/api/hirondelle/stave/*` route returns 404 (same `envValue` on/true/1 pattern as `CRANE_STAVE_DISPATCH_ENABLED`).
- Contract version: `stave-sync-v1`; fixtures live in `apps/hirondelle/tests/fixtures/stave-sync-v1/*.json`.
- Body limits (crane `readBoundedJson` pattern): events POST 100_000 bytes, links/merge POST 160_000 bytes; GET routes take no body.
- Batch caps: max 20 events per push, max 50 links per merge.
- Migration numbers: `0025_stave_connector_scopes.sql`, `0026_hirondelle_stave_sync.sql` (last existing is 0024).
- File size cap: 500 lines per source file (`scripts/source-structure-baseline.json` `maxLines`); this is why routes/data/contract are three files.
- Verification gates: `bun run --filter @sendbird/hirondelle check`, `bun run --filter @sendbird/crane check`, `bun run check:structure`; Conventional Commits (`feat`/`fix`/`refactor`/`docs`/`test` + optional scope).

---

### Task 1: Migration 0025 — `scopes` column on `crane_stave_connectors`

**Files:**
- Create: `migrations/d1/0025_stave_connector_scopes.sql`
- Test: `apps/crane/tests/stave-connector-scopes.test.ts`

**Interfaces:**
- Consumes: `createStaveDispatchTestDb`, `seedStaveDispatchUser` from `apps/crane/tests/stave-dispatch-test-db.ts` (harness applies every file in `migrations/d1/` sorted).
- Produces: column `crane_stave_connectors.scopes TEXT NOT NULL DEFAULT '["crane"]' CHECK (json_valid(scopes))`. SQLite `ADD COLUMN` with a literal default backfills existing rows to `["crane"]` — no separate `UPDATE` needed (same technique as `0024_hirondelle_lifecycle.sql`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/crane/tests/stave-connector-scopes.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  createStaveDispatchTestDb,
  seedStaveDispatchUser,
  type StaveDispatchTestDb,
} from "./stave-dispatch-test-db";

describe("migration 0025: stave connector scopes", () => {
  let db: StaveDispatchTestDb;
  let user: ReturnType<typeof seedStaveDispatchUser>;

  beforeEach(() => {
    db = createStaveDispatchTestDb();
    user = seedStaveDispatchUser(db);
    db.sqlite
      .query(
        `insert into crane_stave_pairing_codes
           (id, user_id, code_hash, expires_at, consumed_at)
         values ('pairing-legacy', ?, 'code-hash-legacy',
                 '2027-01-01T00:00:00.000Z', '2026-08-09T00:00:00.000Z')`,
      )
      .run(user.id);
  });

  afterEach(() => db.close());

  test("backfills existing connector rows to the crane scope", () => {
    // Insert without naming `scopes`, exactly like the pre-0025 exchange did.
    db.sqlite
      .query(
        `insert into crane_stave_connectors
           (id, user_id, pairing_code_id, name, secret_hash, secret_prefix,
            protocol_version, app_version)
         values ('connector-legacy', ?, 'pairing-legacy', 'Legacy Stave',
                 'hash-legacy', 'stc_legacy00', 1, '1.0.0')`,
      )
      .run(user.id);
    const row = db.sqlite
      .query("select scopes from crane_stave_connectors where id = ?")
      .get("connector-legacy") as { scopes: string };
    expect(JSON.parse(row.scopes)).toEqual(["crane"]);
  });

  test("rejects non-JSON scopes", () => {
    expect(() =>
      db.sqlite
        .query(
          `insert into crane_stave_connectors
             (id, user_id, pairing_code_id, name, secret_hash, secret_prefix,
              protocol_version, app_version, scopes)
           values ('connector-bad', ?, 'pairing-legacy', 'Bad', 'hash-bad',
                   'stc_bad000000', 1, '1.0.0', 'not-json')`,
        )
        .run(user.id),
    ).toThrow(/CHECK/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/crane/tests/stave-connector-scopes.test.ts
```

Expected failure: `SQLiteError: no such column: scopes` on the `select scopes` query (and second insert fails with `table crane_stave_connectors has no column named scopes`).

- [ ] **Step 3: Write minimal implementation**

```sql
-- migrations/d1/0025_stave_connector_scopes.sql
-- Migration number: 0025 2026-08-09
-- Generalize the Crane <-> Stave connector into a shared Atelier connector.
-- `scopes` is a JSON array of app surfaces the connector may call ('crane',
-- 'hirondelle'). SQLite backfills existing rows with the literal default, so
-- every pre-existing connector stays crane-only; new scopes require
-- re-pairing (there is deliberately no upgrade endpoint in v1).

alter table crane_stave_connectors
  add column scopes text not null default '["crane"]'
  check (json_valid(scopes));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/crane/tests/stave-connector-scopes.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd /Users/heath.sinn/Workspace/Atelier && git add migrations/d1/0025_stave_connector_scopes.sql apps/crane/tests/stave-connector-scopes.test.ts && git commit -m "feat(crane): add scopes column to stave connectors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0026 — `stave` change-event source, idempotency index, `hirondelle_links.origin`

**Files:**
- Create: `migrations/d1/0026_hirondelle_stave_sync.sql`
- Modify: `apps/hirondelle/src/server/sections-data.mjs` (`linkRow` at lines 37–44; `links` build in `SECTION_SPECS` at lines 99–121 — expose/round-trip `origin` so a human section edit does not erase stave markers)
- Test: `apps/hirondelle/tests/stave-sync-migration.test.ts`

**Interfaces:**
- Consumes: `createHirondelleTestDb` from `apps/hirondelle/tests/test-db.ts`; raw `bun:sqlite` for the incremental-application preservation test.
- Produces: rebuilt `hirondelle_change_events` whose `source` CHECK includes `'stave'`; `unique index idx_hirondelle_change_events_stave_event on (project_id, json_extract(metadata_json,'$.staveEventId')) where … is not null`; `hirondelle_links.origin TEXT` nullable with `check (origin is null or origin = 'stave')`; `linkRow(row)` now returns `{ id, kind, label, url, note, origin, position }`.
- CRITICAL, empirically verified: `DROP TABLE hirondelle_change_events` fires `on delete set null` on `hirondelle_memory_entries.change_event_id` even under `PRAGMA defer_foreign_keys`, and D1 cannot run `PRAGMA foreign_keys = off`. The migration therefore snapshots memory→event links into a temp table before the drop and restores them after the rename. This exact sequence was validated in-memory (link preserved, `pragma foreign_key_check` clean, FK still enforced afterwards).

- [ ] **Step 1: Write the failing test**

```ts
// apps/hirondelle/tests/stave-sync-migration.test.ts
import Database from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { replaceSection } from "../src/server/sections-data.mjs";
import {
  createHirondelleTestDb,
  type HirondelleTestDb,
} from "./test-db";

const MIGRATIONS_DIR = path.resolve(
  import.meta.dir,
  "../../..",
  "migrations",
  "d1",
);

describe("migration 0026: hirondelle stave sync schema", () => {
  let db: HirondelleTestDb;

  beforeEach(() => {
    db = createHirondelleTestDb();
    db.sqlite
      .query(
        `insert into hirondelle_projects (id, slug, name)
         values ('proj-1', 'proj-one', 'Project One'),
                ('proj-2', 'proj-two', 'Project Two')`,
      )
      .run();
  });

  afterEach(() => db.close());

  const insertEvent = (id: string, projectId: string, metadata: string) =>
    db.sqlite
      .query(
        `insert into hirondelle_change_events
           (id, project_id, source, kind, summary, metadata_json)
         values (?, ?, 'stave', 'pr_opened', 'PR #1', ?)`,
      )
      .run(id, projectId, metadata);

  test("accepts the stave source and dedupes on staveEventId per project", () => {
    insertEvent("e1", "proj-1", '{"staveEventId":"s-1"}');
    expect(() => insertEvent("e2", "proj-1", '{"staveEventId":"s-1"}')).toThrow(
      /UNIQUE constraint failed/,
    );
    // Same staveEventId in a different project is allowed.
    insertEvent("e3", "proj-2", '{"staveEventId":"s-1"}');
    // Rows without a staveEventId are exempt from the partial index.
    insertEvent("e4", "proj-1", "{}");
    insertEvent("e5", "proj-1", "{}");
  });

  test("links carry a nullable stave origin that round-trips a section replace", async () => {
    const result = await replaceSection(db, "proj-1", "links", [
      { kind: "github", label: "PR #1", url: "https://github.com/x/1", origin: "stave" },
      { kind: "prd", label: "Spec", url: "https://example.test/spec" },
    ]);
    expect(result.rows).toMatchObject([
      { kind: "github", origin: "stave" },
      { kind: "prd", origin: null },
    ]);
    expect(() =>
      db.sqlite
        .query(
          `insert into hirondelle_links (id, project_id, kind, origin)
           values ('bad-origin', 'proj-1', 'other', 'human')`,
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  test("rebuild preserves memory entry links to change events", () => {
    // Apply migrations up to (excluding) 0026 on a raw db, seed, then apply
    // 0026 — the only way to prove the DROP TABLE does not null the FK.
    const sqlite = new Database(":memory:", { create: true });
    sqlite.exec("pragma foreign_keys = on;");
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files.filter((f) => f < "0026")) {
      sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"));
    }
    sqlite.exec(`
      insert into hirondelle_projects (id, slug, name)
        values ('proj-m', 'proj-m', 'Migrating');
      insert into hirondelle_change_events
        (id, project_id, source, kind, summary, metadata_json)
        values ('event-m', 'proj-m', 'manual', 'noted', 'A decision', '{}');
      insert into hirondelle_memory_entries
        (id, project_id, kind, body, change_event_id)
        values ('memory-m', 'proj-m', 'decision', 'Keep it', 'event-m');
    `);
    for (const name of files.filter((f) => f >= "0026")) {
      sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"));
    }
    const memory = sqlite
      .query("select change_event_id from hirondelle_memory_entries where id = 'memory-m'")
      .get() as { change_event_id: string | null };
    expect(memory.change_event_id).toBe("event-m");
    expect(sqlite.query("pragma foreign_key_check").all()).toHaveLength(0);
    const copied = sqlite
      .query("select summary from hirondelle_change_events where id = 'event-m'")
      .get() as { summary: string };
    expect(copied.summary).toBe("A decision");
    sqlite.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-migration.test.ts
```

Expected failures: `CHECK constraint failed` on `source = 'stave'` insert (first test), `table hirondelle_links has no column named origin` / missing `origin` in `linkRow` (second test), and the preservation test fails because no file `>= "0026"` exists so the `stave` source is still rejected — plus `origin` assertions fail.

- [ ] **Step 3: Write minimal implementation**

```sql
-- migrations/d1/0026_hirondelle_stave_sync.sql
-- Migration number: 0026 2026-08-09
-- Hirondelle <-> Stave workspace sync groundwork.
--
-- (1) hirondelle_change_events gains 'stave' as a source. SQLite cannot edit
--     a CHECK constraint, so the table is rebuilt: create new -> copy ->
--     drop -> rename. DROP TABLE fires `on delete set null` on
--     hirondelle_memory_entries.change_event_id even under
--     `PRAGMA defer_foreign_keys`, and D1 cannot disable foreign_keys, so the
--     memory->event linkage is snapshotted first and restored afterwards.
-- (2) A partial expression unique index makes Stave event pushes idempotent
--     on (project_id, metadata_json $.staveEventId).
-- (3) hirondelle_links gains a nullable `origin`: 'stave' marks rows the sync
--     surface owns and may update; NULL means human-created and untouchable.

create table hirondelle_change_events_new (
  id text primary key,
  project_id text not null
    references hirondelle_projects(id) on delete cascade,
  source text not null
    check (source in ('schedule', 'import', 'manual', 'slack', 'confluence', 'figma', 'stave')),
  kind text not null,
  summary text not null,
  source_url text,
  tier text not null default 'factual'
    check (tier in ('factual', 'interpretive')),
  metadata_json text not null default '{}' check (json_valid(metadata_json)),
  detected_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into hirondelle_change_events_new
  (id, project_id, source, kind, summary, source_url, tier, metadata_json, detected_at)
select id, project_id, source, kind, summary, source_url, tier, metadata_json, detected_at
from hirondelle_change_events;

create table hirondelle_stave_sync_memory_backup (
  id text primary key,
  change_event_id text not null
);

insert into hirondelle_stave_sync_memory_backup (id, change_event_id)
select id, change_event_id from hirondelle_memory_entries
where change_event_id is not null;

drop table hirondelle_change_events;

alter table hirondelle_change_events_new rename to hirondelle_change_events;

update hirondelle_memory_entries
   set change_event_id = (
     select b.change_event_id from hirondelle_stave_sync_memory_backup b
     where b.id = hirondelle_memory_entries.id
   )
 where id in (select id from hirondelle_stave_sync_memory_backup);

drop table hirondelle_stave_sync_memory_backup;

create index idx_hirondelle_change_events_project
  on hirondelle_change_events (project_id, detected_at);

create unique index idx_hirondelle_change_events_stave_event
  on hirondelle_change_events (project_id, json_extract(metadata_json, '$.staveEventId'))
  where json_extract(metadata_json, '$.staveEventId') is not null;

alter table hirondelle_links
  add column origin text
  check (origin is null or origin = 'stave');
```

In `apps/hirondelle/src/server/sections-data.mjs`, change `linkRow` (lines 37–44):

```js
export const linkRow = (row) => ({
  id: row.id,
  kind: row.kind,
  label: row.label ?? "",
  url: row.url ?? "",
  note: row.note ?? "",
  origin: row.origin ?? null,
  position: row.position,
});
```

and the `links` spec `build` (lines 99–121), so a full-replace section edit round-trips the marker instead of silently converting stave rows to human rows:

```js
  links: {
    table: "hirondelle_links",
    map: linkRow,
    build(db, projectId, input, position) {
      if (!LINK_KINDS.includes(input.kind))
        return { error: "invalid_link_kind" };
      return db
        .prepare(
          `insert into hirondelle_links
             (id, project_id, kind, label, url, note, origin, position)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          projectId,
          input.kind,
          text(input.label),
          text(input.url),
          text(input.note),
          input.origin === "stave" ? "stave" : null,
          position,
        );
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-migration.test.ts && bun run --filter @sendbird/hirondelle test
```

(The second command proves existing section/route tests still pass with the rebuilt table and the extra `origin` field.)

- [ ] **Step 5: Commit**

```bash
cd /Users/heath.sinn/Workspace/Atelier && git add migrations/d1/0026_hirondelle_stave_sync.sql apps/hirondelle/src/server/sections-data.mjs apps/hirondelle/tests/stave-sync-migration.test.ts && git commit -m "feat(hirondelle): allow stave change events and link origins

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Shared connector auth module with scopes + `requestedScopes` on exchange

**Files:**
- Create: `src/stave-connector/auth.mjs`
- Modify: `apps/crane/src/server/stave-dispatch-auth.mjs` (delete `bearerSecret` + `resolveStaveConnectorCaller` at lines 229–296 and re-export from the new module; extend `StavePairingExchangeSchema` at lines 13–25; extend `staveConnectorRow` at lines 42–55; replace the `crane:view` check in `exchangeStavePairingCode` at lines 116–119; add `scopes` to the connector insert at lines 149–174)
- Test: `apps/crane/tests/stave-dispatch-auth.test.ts` (extend)

**Interfaces:**
- Produces (in `src/stave-connector/auth.mjs`):
  - `export const STAVE_CONNECTOR_SCOPES = ["crane", "hirondelle"]`
  - `export const STAVE_SCOPE_BASE_PERMISSIONS = Object.freeze({ crane: "crane:view", hirondelle: "hirondelle:view" })`
  - `export function parseStaveConnectorScopes(raw)` — JSON parse with `'["crane"]'` fallback, filtered to known scopes
  - `export function grantedStaveConnectorScopes(access, requestedScopes)` — dedupe then filter by `hasPermission(access, STAVE_SCOPE_BASE_PERMISSIONS[scope])`
  - `export async function resolveStaveConnectorCaller(db, authorization, { now = Date.now(), touch = true, scope = "crane", permissionKey } = {})` — same 401/403 sentinels as today; additionally 403 when the connector's `scopes` lacks `scope`, and checks `permissionKey` (when given and different from the scope's base permission) on top of the base permission. Defaults reproduce old crane behavior exactly.
- Consumes: `getUserAccess`, `hasPermission` from `src/platform-db.mjs`; `sha256Hex` from `src/routes/context.mjs`.
- Crane keeps working: `stave-dispatch-auth.mjs` re-exports `resolveStaveConnectorCaller`, so `stave-dispatch-routes.mjs` line 11 and the existing tests need no import change.

- [ ] **Step 1: Write the failing test** — append to `apps/crane/tests/stave-dispatch-auth.test.ts`:

```ts
  function grantHirondelleView(db: StaveDispatchTestDb) {
    db.sqlite
      .query(
        `insert into platform_permissions (key, app_slug, label, system_permission)
         values ('hirondelle:view', 'hirondelle', 'View Hirondelle', 0)
         on conflict (key) do nothing`,
      )
      .run();
    db.sqlite
      .query(
        `insert into platform_role_permissions (role_id, permission_key)
         values ('role-member', 'hirondelle:view') on conflict do nothing`,
      )
      .run();
  }

  test("grants only the requested-scope intersection at exchange", async () => {
    const pairing = await createStavePairingCode(db, user.id, { now: NOW });
    // The user only holds crane:view — hirondelle is requested but not granted.
    const craneOnly = await exchangeStavePairingCode(
      db,
      {
        code: pairing.code,
        name: "Personal Stave",
        protocolVersion: 1,
        appVersion: "1.4.0",
        capabilities: ["run_task"],
        requestedScopes: ["crane", "hirondelle"],
      },
      { now: NOW + 1_000 },
    );
    expect(craneOnly.error).toBeUndefined();
    expect(craneOnly.connector.scopes).toEqual(["crane"]);

    grantHirondelleView(db);
    const secondPairing = await createStavePairingCode(db, user.id, {
      now: NOW + 2_000,
    });
    const both = await exchangeStavePairingCode(
      db,
      {
        code: secondPairing.code,
        name: "Personal Stave",
        protocolVersion: 1,
        appVersion: "1.4.0",
        capabilities: ["run_task"],
        requestedScopes: ["crane", "hirondelle"],
      },
      { now: NOW + 3_000 },
    );
    expect(both.connector.scopes).toEqual(["crane", "hirondelle"]);
  });

  test("defaults exchange to the crane scope for legacy payloads", async () => {
    const pairing = await createStavePairingCode(db, user.id, { now: NOW });
    const exchanged = await exchangeStavePairingCode(
      db,
      {
        code: pairing.code,
        name: "Personal Stave",
        protocolVersion: 1,
        appVersion: "1.4.0",
        capabilities: ["run_task"],
      },
      { now: NOW + 1_000 },
    );
    expect(exchanged.connector.scopes).toEqual(["crane"]);
  });

  test("rejects a connector that lacks the required scope", async () => {
    grantHirondelleView(db);
    const pairing = await createStavePairingCode(db, user.id, { now: NOW });
    const exchanged = await exchangeStavePairingCode(
      db,
      {
        code: pairing.code,
        name: "Personal Stave",
        protocolVersion: 1,
        appVersion: "1.4.0",
        capabilities: ["run_task"],
        requestedScopes: ["crane"],
      },
      { now: NOW + 1_000 },
    );
    const caller = await resolveStaveConnectorCaller(
      db,
      `Bearer ${exchanged.secret}`,
      { scope: "hirondelle", touch: false },
    );
    expect(caller).toEqual({ error: "forbidden", status: 403 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/crane/tests/stave-dispatch-auth.test.ts
```

Expected failures: `requestedScopes` rejected by the `.strict()` exchange schema → `{ error: "invalid_request", status: 400 }` instead of a connector; `connector.scopes` is `undefined`; scope option ignored so the last test resolves successfully instead of 403.

- [ ] **Step 3: Write minimal implementation**

Create `src/stave-connector/auth.mjs`:

```js
import { getUserAccess, hasPermission } from "../platform-db.mjs";
import { sha256Hex } from "../routes/context.mjs";

/**
 * Shared Stave desktop connector resolver for every Atelier surface that
 * accepts the `stc_` bearer secret (Crane dispatch, Hirondelle sync). Every
 * request re-verifies, live: secret hash -> active user -> connector scope ->
 * app permission. Scopes are granted at pairing time as the intersection of
 * the requested scopes and the permissions the pairing user actually holds.
 */

const SECRET_LIMIT = 128;

export const STAVE_CONNECTOR_SCOPES = ["crane", "hirondelle"];

export const STAVE_SCOPE_BASE_PERMISSIONS = Object.freeze({
  crane: "crane:view",
  hirondelle: "hirondelle:view",
});

export function parseStaveConnectorScopes(raw) {
  try {
    const parsed = JSON.parse(raw ?? '["crane"]');
    return Array.isArray(parsed)
      ? parsed.filter((value) => STAVE_CONNECTOR_SCOPES.includes(value))
      : [];
  } catch {
    return [];
  }
}

/** Pairing-time grant: requested scopes ∩ the user's live permissions. */
export function grantedStaveConnectorScopes(access, requestedScopes) {
  return [...new Set(requestedScopes)].filter((scope) =>
    hasPermission(access, STAVE_SCOPE_BASE_PERMISSIONS[scope]),
  );
}

function bearerSecret(authorization) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(authorization ?? "").trim());
  if (!match) return null;
  const secret = match[1];
  if (!secret.startsWith("stc_") || secret.length > SECRET_LIMIT) {
    return null;
  }
  return secret;
}

export async function resolveStaveConnectorCaller(
  db,
  authorization,
  { now = Date.now(), touch = true, scope = "crane", permissionKey } = {},
) {
  const secret = bearerSecret(authorization);
  if (!secret) return { error: "unauthorized", status: 401 };

  const secretHash = await sha256Hex(secret);
  const row = await db
    .prepare(
      `select c.*, u.status as user_status, u.display_name, u.email
       from crane_stave_connectors c
       join platform_users u on u.id = c.user_id
       where c.secret_hash = ? and c.revoked_at is null`,
    )
    .bind(secretHash)
    .first();
  if (!row || row.user_status !== "active") {
    return { error: "unauthorized", status: 401 };
  }

  const scopes = parseStaveConnectorScopes(row.scopes);
  if (!scopes.includes(scope)) {
    return { error: "forbidden", status: 403 };
  }

  const basePermission = STAVE_SCOPE_BASE_PERMISSIONS[scope];
  const access = await getUserAccess(db, row.user_id);
  if (
    !hasPermission(access, basePermission) ||
    (permissionKey &&
      permissionKey !== basePermission &&
      !hasPermission(access, permissionKey))
  ) {
    return { error: "forbidden", status: 403 };
  }

  if (touch) {
    try {
      await db
        .prepare(
          `update crane_stave_connectors set last_seen_at = ?
           where id = ? and revoked_at is null`,
        )
        .bind(new Date(now).toISOString(), row.id)
        .run();
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "stave connector presence update failed",
          connectorId: row.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return {
    connector: row,
    scopes,
    user: {
      id: row.user_id,
      status: row.user_status,
      display_name: row.display_name,
      email: row.email,
    },
    access,
  };
}
```

In `apps/crane/src/server/stave-dispatch-auth.mjs`:
1. Delete lines 229–296 (`bearerSecret` + `resolveStaveConnectorCaller`) and add at the top:

```js
import {
  grantedStaveConnectorScopes,
  parseStaveConnectorScopes,
} from "../../../../src/stave-connector/auth.mjs";

export { resolveStaveConnectorCaller } from "../../../../src/stave-connector/auth.mjs";
```

(`hasPermission` becomes unused in this file — remove it from the `platform-db.mjs` import; keep `getUserAccess`.)

2. `StavePairingExchangeSchema` gains, after `capabilities`:

```js
    requestedScopes: z
      .array(z.enum(["crane", "hirondelle"]))
      .min(1)
      .max(2)
      .default(["crane"]),
```

3. `staveConnectorRow` gains `scopes: parseStaveConnectorScopes(row.scopes),` after `capabilities`.
4. In `exchangeStavePairingCode`, replace lines 116–119 with:

```js
  const access = await getUserAccess(db, pairing.user_id);
  const scopes = grantedStaveConnectorScopes(access, payload.requestedScopes);
  if (scopes.length === 0) {
    return { error: "forbidden", status: 403 };
  }
```

5. In the connector `insert` statement (lines 149–174), add `scopes` to the column list after `capabilities_json`, add one `?` to the select projection, and bind `JSON.stringify(scopes)` after `capabilitiesJson`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun run --filter @sendbird/crane check
```

All existing crane dispatch tests (auth, routes, data, contract) must stay green — the defaults reproduce the old behavior.

- [ ] **Step 5: Commit**

```bash
cd /Users/heath.sinn/Workspace/Atelier && git add src/stave-connector/auth.mjs apps/crane/src/server/stave-dispatch-auth.mjs apps/crane/tests/stave-dispatch-auth.test.ts && git commit -m "feat(platform): extract shared stave connector auth with scopes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `stave-sync-v1` contract module and shared fixtures

**Files:**
- Create: `apps/hirondelle/src/server/stave-sync-contract.mjs`
- Create: `apps/hirondelle/tests/fixtures/stave-sync-v1/valid-events.json`, `valid-links-merge.json`, `valid-context-bundle.json`, `invalid-events-missing-id.json`, `invalid-events-forbidden-property.json`, `invalid-links-kind.json`
- Modify: `apps/hirondelle/package.json` (add `"zod": "^4.1.13"` to `dependencies`, then `bun install`)
- Test: `apps/hirondelle/tests/stave-sync-contract.test.ts`

**Interfaces (produced):**

```js
export const STAVE_SYNC_CONTRACT = "stave-sync-v1";
export const STAVE_SYNC_LIMITS; // Object.freeze({ batch: 20, branch: 200, label: 300, linksPerMerge: 50, note: 500, summary: 2_000, url: 2_048, workspaceName: 200 })
export const STAVE_SYNC_EVENT_KINDS; // ["pr_opened", "task_completed", "workspace_linked", "workspace_unlinked", "work_update"]
export const StaveSyncEventsRequestV1Schema;    // { contract, events: [1..20] } .strict()
export const StaveSyncLinksMergeRequestV1Schema; // { contract, links: [1..50] } .strict()
export const StaveSyncContextBundleV1Schema;     // full GET context-bundle response, .strict()
export const StaveSyncEventsResponseV1Schema;    // { contract, results: [{ staveEventId, status: "inserted"|"duplicate" }] }
export const StaveSyncLinksMergeResponseV1Schema; // { contract, results: [{ url, action: "inserted"|"updated"|"skipped" }] }
```

These fixtures are the cross-repo contract: the Stave repo copies `apps/hirondelle/tests/fixtures/stave-sync-v1/` verbatim (same pattern as crane's `stave-dispatch-v1`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/hirondelle/tests/stave-sync-contract.test.ts
import { describe, expect, test } from "bun:test";

import {
  STAVE_SYNC_LIMITS,
  StaveSyncContextBundleV1Schema,
  StaveSyncEventsRequestV1Schema,
  StaveSyncLinksMergeRequestV1Schema,
} from "../src/server/stave-sync-contract.mjs";

const fixtureDirectory = new URL("./fixtures/stave-sync-v1/", import.meta.url);

async function readFixture(name: string) {
  return Bun.file(new URL(name, fixtureDirectory)).json();
}

describe("Hirondelle Stave sync V1 contract", () => {
  test("accepts the shared valid fixtures", async () => {
    expect(
      StaveSyncEventsRequestV1Schema.safeParse(
        await readFixture("valid-events.json"),
      ).success,
    ).toBe(true);
    expect(
      StaveSyncLinksMergeRequestV1Schema.safeParse(
        await readFixture("valid-links-merge.json"),
      ).success,
    ).toBe(true);
    expect(
      StaveSyncContextBundleV1Schema.safeParse(
        await readFixture("valid-context-bundle.json"),
      ).success,
    ).toBe(true);
  });

  test.each([
    ["invalid-events-missing-id.json", StaveSyncEventsRequestV1Schema],
    ["invalid-events-forbidden-property.json", StaveSyncEventsRequestV1Schema],
    ["invalid-links-kind.json", StaveSyncLinksMergeRequestV1Schema],
  ])("rejects shared invalid fixture %s", async (name, schema) => {
    expect(schema.safeParse(await readFixture(name)).success).toBe(false);
  });

  test("enforces the 20-event batch cap", async () => {
    const payload = await readFixture("valid-events.json");
    const [seed] = payload.events;
    payload.events = Array.from(
      { length: STAVE_SYNC_LIMITS.batch + 1 },
      (_, index) => ({ ...seed, staveEventId: crypto.randomUUID(), summary: `Event ${index}` }),
    );
    expect(StaveSyncEventsRequestV1Schema.safeParse(payload).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-contract.test.ts
```

Expected failure: `Cannot find module '../src/server/stave-sync-contract.mjs'`.

- [ ] **Step 3: Write minimal implementation**

`apps/hirondelle/src/server/stave-sync-contract.mjs`:

```js
import { z } from "zod";

/**
 * The `stave-sync-v1` wire contract between the Stave desktop app and the
 * Hirondelle sync surface. The JSON fixtures in
 * `apps/hirondelle/tests/fixtures/stave-sync-v1/` are duplicated verbatim in
 * the Stave repo (crane's `stave-dispatch-v1` pattern) — change both together.
 */

export const STAVE_SYNC_CONTRACT = "stave-sync-v1";

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

export const STAVE_SYNC_EVENT_KINDS = [
  "pr_opened",
  "task_completed",
  "workspace_linked",
  "workspace_unlinked",
  "work_update",
];

const LINK_KINDS = ["prd", "api_spec", "figma", "slack", "github", "other"];
const STAGE_STATUSES = ["예정", "진행중", "대기", "완료", "지연", "취소"];

const urlSchema = z.string().trim().min(1).max(STAVE_SYNC_LIMITS.url).url();

const eventSchema = z
  .object({
    staveEventId: z.string().uuid(),
    kind: z.enum(STAVE_SYNC_EVENT_KINDS),
    summary: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.summary),
    sourceUrl: urlSchema.nullish(),
    tier: z.enum(["factual", "interpretive"]).default("factual"),
    workspaceName: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.workspaceName),
    branch: z.string().trim().max(STAVE_SYNC_LIMITS.branch).default(""),
  })
  .strict();

export const StaveSyncEventsRequestV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT),
    events: z.array(eventSchema).min(1).max(STAVE_SYNC_LIMITS.batch),
  })
  .strict();

const linkSchema = z
  .object({
    kind: z.enum(LINK_KINDS),
    label: z.string().trim().min(1).max(STAVE_SYNC_LIMITS.label),
    url: urlSchema,
    note: z.string().max(STAVE_SYNC_LIMITS.note).default(""),
  })
  .strict();

export const StaveSyncLinksMergeRequestV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT),
    links: z.array(linkSchema).min(1).max(STAVE_SYNC_LIMITS.linksPerMerge),
  })
  .strict();

const projectSchema = z
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

export const StaveSyncContextBundleV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT),
    project: projectSchema,
    sections: z
      .object({
        members: z.array(
          z.object({
            id: z.string(),
            role: z.string(),
            name: z.string(),
            userId: z.string().nullable(),
            scope: z.string(),
            position: z.number(),
          }).strict(),
        ),
        links: z.array(
          z.object({
            id: z.string(),
            kind: z.enum(LINK_KINDS),
            label: z.string(),
            url: z.string(),
            note: z.string(),
            origin: z.enum(["stave"]).nullable(),
            position: z.number(),
          }).strict(),
        ),
        properties: z.array(
          z.object({
            id: z.string(),
            group: z.enum(["environment", "github"]),
            label: z.string(),
            value: z.string(),
            position: z.number(),
          }).strict(),
        ),
        stages: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            plannedDate: z.string(),
            actualDate: z.string(),
            status: z.enum(STAGE_STATUSES),
            note: z.string(),
            position: z.number(),
          }).strict(),
        ),
        memory: z.array(
          z.object({
            id: z.string(),
            kind: z.enum(["decision", "constraint", "gotcha"]),
            body: z.string(),
            sourceUrl: z.string().nullable(),
            sourceLabel: z.string().nullable(),
            autoExtracted: z.boolean(),
            changeEventId: z.string().nullable(),
            position: z.number(),
          }).strict(),
        ),
      })
      .strict(),
    events: z.array(
      z.object({
        id: z.string(),
        projectId: z.string(),
        source: z.string(),
        kind: z.string(),
        summary: z.string(),
        sourceUrl: z.string().nullable(),
        tier: z.enum(["factual", "interpretive"]),
        metadata: z.record(z.string(), z.unknown()),
        detectedAt: z.string(),
      }).strict(),
    ),
    markdown: z.string(),
  })
  .strict();

export const StaveSyncEventsResponseV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT),
    results: z.array(
      z.object({
        staveEventId: z.string().uuid(),
        status: z.enum(["inserted", "duplicate"]),
      }).strict(),
    ),
  })
  .strict();

export const StaveSyncLinksMergeResponseV1Schema = z
  .object({
    contract: z.literal(STAVE_SYNC_CONTRACT),
    results: z.array(
      z.object({
        url: z.string(),
        action: z.enum(["inserted", "updated", "skipped"]),
      }).strict(),
    ),
  })
  .strict();
```

Fixtures — `valid-events.json`:

```json
{
  "contract": "stave-sync-v1",
  "events": [
    {
      "staveEventId": "0d5a9b3e-7c41-4f2a-9a67-2f8a1c3db901",
      "kind": "pr_opened",
      "summary": "PR #12: Harden the sync outbox",
      "sourceUrl": "https://github.com/sendbird/stave/pull/12",
      "tier": "factual",
      "workspaceName": "sync-outbox",
      "branch": "feat/sync-outbox"
    },
    {
      "staveEventId": "3d1f2c44-9e0b-4b7a-8f7d-6a2e9c0b1a22",
      "kind": "work_update",
      "summary": "Wired the outbox drain loop and added backoff tests.",
      "tier": "interpretive",
      "workspaceName": "sync-outbox",
      "branch": "feat/sync-outbox"
    }
  ]
}
```

`invalid-events-missing-id.json` — copy of the first event without `staveEventId`. `invalid-events-forbidden-property.json` — first event plus `"localPath": "/Users/dev/stave/worktrees/sync-outbox"` (strict schemas are the privacy boundary: local paths must never parse). `valid-links-merge.json`:

```json
{
  "contract": "stave-sync-v1",
  "links": [
    {
      "kind": "github",
      "label": "PR #12: Harden the sync outbox",
      "url": "https://github.com/sendbird/stave/pull/12",
      "note": ""
    },
    {
      "kind": "figma",
      "label": "Sync settings card",
      "url": "https://www.figma.com/design/AbC123/sync-card"
    }
  ]
}
```

`invalid-links-kind.json` — one link with `"kind": "wiki"`. `valid-context-bundle.json` — a complete bundle response: the project object with all 13 `projectRow` fields, one row in each of the five sections (the link row carrying `"origin": "stave"`), one `source: "stave"` event whose `metadata` holds `{ staveEventId, workspaceName, branch, contract }`, and a non-empty `markdown` string (shape shown in the contract schema above).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun install && bun test apps/hirondelle/tests/stave-sync-contract.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd /Users/heath.sinn/Workspace/Atelier && git add apps/hirondelle/src/server/stave-sync-contract.mjs apps/hirondelle/tests/fixtures/stave-sync-v1 apps/hirondelle/tests/stave-sync-contract.test.ts apps/hirondelle/package.json bun.lock && git commit -m "feat(hirondelle): add stave-sync-v1 contract and fixtures

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Sync route module — flag gate, connector guard, GET projects, GET context-bundle

**Files:**
- Create: `apps/hirondelle/src/server/stave-sync-routes.mjs`
- Create: `apps/hirondelle/tests/stave-sync-test-db.ts` (connector + project seed helpers)
- Modify: `apps/hirondelle/src/server/routes.mjs` (import at line 31 area; call `registerHirondelleStaveSyncRoutes(app, env);` as the first line inside `registerHirondelleRoutes`, line 41)
- Test: `apps/hirondelle/tests/stave-sync-routes.test.ts`

**Interfaces:**
- Produces: `export function isStaveSyncEnabled(env)`; `export function registerHirondelleStaveSyncRoutes(app, env)` registering `GET /api/hirondelle/stave/projects` and `GET /api/hirondelle/stave/projects/:ref/context-bundle` (POST routes arrive in Tasks 6–7). Internal helpers: `requireStaveConnector(c, env, permissionKey = "hirondelle:view")` (flag → 404; `getDb` → 503; shared resolver with `scope: "hirondelle"`), `resolveProjectForConnector(c, caller)` (same personal-visibility 404 logic as `resolveProject` in `routes.mjs` lines 52–62), and `readBoundedJson(c, maxBytes)` copied from crane `stave-dispatch-routes.mjs` lines 56–102.
- Consumes: `resolveStaveConnectorCaller` from `src/stave-connector/auth.mjs`; `getDb` from `src/platform-db.mjs`; `audit`, `envValue` from `src/routes/context.mjs`; `listHirondelleProjects`, `loadHirondelleProject`, `projectRow` from `./data.mjs`; `listChangeEvents` from `./events-data.mjs`; `loadSections` from `./sections-data.mjs`; `renderProjectMarkdown` from `./markdown-export.mjs`; `STAVE_SYNC_CONTRACT` from `./stave-sync-contract.mjs`.

- [ ] **Step 1: Write the failing test**

First the seed helper `apps/hirondelle/tests/stave-sync-test-db.ts`:

```ts
import { createHash } from "node:crypto";

import type { HirondelleTestDb } from "./test-db";

export const STAVE_SYNC_TEST_SECRET = `stc_${"a".repeat(64)}`;

/** Insert a paired connector row directly (pairing flow is crane-tested). */
export function seedStaveConnector(
  db: HirondelleTestDb,
  userId: string,
  {
    id = "connector-stave",
    scopes = ["hirondelle"],
    secret = STAVE_SYNC_TEST_SECRET,
  }: { id?: string; scopes?: string[]; secret?: string } = {},
) {
  const secretHash = createHash("sha256").update(secret).digest("hex");
  db.sqlite
    .query(
      `insert into crane_stave_pairing_codes
         (id, user_id, code_hash, expires_at, consumed_at)
       values (?, ?, ?, '2027-01-01T00:00:00.000Z', '2026-08-09T00:00:00.000Z')`,
    )
    .run(`pairing-${id}`, userId, `code-hash-${id}`);
  db.sqlite
    .query(
      `insert into crane_stave_connectors
         (id, user_id, pairing_code_id, name, secret_hash, secret_prefix,
          protocol_version, app_version, scopes)
       values (?, ?, ?, 'Test Stave', ?, ?, 1, '1.0.0', ?)`,
    )
    .run(id, userId, `pairing-${id}`, secretHash, secret.slice(0, 12), JSON.stringify(scopes));
  return { id, secret };
}

export function seedStaveProject(
  db: HirondelleTestDb,
  {
    id = "proj-shared",
    slug = "policy-knowledge-toggle",
    name = "Policy Knowledge Toggle",
    visibility = "shared",
    createdBy = "editor",
    status = "active",
  } = {},
) {
  db.sqlite
    .query(
      `insert into hirondelle_projects
         (id, slug, name, visibility, created_by, status)
       values (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, slug, name, visibility, createdBy, status);
  return { id, slug, name };
}
```

Then `apps/hirondelle/tests/stave-sync-routes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { registerHirondelleRoutes } from "../src/server/routes.mjs";
import { StaveSyncContextBundleV1Schema } from "../src/server/stave-sync-contract.mjs";
import {
  createHirondelleTestDb,
  seedHirondelleUser,
  SESSION_SECRET,
  type HirondelleTestDb,
} from "./test-db";
import { seedStaveConnector, seedStaveProject } from "./stave-sync-test-db";

describe("Hirondelle Stave sync routes", () => {
  let app: Hono;
  let db: HirondelleTestDb;
  let connector: ReturnType<typeof seedStaveConnector>;

  beforeEach(() => {
    db = createHirondelleTestDb();
    seedHirondelleUser(db, { id: "editor" });
    connector = seedStaveConnector(db, "editor");
    seedStaveProject(db);
    seedStaveProject(db, {
      id: "proj-own-personal",
      slug: "my-draft",
      name: "My Draft",
      visibility: "personal",
    });
    seedHirondelleUser(db, { id: "someone", email: "someone@example.test" });
    seedStaveProject(db, {
      id: "proj-foreign-personal",
      slug: "their-draft",
      name: "Their Draft",
      visibility: "personal",
      createdBy: "someone",
    });
    app = new Hono();
    registerHirondelleRoutes(app, {
      ATELIER_DB: db,
      SESSION_SECRET,
      HIRONDELLE_STAVE_SYNC_ENABLED: "true",
    });
  });

  afterEach(() => db.close());

  const get = (path: string, secret = connector.secret) =>
    app.request(path, { headers: { authorization: `Bearer ${secret}` } });

  test("returns 404 for every route when the flag is off", async () => {
    const gated = new Hono();
    registerHirondelleRoutes(gated, { ATELIER_DB: db, SESSION_SECRET });
    const response = await gated.request("/api/hirondelle/stave/projects", {
      headers: { authorization: `Bearer ${connector.secret}` },
    });
    expect(response.status).toBe(404);
  });

  test("rejects missing secrets, wrong scopes, and revoked permissions", async () => {
    const anonymous = await app.request("/api/hirondelle/stave/projects");
    expect(anonymous.status).toBe(401);

    seedHirondelleUser(db, { id: "crane-only", email: "crane@example.test" });
    const craneOnly = seedStaveConnector(db, "crane-only", {
      id: "connector-crane",
      scopes: ["crane"],
      secret: `stc_${"b".repeat(64)}`,
    });
    expect((await get("/api/hirondelle/stave/projects", craneOnly.secret)).status).toBe(403);

    db.sqlite
      .query(
        `insert into platform_user_permissions (user_id, permission_key, effect)
         values ('editor', 'hirondelle:view', 'deny')`,
      )
      .run();
    expect((await get("/api/hirondelle/stave/projects")).status).toBe(403);
  });

  test("lists projects with personal visibility scoped to the connector owner", async () => {
    const response = await get("/api/hirondelle/stave/projects");
    expect(response.status).toBe(200);
    const body = await response.json();
    const slugs = body.projects.map((p: { slug: string }) => p.slug).sort();
    expect(slugs).toEqual(["my-draft", "policy-knowledge-toggle"]);
    expect(body.contract).toBe("stave-sync-v1");
  });

  test("serves a contract-valid context bundle and 404s foreign personal projects", async () => {
    const foreign = await get(
      "/api/hirondelle/stave/projects/their-draft/context-bundle",
    );
    expect(foreign.status).toBe(404);

    const response = await get(
      "/api/hirondelle/stave/projects/policy-knowledge-toggle/context-bundle",
    );
    expect(response.status).toBe(200);
    const bundle = await response.json();
    const parsed = StaveSyncContextBundleV1Schema.safeParse(bundle);
    expect(parsed.success).toBe(true);
    expect(bundle.project.slug).toBe("policy-knowledge-toggle");
    expect(bundle.markdown).toContain("Policy Knowledge Toggle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-routes.test.ts
```

Expected failure: every request 404s (routes not registered) — the flag-off test passes by accident but all others fail on status assertions.

- [ ] **Step 3: Write minimal implementation**

`apps/hirondelle/src/server/stave-sync-routes.mjs`:

```js
import { getDb } from "../../../../src/platform-db.mjs";
import { audit, envValue } from "../../../../src/routes/context.mjs";
import { resolveStaveConnectorCaller } from "../../../../src/stave-connector/auth.mjs";
import { listHirondelleProjects, loadHirondelleProject, projectRow } from "./data.mjs";
import { listChangeEvents } from "./events-data.mjs";
import { renderProjectMarkdown } from "./markdown-export.mjs";
import { errorResponse } from "./route-errors.mjs";
import { loadSections } from "./sections-data.mjs";
import {
  STAVE_SYNC_CONTRACT,
  StaveSyncEventsRequestV1Schema,
  StaveSyncLinksMergeRequestV1Schema,
} from "./stave-sync-contract.mjs";
import { mergeStaveLinks, pushStaveEvents } from "./stave-sync-data.mjs";

/**
 * Hirondelle <-> Stave sync surface. Authenticated with the shared `stc_`
 * desktop connector (hirondelle scope), never a session cookie. Gated by
 * HIRONDELLE_STAVE_SYNC_ENABLED: off means every route 404s.
 */

const BODY_LIMITS = Object.freeze({
  events: 100_000,
  linksMerge: 160_000,
});

export function isStaveSyncEnabled(env) {
  const value = envValue(env, "HIRONDELLE_STAVE_SYNC_ENABLED")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

// readBoundedJson: copy verbatim from apps/crane/src/server/
// stave-dispatch-routes.mjs lines 56-102 (declared content-length check,
// streamed bounded read, fatal UTF-8 decode). Not exported there; the copy
// carries a provenance comment.

async function requireStaveConnector(c, env, permissionKey = "hirondelle:view") {
  if (!isStaveSyncEnabled(env)) {
    return { error: c.json({ error: "not_found" }, 404) };
  }
  const db = getDb(env);
  if (!db) {
    return { error: c.json({ error: "platform_db_unbound" }, 503) };
  }
  const caller = await resolveStaveConnectorCaller(
    db,
    c.req.header("authorization"),
    { scope: "hirondelle", permissionKey },
  );
  if (caller.error) {
    return { error: c.json({ error: caller.error }, caller.status) };
  }
  return { db, ...caller };
}

/** Same privacy rule as routes.mjs resolveProject: personal ⇒ creator only. */
async function resolveProjectForConnector(c, caller) {
  const row = await loadHirondelleProject(caller.db, c.req.param("ref"));
  if (!row) return { error: c.json({ error: "not_found" }, 404) };
  if (row.visibility === "personal" && row.created_by !== caller.user.id) {
    return { error: c.json({ error: "not_found" }, 404) };
  }
  return { row };
}

export function registerHirondelleStaveSyncRoutes(app, env) {
  app.get("/api/hirondelle/stave/projects", async (c) => {
    const caller = await requireStaveConnector(c, env);
    if (caller.error) return caller.error;
    const listing = await listHirondelleProjects(caller.db, {
      callerId: caller.user.id,
      limit: c.req.query("limit"),
      query: c.req.query("query"),
    });
    return c.json({
      contract: STAVE_SYNC_CONTRACT,
      projects: listing.projects.map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
        summary: project.summary,
        status: project.status,
        visibility: project.visibility,
        updatedAt: project.updatedAt,
      })),
      total: listing.total,
    });
  });

  app.get("/api/hirondelle/stave/projects/:ref/context-bundle", async (c) => {
    const caller = await requireStaveConnector(c, env);
    if (caller.error) return caller.error;
    const resolved = await resolveProjectForConnector(c, caller);
    if (resolved.error) return resolved.error;

    const [sections, feed] = await Promise.all([
      loadSections(caller.db, resolved.row.id),
      listChangeEvents(caller.db, resolved.row.id, { limit: 50 }),
    ]);
    const project = projectRow(resolved.row);
    return c.json({
      contract: STAVE_SYNC_CONTRACT,
      project,
      sections,
      events: feed.events,
      markdown: renderProjectMarkdown(project, sections),
    });
  });

  // POST /events and POST /links/merge are added in the next two tasks and
  // use BODY_LIMITS, readBoundedJson, StaveSyncEventsRequestV1Schema,
  // StaveSyncLinksMergeRequestV1Schema, pushStaveEvents, mergeStaveLinks,
  // errorResponse, and audit — imports above are complete for the final file.
}
```

(While the POST routes are absent, temporarily omit the unused imports — `errorResponse`, the two request schemas, `pushStaveEvents`, `mergeStaveLinks`, `audit`, `BODY_LIMITS` — and add each in the task that uses it, so `tsc --noUnusedLocals`-style lint and `node --check` stay clean; Tasks 6–7 restore the full import block shown here.)

In `apps/hirondelle/src/server/routes.mjs`, add to the imports:

```js
import { registerHirondelleStaveSyncRoutes } from "./stave-sync-routes.mjs";
```

and as the first statement of `registerHirondelleRoutes` (line 41):

```js
  registerHirondelleStaveSyncRoutes(app, env);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-routes.test.ts && bun test apps/hirondelle/tests/routes.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd /Users/heath.sinn/Workspace/Atelier && git add apps/hirondelle/src/server/stave-sync-routes.mjs apps/hirondelle/src/server/routes.mjs apps/hirondelle/tests/stave-sync-test-db.ts apps/hirondelle/tests/stave-sync-routes.test.ts && git commit -m "feat(hirondelle): add stave sync read routes behind flag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: POST events — idempotent batch push

**Files:**
- Create: `apps/hirondelle/src/server/stave-sync-data.mjs`
- Modify: `apps/hirondelle/src/server/events-data.mjs` (add `"stave"` to `CHANGE_EVENT_SOURCES`, lines 8–15)
- Modify: `apps/hirondelle/src/server/route-errors.mjs` (add `project_archived: 409` to `HIRONDELLE_ERROR_STATUS`)
- Modify: `apps/hirondelle/src/server/stave-sync-routes.mjs` (add the POST route + `readBoundedJson`/`BODY_LIMITS` if deferred in Task 5)
- Test: `apps/hirondelle/tests/stave-sync-events.test.ts`

**Interfaces:**
- Produces (in `stave-sync-data.mjs`): `export async function pushStaveEvents(db, projectId, events)` → `{ results: [{ staveEventId, status: "inserted" | "duplicate" }] }`. Each event becomes a **conditional insert** (`insert … select … where not exists`, matching the `conditionalInsertStatement` pattern in `events-data.mjs` lines 85–104) guarded on `(project_id, json_extract(metadata_json,'$.staveEventId'))`; the 0026 unique index is the race backstop. All statements plus `touchHirondelleProjectStatement(db, projectId)` run in one `db.batch`; per-statement `meta.changes` distinguishes inserted (1) from duplicate (0). Duplicates *within* one batch also resolve correctly because statements execute sequentially inside the transaction.
- Server composes `metadata_json` itself: `{ branch, contract: "stave-sync-v1", staveEventId, workspaceName }`; `source` is always `'stave'`; the client can never set either.
- Route: `POST /api/hirondelle/stave/projects/:ref/events` — guard with `permissionKey: "hirondelle:edit"`, resolve project, archived ⇒ `errorResponse(c, "project_archived")` (409), bounded read (100_000), `StaveSyncEventsRequestV1Schema.safeParse` ⇒ 400 `invalid_request`, then push + `audit(caller.db, caller.user, "hirondelle.stave_events_pushed", { appSlug: "hirondelle", id, type: "hirondelle_project" }, { connectorId, inserted, duplicates, slug })` (counts only — no summaries in audit metadata).

- [ ] **Step 1: Write the failing test**

```ts
// apps/hirondelle/tests/stave-sync-events.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { registerHirondelleRoutes } from "../src/server/routes.mjs";
import {
  createHirondelleTestDb,
  seedHirondelleUser,
  SESSION_SECRET,
  type HirondelleTestDb,
} from "./test-db";
import { seedStaveConnector, seedStaveProject } from "./stave-sync-test-db";

const EVENT_ID = "0d5a9b3e-7c41-4f2a-9a67-2f8a1c3db901";

describe("Hirondelle Stave events push", () => {
  let app: Hono;
  let db: HirondelleTestDb;
  let connector: ReturnType<typeof seedStaveConnector>;

  beforeEach(() => {
    db = createHirondelleTestDb();
    seedHirondelleUser(db, { id: "editor" });
    connector = seedStaveConnector(db, "editor");
    seedStaveProject(db);
    app = new Hono();
    registerHirondelleRoutes(app, {
      ATELIER_DB: db,
      SESSION_SECRET,
      HIRONDELLE_STAVE_SYNC_ENABLED: "true",
    });
  });

  afterEach(() => db.close());

  const makeEvent = (overrides = {}) => ({
    staveEventId: EVENT_ID,
    kind: "pr_opened",
    summary: "PR #12: Harden the sync outbox",
    sourceUrl: "https://github.com/sendbird/stave/pull/12",
    tier: "factual",
    workspaceName: "sync-outbox",
    branch: "feat/sync-outbox",
    ...overrides,
  });

  const push = (events: unknown[], slug = "policy-knowledge-toggle") =>
    app.request(`/api/hirondelle/stave/projects/${slug}/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${connector.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ contract: "stave-sync-v1", events }),
    });

  test("inserts once and reports duplicates on resend", async () => {
    const first = await push([makeEvent()]);
    expect(first.status).toBe(200);
    expect((await first.json()).results).toEqual([
      { staveEventId: EVENT_ID, status: "inserted" },
    ]);

    const again = await push([
      makeEvent(),
      makeEvent({
        staveEventId: "3d1f2c44-9e0b-4b7a-8f7d-6a2e9c0b1a22",
        kind: "task_completed",
        summary: "Task done",
        sourceUrl: undefined,
      }),
    ]);
    expect((await again.json()).results).toEqual([
      { staveEventId: EVENT_ID, status: "duplicate" },
      { staveEventId: "3d1f2c44-9e0b-4b7a-8f7d-6a2e9c0b1a22", status: "inserted" },
    ]);

    const rows = db.sqlite
      .query(
        `select source, kind, metadata_json from hirondelle_change_events
         where project_id = 'proj-shared' order by kind`,
      )
      .all() as Array<{ source: string; kind: string; metadata_json: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe("stave");
    expect(JSON.parse(rows[0].metadata_json)).toMatchObject({
      contract: "stave-sync-v1",
      staveEventId: EVENT_ID,
      workspaceName: "sync-outbox",
    });
  });

  test("rejects batches over 20 and duplicate ids within one batch dedupe", async () => {
    const tooMany = await push(
      Array.from({ length: 21 }, () =>
        makeEvent({ staveEventId: crypto.randomUUID() }),
      ),
    );
    expect(tooMany.status).toBe(400);

    const sameTwice = await push([
      makeEvent({ staveEventId: "9e107d9d-372b-4285-b1c0-92c2f0d1a111" }),
      makeEvent({ staveEventId: "9e107d9d-372b-4285-b1c0-92c2f0d1a111" }),
    ]);
    expect((await sameTwice.json()).results.map((r: { status: string }) => r.status)).toEqual([
      "inserted",
      "duplicate",
    ]);
  });

  test("refuses writes to archived projects with 409", async () => {
    seedStaveProject(db, {
      id: "proj-archived",
      slug: "sunset",
      name: "Sunset",
      status: "archived",
    });
    const response = await push([makeEvent()], "sunset");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "project_archived" });
  });

  test("requires hirondelle:edit", async () => {
    db.sqlite
      .query(
        `insert into platform_user_permissions (user_id, permission_key, effect)
         values ('editor', 'hirondelle:edit', 'deny')`,
      )
      .run();
    expect((await push([makeEvent()])).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-events.test.ts
```

Expected failure: `404` on every POST (route not registered).

- [ ] **Step 3: Write minimal implementation**

`apps/hirondelle/src/server/stave-sync-data.mjs` (first half; `mergeStaveLinks` arrives in Task 7):

```js
import { touchHirondelleProjectStatement } from "./data.mjs";
import { STAVE_SYNC_CONTRACT } from "./stave-sync-contract.mjs";

/**
 * D1 writes for the Stave sync surface. Events are idempotent on
 * (project_id, metadata_json $.staveEventId): each insert is guarded by NOT
 * EXISTS and the 0026 partial unique index backstops races. Everything runs
 * in one db.batch so a batch is atomic.
 */

function staveEventStatement(db, projectId, event) {
  const metadataJson = JSON.stringify({
    branch: event.branch || null,
    contract: STAVE_SYNC_CONTRACT,
    staveEventId: event.staveEventId,
    workspaceName: event.workspaceName,
  });
  return db
    .prepare(
      `insert into hirondelle_change_events
         (id, project_id, source, kind, summary, source_url, tier, metadata_json)
       select ?, ?, 'stave', ?, ?, ?, ?, ?
       where not exists (
         select 1 from hirondelle_change_events
         where project_id = ?
           and json_extract(metadata_json, '$.staveEventId') = ?
       )`,
    )
    .bind(
      crypto.randomUUID(),
      projectId,
      event.kind,
      event.summary,
      event.sourceUrl ?? null,
      event.tier,
      metadataJson,
      projectId,
      event.staveEventId,
    );
}

export async function pushStaveEvents(db, projectId, events) {
  const statements = events.map((event) =>
    staveEventStatement(db, projectId, event),
  );
  statements.push(touchHirondelleProjectStatement(db, projectId));
  const outcomes = await db.batch(statements);
  return {
    results: events.map((event, index) => ({
      staveEventId: event.staveEventId,
      status:
        (outcomes[index]?.meta?.changes ?? 0) > 0 ? "inserted" : "duplicate",
    })),
  };
}
```

In `events-data.mjs`, extend `CHANGE_EVENT_SOURCES` (lines 8–15) with `"stave"`. In `route-errors.mjs`, add `project_archived: 409,` to `HIRONDELLE_ERROR_STATUS` (alphabetical, after `not_found`). In `stave-sync-routes.mjs`, add the route inside `registerHirondelleStaveSyncRoutes` (plus `readBoundedJson` and `BODY_LIMITS` from the Task 5 sketch if they were deferred):

```js
  app.post("/api/hirondelle/stave/projects/:ref/events", async (c) => {
    const caller = await requireStaveConnector(c, env, "hirondelle:edit");
    if (caller.error) return caller.error;
    const resolved = await resolveProjectForConnector(c, caller);
    if (resolved.error) return resolved.error;
    if (resolved.row.status !== "active") {
      return errorResponse(c, "project_archived");
    }
    const body = await readBoundedJson(c, BODY_LIMITS.events);
    if (body.error) return c.json({ error: body.error }, body.status);
    const parsed = StaveSyncEventsRequestV1Schema.safeParse(body.data);
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const pushed = await pushStaveEvents(
      caller.db,
      resolved.row.id,
      parsed.data.events,
    );
    const inserted = pushed.results.filter(
      (result) => result.status === "inserted",
    ).length;
    await audit(
      caller.db,
      caller.user,
      "hirondelle.stave_events_pushed",
      { appSlug: "hirondelle", id: resolved.row.id, type: "hirondelle_project" },
      {
        connectorId: caller.connector.id,
        duplicates: pushed.results.length - inserted,
        inserted,
        slug: resolved.row.slug,
      },
    );
    return c.json({ contract: STAVE_SYNC_CONTRACT, results: pushed.results });
  });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-events.test.ts && bun run --filter @sendbird/hirondelle test
```

- [ ] **Step 5: Commit**

```bash
cd /Users/heath.sinn/Workspace/Atelier && git add apps/hirondelle/src/server/stave-sync-data.mjs apps/hirondelle/src/server/stave-sync-routes.mjs apps/hirondelle/src/server/events-data.mjs apps/hirondelle/src/server/route-errors.mjs apps/hirondelle/tests/stave-sync-events.test.ts && git commit -m "feat(hirondelle): accept idempotent stave change event batches

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: POST links/merge — server-side merge rules

**Files:**
- Modify: `apps/hirondelle/src/server/stave-sync-data.mjs` (add `normalizeStaveLinkUrl`, `mergeStaveLinks`)
- Modify: `apps/hirondelle/src/server/stave-sync-routes.mjs` (add the route)
- Test: `apps/hirondelle/tests/stave-sync-links.test.ts`

**Interfaces:**
- Produces: `export function normalizeStaveLinkUrl(raw)` — trim, strip `#fragment`, strip trailing slashes (merge identity only; the stored `url` keeps the client's original string). `export async function mergeStaveLinks(db, projectId, links)` → `{ results: [{ url, action: "inserted" | "updated" | "skipped" }] }`. Rules, all in **one** `db.batch` (atomic): unknown normalized URL ⇒ insert with `origin='stave'` at `max(position)+1`; existing row with `origin='stave'` ⇒ update `label`/`note` (+ `updated_at`); existing human row (`origin` NULL) ⇒ skipped; nothing is ever deleted; repeated URL within one payload ⇒ later occurrence skipped. Batch also carries `touchHirondelleProjectStatement`. **No change event is written** — the links section is its own history.
- Route: `POST /api/hirondelle/stave/projects/:ref/links/merge` — `hirondelle:edit`, archived ⇒ 409 `project_archived`, bounded read (160_000), `StaveSyncLinksMergeRequestV1Schema`, audit `"hirondelle.stave_links_merged"` with `{ connectorId, inserted, updated, skipped, slug }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hirondelle/tests/stave-sync-links.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { registerHirondelleRoutes } from "../src/server/routes.mjs";
import { mergeStaveLinks } from "../src/server/stave-sync-data.mjs";
import {
  createHirondelleTestDb,
  seedHirondelleUser,
  SESSION_SECRET,
  type HirondelleTestDb,
} from "./test-db";
import { seedStaveConnector, seedStaveProject } from "./stave-sync-test-db";

const PR_URL = "https://github.com/sendbird/stave/pull/12";

describe("Hirondelle Stave links merge", () => {
  let app: Hono;
  let db: HirondelleTestDb;
  let connector: ReturnType<typeof seedStaveConnector>;

  beforeEach(() => {
    db = createHirondelleTestDb();
    seedHirondelleUser(db, { id: "editor" });
    connector = seedStaveConnector(db, "editor");
    seedStaveProject(db);
    // A pre-existing human link at position 0.
    db.sqlite
      .query(
        `insert into hirondelle_links (id, project_id, kind, label, url, note, position)
         values ('link-human', 'proj-shared', 'prd', 'PRD', 'https://example.test/prd', 'human note', 0)`,
      )
      .run();
    app = new Hono();
    registerHirondelleRoutes(app, {
      ATELIER_DB: db,
      SESSION_SECRET,
      HIRONDELLE_STAVE_SYNC_ENABLED: "true",
    });
  });

  afterEach(() => db.close());

  const merge = (links: unknown[]) =>
    app.request("/api/hirondelle/stave/projects/policy-knowledge-toggle/links/merge", {
      method: "POST",
      headers: {
        authorization: `Bearer ${connector.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ contract: "stave-sync-v1", links }),
    });

  const allLinks = () =>
    db.sqlite
      .query(
        `select id, label, url, note, origin, position from hirondelle_links
         where project_id = 'proj-shared' order by position`,
      )
      .all() as Array<{ id: string; label: string; url: string; note: string; origin: string | null; position: number }>;

  test("inserts new stave links after existing rows and updates only stave rows", async () => {
    const first = await merge([
      { kind: "github", label: "PR #12", url: PR_URL, note: "" },
    ]);
    expect(first.status).toBe(200);
    expect((await first.json()).results).toEqual([
      { url: PR_URL, action: "inserted" },
    ]);
    expect(allLinks()).toMatchObject([
      { id: "link-human", origin: null, position: 0 },
      { label: "PR #12", origin: "stave", position: 1 },
    ]);

    // Re-merge with a fragment/trailing-slash variant: same identity, update.
    const second = await merge([
      { kind: "github", label: "PR #12: Harden outbox", url: `${PR_URL}/#discussion`, note: "merged" },
    ]);
    expect((await second.json()).results).toEqual([
      { url: `${PR_URL}/#discussion`, action: "updated" },
    ]);
    expect(allLinks()[1]).toMatchObject({
      label: "PR #12: Harden outbox",
      note: "merged",
      url: PR_URL, // stored URL is not rewritten by an update
    });
  });

  test("never touches human rows and never deletes anything", async () => {
    await merge([{ kind: "github", label: "PR #12", url: PR_URL, note: "" }]);
    const clobber = await merge([
      { kind: "prd", label: "Hijacked", url: "https://example.test/prd", note: "x" },
    ]);
    expect((await clobber.json()).results).toEqual([
      { url: "https://example.test/prd", action: "skipped" },
    ]);
    // A merge omitting the previously synced PR link must not remove it.
    expect(allLinks()).toMatchObject([
      { id: "link-human", label: "PRD", note: "human note", origin: null },
      { label: "PR #12", origin: "stave" },
    ]);
  });

  test("applies a merge as a single atomic batch", async () => {
    let batches = 0;
    const counting = {
      prepare: db.prepare.bind(db),
      batch: (statements: unknown[]) => {
        batches += 1;
        return db.batch(statements as never);
      },
    };
    await mergeStaveLinks(counting, "proj-shared", [
      { kind: "github", label: "PR #12", url: PR_URL, note: "" },
      { kind: "figma", label: "Card", url: "https://www.figma.com/design/AbC123/card", note: "" },
    ]);
    expect(batches).toBe(1);
  });

  test("refuses archived projects", async () => {
    db.sqlite
      .query("update hirondelle_projects set status = 'archived' where id = 'proj-shared'")
      .run();
    expect((await merge([{ kind: "github", label: "PR", url: PR_URL, note: "" }])).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-links.test.ts
```

Expected failure: `mergeStaveLinks` is not exported from `stave-sync-data.mjs` (SyntaxError/undefined), and the route requests 404.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/hirondelle/src/server/stave-sync-data.mjs`:

```js
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** Merge identity only — the stored url keeps the client's original string. */
export function normalizeStaveLinkUrl(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/#.*$/, "")
    .replace(/\/+$/, "");
}

/**
 * Server-side links merge. Insert unknown URLs as origin='stave' at the end;
 * update label/note of stave-origin rows; never touch human rows (origin
 * NULL); never delete. One db.batch — all or nothing. Deliberately writes no
 * change event: the links section is its own history.
 */
export async function mergeStaveLinks(db, projectId, links) {
  const { results: existing } = await db
    .prepare(
      `select id, url, origin, position from hirondelle_links
       where project_id = ? order by position`,
    )
    .bind(projectId)
    .all();

  const byUrl = new Map();
  for (const row of existing) {
    const key = normalizeStaveLinkUrl(row.url);
    if (key && !byUrl.has(key)) byUrl.set(key, row);
  }
  let nextPosition = existing.reduce(
    (max, row) => Math.max(max, row.position + 1),
    0,
  );

  const statements = [];
  const results = [];
  const seen = new Set();
  for (const link of links) {
    const key = normalizeStaveLinkUrl(link.url);
    if (!key || seen.has(key)) {
      results.push({ url: link.url, action: "skipped" });
      continue;
    }
    seen.add(key);
    const current = byUrl.get(key);
    if (!current) {
      statements.push(
        db
          .prepare(
            `insert into hirondelle_links
               (id, project_id, kind, label, url, note, origin, position)
             values (?, ?, ?, ?, ?, ?, 'stave', ?)`,
          )
          .bind(
            crypto.randomUUID(),
            projectId,
            link.kind,
            link.label,
            link.url,
            link.note,
            nextPosition,
          ),
      );
      nextPosition += 1;
      results.push({ url: link.url, action: "inserted" });
    } else if (current.origin === "stave") {
      statements.push(
        db
          .prepare(
            `update hirondelle_links
               set label = ?, note = ?, updated_at = ${NOW_SQL}
             where id = ?`,
          )
          .bind(link.label, link.note, current.id),
      );
      results.push({ url: link.url, action: "updated" });
    } else {
      results.push({ url: link.url, action: "skipped" });
    }
  }

  if (statements.length > 0) {
    statements.push(touchHirondelleProjectStatement(db, projectId));
    await db.batch(statements);
  }
  return { results };
}
```

Add the route to `stave-sync-routes.mjs`:

```js
  app.post("/api/hirondelle/stave/projects/:ref/links/merge", async (c) => {
    const caller = await requireStaveConnector(c, env, "hirondelle:edit");
    if (caller.error) return caller.error;
    const resolved = await resolveProjectForConnector(c, caller);
    if (resolved.error) return resolved.error;
    if (resolved.row.status !== "active") {
      return errorResponse(c, "project_archived");
    }
    const body = await readBoundedJson(c, BODY_LIMITS.linksMerge);
    if (body.error) return c.json({ error: body.error }, body.status);
    const parsed = StaveSyncLinksMergeRequestV1Schema.safeParse(body.data);
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);

    const merged = await mergeStaveLinks(
      caller.db,
      resolved.row.id,
      parsed.data.links,
    );
    const counts = { inserted: 0, skipped: 0, updated: 0 };
    for (const result of merged.results) counts[result.action] += 1;
    await audit(
      caller.db,
      caller.user,
      "hirondelle.stave_links_merged",
      { appSlug: "hirondelle", id: resolved.row.id, type: "hirondelle_project" },
      { connectorId: caller.connector.id, ...counts, slug: resolved.row.slug },
    );
    return c.json({ contract: STAVE_SYNC_CONTRACT, results: merged.results });
  });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun test apps/hirondelle/tests/stave-sync-links.test.ts && bun run --filter @sendbird/hirondelle test
```

- [ ] **Step 5: Commit**

```bash
cd /Users/heath.sinn/Workspace/Atelier && git add apps/hirondelle/src/server/stave-sync-data.mjs apps/hirondelle/src/server/stave-sync-routes.mjs apps/hirondelle/tests/stave-sync-links.test.ts && git commit -m "feat(hirondelle): merge stave resource links server-side

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, flag documentation, and final verification gates

**Files:**
- Modify: `docs/apps/hirondelle.md` (HTTP API section around line 114; Change events section around line 252)
- Modify: `docs/apps/crane-stave-connector.md` (Summary + Data Boundary sections)
- Modify: `.env.example` (after the `CRANE_STAVE_DISPATCH_ENABLED` block, ~line 38)

**Interfaces:** documentation only; no code. Final gates prove the whole branch.

- [ ] **Step 1: Write the docs** (no failing test — verification is the gate commands in Step 2/4)

`.env.example`, directly under the Crane dispatch block:

```
# Hirondelle <-> Stave workspace sync surface. Connector-authenticated
# /api/hirondelle/stave/* routes; disabled unless explicitly enabled.
# HIRONDELLE_STAVE_SYNC_ENABLED=false
```

`docs/apps/hirondelle.md` — add a subsection after the HTTP API table:

```markdown
### Stave sync surface (connector-authenticated)

Behind `HIRONDELLE_STAVE_SYNC_ENABLED` (off ⇒ 404), the shell Worker also
mounts four routes from
[`apps/hirondelle/src/server/stave-sync-routes.mjs`](../../apps/hirondelle/src/server/stave-sync-routes.mjs).
They are authenticated with the shared Stave desktop connector (`stc_` bearer,
`hirondelle` scope — see [Connect Crane to Stave](./crane-stave-connector.md)),
never a session cookie. Personal-project privacy follows the connector owner,
and every write lands a `platform_audit_logs` row. The wire contract is
`stave-sync-v1`; its fixtures live in
`apps/hirondelle/tests/fixtures/stave-sync-v1/` and are duplicated in the
Stave repo.

| Method and path                                             | Behavior                                                                                                       | Scope + permission               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `GET /api/hirondelle/stave/projects`                        | Picker listing (`query`, `limit`); personal projects only for the connector owner.                              | `hirondelle` + `hirondelle:view` |
| `GET /api/hirondelle/stave/projects/:ref/context-bundle`    | Project, all five sections, 50 recent change events, and the Markdown projection in one response.               | `hirondelle` + `hirondelle:view` |
| `POST /api/hirondelle/stave/projects/:ref/events`           | Idempotent change-event batch (max 20; deduped on `metadata.staveEventId`); `409 project_archived` when archived. | `hirondelle` + `hirondelle:edit` |
| `POST /api/hirondelle/stave/projects/:ref/links/merge`      | Server-side links merge: insert `origin='stave'` rows, update stave rows, never touch human rows, never delete. | `hirondelle` + `hirondelle:edit` |
```

In the "Change events and delivery" section, note the new source: `stave` events are factual pushes from a paired Stave workspace (`pr_opened`, `task_completed`, `workspace_linked`, `workspace_unlinked`) plus opt-in interpretive `work_update` turn summaries, carrying `{ staveEventId, workspaceName, branch, contract }` metadata.

`docs/apps/crane-stave-connector.md` — in Summary and Data Boundary: the pairing exchange now accepts `requestedScopes` (`crane`, `hirondelle`) and grants only the intersection with the permissions the pairing user actually holds; connectors paired before scopes exist remain crane-only, and adding the `hirondelle` scope requires re-pairing (no upgrade endpoint in v1). The data boundary is unchanged: titles, URLs, branch and workspace names only — never file paths, diffs, transcripts, or secrets.

- [ ] **Step 2: Run the full verification gates**

```bash
cd /Users/heath.sinn/Workspace/Atelier && bun run --filter @sendbird/hirondelle check && bun run --filter @sendbird/crane check && bun run check:structure && bun run check:server
```

Expected: all green. `check:structure` confirms every new file (`stave-sync-routes.mjs`, `stave-sync-data.mjs`, `stave-sync-contract.mjs`, `src/stave-connector/auth.mjs`, migrations, tests) is under the 500-line cap and no dependency cycle was added; `check:server` re-parses the worker with the new registrations.

- [ ] **Step 3: Fix anything the gates surface** (typical: unused imports under `--noUnusedLocals`, a fixture field drifting from a `.strict()` schema).

- [ ] **Step 4: Re-run the same gate command until clean.**

- [ ] **Step 5: Commit**

```bash
cd /Users/heath.sinn/Workspace/Atelier && git add docs/apps/hirondelle.md docs/apps/crane-stave-connector.md .env.example && git commit -m "docs(hirondelle): document stave sync surface and connector scopes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Deviations from spec

1. **Three Hirondelle modules instead of one.** The spec names only `stave-sync-routes.mjs`; the plan adds `stave-sync-data.mjs` and `stave-sync-contract.mjs`. `check:structure` caps files at 500 lines, and the repo convention already splits routes from data (`events-data.mjs`, `sections-data.mjs`) and contracts (crane's `stave-dispatch-contract.mjs`).
2. **Migration rebuild needs a memory-link backup/restore.** Verified empirically: `DROP TABLE hirondelle_change_events` fires `on delete set null` on `hirondelle_memory_entries.change_event_id` even under `PRAGMA defer_foreign_keys`, and D1 cannot run `PRAGMA foreign_keys = off`. Migration 0026 therefore snapshots `(id, change_event_id)` into a temp table before the drop and restores it after the rename — plain sequential SQL, no PRAGMAs, valid on both D1 and the `bun:sqlite` harness.
3. **Scopes backfill uses the column default.** `ADD COLUMN … NOT NULL DEFAULT '["crane"]'` backfills existing rows in SQLite; no separate `UPDATE` statement is required (same technique as migration 0024).
4. **`linkRow`/section-replace round-trip `origin` (Task 2).** Not in the spec, but without it any human edit of the links section (a full delete-and-reinsert in `replaceSection`) would silently convert every stave-origin row to a human row and break the merge rules from then on.
5. **Crane keeps importing the resolver from `stave-dispatch-auth.mjs`.** The shared implementation lives in `src/stave-connector/auth.mjs`; the crane module re-exports it so `stave-dispatch-routes.mjs` and existing tests need no import changes ("crane routes keep working").
6. **Requests never carry `source` or `metadata_json`.** The server forces `source='stave'` and composes metadata itself; `.strict()` schemas reject unexpected properties (including local paths — enforced by a dedicated invalid fixture).
7. **Concrete numbers the spec left open:** events body limit 100_000 bytes, links body limit 160_000 bytes, max 50 links per merge, `summary` ≤ 2 000 chars, `label` ≤ 300, `note` ≤ 500, `url` ≤ 2 048; archived-write error code is `project_archived` (409) via the existing `route-errors.mjs` table; scope/permission failures are 403, foreign personal projects 404 (matching `resolveProject`'s privacy comment).

### Critical Files for Implementation

- /Users/heath.sinn/Workspace/Atelier/apps/crane/src/server/stave-dispatch-auth.mjs
- /Users/heath.sinn/Workspace/Atelier/apps/hirondelle/src/server/routes.mjs
- /Users/heath.sinn/Workspace/Atelier/apps/hirondelle/src/server/sections-data.mjs
- /Users/heath.sinn/Workspace/Atelier/apps/hirondelle/tests/test-db.ts
- /Users/heath.sinn/Workspace/Atelier/migrations/d1/0022_hirondelle.sql

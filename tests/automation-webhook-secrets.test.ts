import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWebhookSecretLedger } from "../electron/main/automation-webhook-secrets";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function fixture(referenced: string[] = []) {
  const directory = await mkdtemp(join(tmpdir(), "webhook-secrets-"));
  directories.push(directory);
  const vault = new Set<string>();
  const references = new Set(referenced);
  let clock = 1_000;
  const make = () => createWebhookSecretLedger({
    registryPath: join(directory, "webhook-secrets.json"),
    listReferencedSecretIds: async () => new Set(references),
    deleteSecret: async (id) => { vault.delete(id); },
    now: () => clock,
  });
  const provision = async (ledger: ReturnType<typeof make>, id: string) => { vault.add(id); await ledger.track(id); };
  return { vault, references, make, provision, advance: (ms: number) => { clock += ms; }, at: () => clock };
}

test("cancelling provisioning deletes the unsaved secret", async () => {
  const f = await fixture();
  const ledger = f.make();
  await f.provision(ledger, "draft-secret");
  expect(await ledger.release(["draft-secret"])).toEqual(["draft-secret"]);
  expect(f.vault.has("draft-secret")).toBe(false);
});

test("a secret a saved schedule references is never deleted on release", async () => {
  const f = await fixture();
  const ledger = f.make();
  await f.provision(ledger, "saved-secret");
  f.references.add("saved-secret");
  expect(await ledger.release(["saved-secret"])).toEqual([]);
  expect(f.vault.has("saved-secret")).toBe(true);
});

test("switching the trigger off or deleting the schedule deletes the secret it no longer uses", async () => {
  const f = await fixture();
  const ledger = f.make();
  await f.provision(ledger, "switched-off");
  f.references.add("switched-off");
  // The schedule was saved with a time trigger, or deleted: nothing references the secret now.
  f.references.delete("switched-off");
  expect(await ledger.release(["switched-off"])).toEqual(["switched-off"]);
  expect(f.vault.has("switched-off")).toBe(false);
});

test("only secrets the webhook editor provisioned can be released", async () => {
  const f = await fixture();
  const ledger = f.make();
  f.vault.add("user-secret");
  expect(await ledger.release(["user-secret"])).toEqual([]);
  expect(f.vault.has("user-secret")).toBe(true);
});

test("on startup, secrets left by an editor that never saved are removed; saved ones stay", async () => {
  const f = await fixture(["kept"]);
  const first = f.make();
  await f.provision(first, "kept");
  await f.provision(first, "abandoned");
  f.advance(10);
  const restarted = f.make();
  expect(await restarted.reconcile(f.at())).toEqual(["abandoned"]);
  expect([...f.vault]).toEqual(["kept"]);
  // A secret provisioned after the restart belongs to an open editor and is left alone.
  await f.provision(restarted, "open-editor");
  expect(await restarted.reconcile(f.at() - 1)).toEqual([]);
  expect(f.vault.has("open-editor")).toBe(true);
});

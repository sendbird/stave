import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const LedgerSchema = z.object({
  version: z.literal(1),
  secrets: z.array(z.object({ id: z.string().min(1), provisionedAt: z.number() }).strict()).max(10_000),
}).strict();
type Ledger = z.infer<typeof LedgerSchema>;

/**
 * The signing secrets the webhook editor created in the vault. Only these are
 * ever deleted here, and only when no saved schedule references them: when the
 * editor is cancelled, when a schedule stops using one (trigger switched off,
 * schedule deleted), and on startup for any an editor left behind.
 */
export function createWebhookSecretLedger(dependencies: {
  registryPath: string;
  listReferencedSecretIds: () => Promise<ReadonlySet<string>>;
  deleteSecret: (id: string) => Promise<unknown>;
  now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  let chain = Promise.resolve();
  function serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = chain.then(action, action);
    chain = next.then(() => undefined, () => undefined);
    return next;
  }
  async function load(): Promise<Ledger> {
    try {
      return LedgerSchema.parse(JSON.parse(await readFile(dependencies.registryPath, "utf8")));
    } catch {
      return { version: 1, secrets: [] };
    }
  }
  async function save(ledger: Ledger) {
    await mkdir(dirname(dependencies.registryPath), { recursive: true });
    const temporary = `${dependencies.registryPath}.tmp`;
    await writeFile(temporary, JSON.stringify(ledger), { mode: 0o600 });
    await rename(temporary, dependencies.registryPath);
  }
  /** Deletes the tracked, unreferenced secrets `select` picks; returns their ids. */
  async function sweep(select: (entry: Ledger["secrets"][number]) => boolean) {
    const ledger = await load();
    const referenced = await dependencies.listReferencedSecretIds();
    const deleted: string[] = [];
    const kept: Ledger["secrets"] = [];
    for (const entry of ledger.secrets) {
      if (!select(entry) || referenced.has(entry.id)) { kept.push(entry); continue; }
      try {
        await dependencies.deleteSecret(entry.id);
        deleted.push(entry.id);
      } catch {
        kept.push(entry);
      }
    }
    if (deleted.length) await save({ ...ledger, secrets: kept });
    return deleted;
  }
  return {
    track: (id: string) => serialize(async () => {
      const ledger = await load();
      if (!ledger.secrets.some((entry) => entry.id === id)) await save({ ...ledger, secrets: [...ledger.secrets, { id, provisionedAt: now() }] });
    }),
    release: (ids: readonly string[]) => serialize(() => {
      const wanted = new Set(ids);
      return sweep((entry) => wanted.has(entry.id));
    }),
    /** For startup: secrets provisioned before `before` belong to no open editor any more. */
    reconcile: (before: number) => serialize(() => sweep((entry) => entry.provisionedAt < before)),
  };
}
export type WebhookSecretLedger = ReturnType<typeof createWebhookSecretLedger>;

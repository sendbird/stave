import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { DelegationPolicyStore } from "../electron/persistence/delegation-policy-store";
import { resolveSupervisedTurnAccounts } from "../electron/host-service/supervised-turn-accounts";

test("wake-up and report follow-ups read captured account IDs after a store restart, while explicit turn selection wins", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
  const store = new DelegationPolicyStore(db as never);
  store.saveTaskAccounts("task", { codexAccountProfileId: "44444444-4444-4444-8444-444444444444" });
  const restarted = new DelegationPolicyStore(db as never);
  expect(resolveSupervisedTurnAccounts(undefined, restarted.loadTaskAccounts("task"))).toEqual({ codexAccountProfileId: "44444444-4444-4444-8444-444444444444", claudeAccountProfileId: "system-default" });
  expect(resolveSupervisedTurnAccounts({ codexAccountProfileId: "system-default" }, restarted.loadTaskAccounts("task")).codexAccountProfileId).toBe("system-default");
  expect(restarted.loadTaskAccounts("other")).toBeUndefined();
  expect(resolveSupervisedTurnAccounts(undefined, undefined)).toEqual({ codexAccountProfileId: "system-default", claudeAccountProfileId: "system-default" });
  db.close();
});

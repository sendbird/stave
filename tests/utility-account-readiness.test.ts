import { expect, spyOn, test } from "bun:test";
import * as tooling from "../electron/main/utils/tooling-status";
import { defaultUtilityAuthGate } from "../electron/providers/utility-inference";
import { currentProviderAccountId, withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";

for (const providerId of ["codex", "claude-code"] as const) {
  test(`${providerId} utility readiness isolates concurrent accounts and cached success`, async () => {
    const checked: string[] = [];
    const finish = new Map<string, (value: { ready: boolean; detail: string }) => void>();
    const inspection = spyOn(tooling, "inspectUtilityRunnerReadiness").mockImplementation(async () => {
      const account = currentProviderAccountId(providerId);
      checked.push(account);
      return new Promise((resolve) => finish.set(account, resolve));
    });
    const key = providerId === "codex" ? "codexAccountProfileId" : "claudeAccountProfileId";
    const read = (account: string) => withProviderAccountScope({ [key]: account }, () => defaultUtilityAuthGate({ providerId }));
    try {
      const a = read("account-a"), b = read("account-b"), sameB = read("account-b");
      await Promise.resolve();
      expect(checked).toEqual(["account-a", "account-b"]);
      finish.get("account-a")!({ ready: false, detail: "A login required" });
      finish.get("account-b")!({ ready: true, detail: "B ready" });
      expect(await a).toEqual({ ready: false, detail: "A login required" });
      expect(await b).toEqual({ ready: true, detail: "B ready" });
      expect(await sameB).toEqual(await b);
      expect(await read("account-b")).toEqual(await b);
      const retryA = read("account-a");
      await Promise.resolve();
      finish.get("account-a")!({ ready: true, detail: "A signed in" });
      expect(await retryA).toEqual({ ready: true, detail: "A signed in" });
      expect(checked).toEqual(["account-a", "account-b", "account-a"]);
    } finally { inspection.mockRestore(); }
  });
}

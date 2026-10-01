import { describe, expect, test } from "bun:test";
import {
  getCachedProviderCommandCatalog,
  setCachedProviderCommandCatalog,
} from "@/lib/providers/provider-command-catalog";

describe("provider command catalog cache", () => {
  test("evicts the oldest entries past the cache cap", () => {
    for (let index = 0; index < 34; index += 1) {
      setCachedProviderCommandCatalog({
        providerId: "claude-code",
        cwd: `/tmp/workspace-${index}`,
        catalog: {
          providerId: "claude-code",
          status: "ready",
          commands: [{
            name: `command-${index}`,
            command: `/command-${index}`,
            description: `description-${index}`,
          }],
          detail: "",
        },
      });
    }

    const oldest = getCachedProviderCommandCatalog({
      providerId: "claude-code",
      cwd: "/tmp/workspace-0",
    });
    const newest = getCachedProviderCommandCatalog({
      providerId: "claude-code",
      cwd: "/tmp/workspace-33",
    });

    expect(oldest.status).toBe("idle");
    expect(oldest.commands).toEqual([]);
    expect(newest.status).toBe("ready");
    expect(newest.commands[0]?.command).toBe("/command-33");
  });
});


test("native commands never cross account profiles sharing the same workspace", () => {
  const scope = { providerId: "claude-code" as const, cwd: "/tmp/account-catalog" };
  for (const accountProfileId of ["system-default", "11111111-1111-4111-8111-111111111111"]) {
    setCachedProviderCommandCatalog({ ...scope, accountProfileId, catalog: {
      providerId: "claude-code", status: "ready", commands: [], detail: accountProfileId,
    } });
  }
  expect(getCachedProviderCommandCatalog(scope).detail).toBe("system-default");
  expect(getCachedProviderCommandCatalog({ ...scope, accountProfileId: "11111111-1111-4111-8111-111111111111" }).detail).toBe("11111111-1111-4111-8111-111111111111");
});

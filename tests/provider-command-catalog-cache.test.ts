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

import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * The Advisor consult grant registry (`grantsByKey` in
 * `electron/providers/advisor-consult.ts`) is a module-level `Map`, so it only
 * exists in the process that minted the grant. Grants are minted by
 * `providerRuntime` — which is loaded exclusively by `electron/host-service.ts`,
 * a separate Node child process (`ELECTRON_RUN_AS_NODE`).
 *
 * The `stave_consult_advisor` Local MCP tool is served from the Electron main
 * process. When main resolved the key against its own (always empty) copy of
 * the registry, every consult failed instantly with `unknown-consult-key`, no
 * matter which advisor model was armed. These tests pin the process boundary so
 * the tool can never silently regress to an in-process lookup again.
 */

const repoRoot = path.resolve(import.meta.dir, "..");

function readSource(relativePath: string) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("advisor consult process boundary", () => {
  test("the main-process MCP tool never resolves grants in-process", async () => {
    const source = await readSource("electron/main/stave-mcp-server.ts");
    expect(source).not.toContain("providers/advisor-consult");
  });

  test("the main-process MCP tool forwards the consult to the host service", async () => {
    const source = await readSource("electron/main/stave-mcp-server.ts");
    expect(source).toContain("consultAdvisor");

    const bridge = await readSource("electron/main/stave-mcp-service.ts");
    expect(bridge).toContain("provider.consult-advisor");
  });

  test("the host service dispatches the consult to the provider runtime", async () => {
    const source = await readSource("electron/host-service.ts");
    expect(source).toContain('case "provider.consult-advisor":');
    expect(source).toContain("providerRuntime.consultAdvisor");
  });

  test("the consult backstop outlives the longest advisor timeout", async () => {
    const [{ resolveHostServiceRequestTimeoutMs }, advisor] = await Promise.all([
      import("../electron/main/host-service-request-timeouts"),
      import("../src/lib/providers/advisor"),
    ]);

    const backstopMs = resolveHostServiceRequestTimeoutMs({
      method: "provider.consult-advisor",
    });
    // A bounded backstop is deliberate: the consult enforces its own deadline,
    // and an unbounded entry would leak forever if a response were dropped.
    expect(backstopMs).not.toBeNull();

    const longestConsultTimeoutMs = Math.max(
      ...(["claude-code", "codex"] as const).flatMap((providerId) =>
        advisor
          .listAdvisorEffortsForProvider(providerId)
          .map((effort) =>
            advisor.resolveAdvisorTimeoutMs({
              providerId,
              model: "advisor-model",
              effort,
            }),
          ),
      ),
    );
    // If the backstop fired first the primary would see a transport error
    // instead of the runtime's `advisor-timeout` outcome.
    expect(backstopMs!).toBeGreaterThan(longestConsultTimeoutMs);
  });
});

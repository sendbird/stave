import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { runClaudeSessionOperation } from "../electron/provider-accounts/claude-session-operations";

const originalUserData = process.env.STAVE_USER_DATA_PATH;
const roots: string[] = [];
afterEach(() => {
  if (originalUserData === undefined) delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = originalUserData;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("concurrent native session workers use their own account directory without changing the host", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "stave-session-worker-"));
  roots.push(root);
  process.env.STAVE_USER_DATA_PATH = root;
  const registry = new ProviderAccountRegistry(root);
  const profiles = ["A", "B"].map(label => registry.create({ providerId: "claude-code", label }));
  const sdkPath = path.join(root, "sdk-fixture.mjs");
  writeFileSync(sdkPath, `
    import { basename } from 'node:path';
    const identity = basename(process.env.CLAUDE_CONFIG_DIR);
    export async function getSessionMessages(id) {
      await new Promise(resolve => setTimeout(resolve, 10));
      return [{ type: 'assistant', uuid: id === 'source' ? 'original' : identity }];
    }
    export async function forkSession() { return { sessionId: identity }; }
    export async function renameSession() { throw new Error('fixture failure'); }
  `);
  const sdkUrl = pathToFileURL(sdkPath).href;
  // Electron runs Node workers. Run this boundary under Node as Bun's Worker env
  // handling does not override environment variables already present in the host.
  const entry = path.join(root, "runner.ts");
  writeFileSync(entry, `
    import { runClaudeSessionOperation } from ${JSON.stringify(path.resolve("electron/provider-accounts/claude-session-operations.ts"))};
    const originalConfig = process.env.CLAUDE_CONFIG_DIR;
    const ids = ${JSON.stringify(profiles.map(p => p.id))};
    const dependencies = { sdkUrl: ${JSON.stringify(sdkUrl)} };
    const results = await Promise.all(ids.map(id => runClaudeSessionOperation('fork', {
      sessionId: 'source', upToMessageId: 'original',
      runtimeOptions: { claudeBinaryPath: process.execPath, claudeAccountProfileId: id },
    }, dependencies)));
    const failed = await runClaudeSessionOperation('rename', {
      sessionId: 'source', title: 'Title', runtimeOptions: { claudeBinaryPath: process.execPath, claudeAccountProfileId: ids[0] },
    }, dependencies);
    console.log(JSON.stringify({ results, failed, hostUnchanged: process.env.CLAUDE_CONFIG_DIR === originalConfig }));
  `);
  const bundle = await Bun.build({ entrypoints: [entry], target: "node", format: "esm", outdir: root, naming: "runner.mjs" });
  expect(bundle.success).toBe(true);
  const child = spawnSync("node", [path.join(root, "runner.mjs")], { encoding: "utf8", timeout: 15_000, env: { ...process.env, STAVE_USER_DATA_PATH: root } });
  expect(child.stderr).toBe("");
  expect(child.status).toBe(0);
  const outcome = JSON.parse(child.stdout);
  for (const [index, result] of outcome.results.entries()) {
    expect(result).toMatchObject({ ok: true, sessionId: profiles[index]!.id, messageIdMap: { original: profiles[index]!.id } });
  }
  expect(outcome.hostUnchanged).toBe(true);
  expect(outcome.failed).toEqual({ ok: false, detail: "fixture failure" });
  registry.remove({ providerId: "claude-code", id: profiles[0]!.id });
  expect(() => runClaudeSessionOperation("fork", {
    sessionId: "source", runtimeOptions: { claudeAccountProfileId: profiles[0]!.id },
  }, { sdkUrl })).toThrow();
});

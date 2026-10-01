import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { buildClaudeCliEnv, resolveClaudeCliExecutablePath } from "../providers/cli-path-env";
import type { StreamTurnArgs } from "../providers/types";
import type { ClaudeSessionForkResponse, ProviderMutationResponse } from "../../src/lib/providers/provider.types";

// SDK filesystem helpers read process.env and do not accept a config directory.
// A worker gets its own environment; concurrent calls never mutate the host's.
const operationSource = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const sdk = await import(workerData.sdkUrl);
  const a = workerData.args;
  const options = a.cwd ? { dir: a.cwd } : {};
  if (workerData.operation === 'agent-history') {
    const agents = await sdk.listSubagents(a.sessionId, options);
    if (!agents.includes(a.agentId)) throw new Error("This agent's saved transcript is unavailable.");
    const messages = await sdk.getSubagentMessages(a.sessionId, a.agentId, { ...options, offset: a.offset, limit: a.limit });
    return { ok: true, detail: 'Saved subagent conversation', messages };
  }
  if (workerData.operation === 'rename') {
    await sdk.renameSession(a.sessionId, a.title, options);
    return { ok: true, detail: 'Renamed Claude session.' };
  }
  const source = await sdk.getSessionMessages(a.sessionId, options);
  const result = await sdk.forkSession(a.sessionId, { ...options, upToMessageId: a.upToMessageId, ...(a.title ? {title: a.title} : {}) });
  const forked = await sdk.getSessionMessages(result.sessionId, options);
  const end = source.findIndex(m => m.uuid === a.upToMessageId);
  const messageIdMap = Object.fromEntries(source.slice(0, end + 1).flatMap((m, i) =>
    m.type === 'assistant' && forked[i]?.type === 'assistant' ? [[m.uuid, forked[i].uuid]] : []));
  return { ok: true, detail: 'Forked Claude session.', sessionId: result.sessionId,
    messageIdMap, lastAssistantMessageId: forked.filter(m => m.type === 'assistant').at(-1)?.uuid };
})().then(result => parentPort.postMessage(result), error => parentPort.postMessage({ok: false, detail: error.message}));
`;

type SessionArgs = { sessionId: string; cwd?: string; runtimeOptions?: StreamTurnArgs["runtimeOptions"] };

export function runClaudeSessionOperation<T extends ProviderMutationResponse>(
  operation: "fork" | "rename" | "agent-history",
  args: SessionArgs & { title?: string; upToMessageId?: string; agentId?: string; offset?: number; limit?: number },
  dependencies?: { sdkUrl: string },
): Promise<T> {
  const executablePath = resolveClaudeCliExecutablePath({ explicitPath: args.runtimeOptions?.claudeBinaryPath });
  const env = buildClaudeCliEnv({ executablePath: executablePath ?? process.execPath, cwd: args.cwd, accountProfileId: args.runtimeOptions?.claudeAccountProfileId });
  const sdkUrl = dependencies?.sdkUrl ?? pathToFileURL(createRequire(import.meta.url).resolve("@anthropic-ai/claude-agent-sdk")).href;
  return new Promise<T>((resolve) => {
    const worker = new Worker(operationSource, {
      eval: true,
      env: Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      workerData: { sdkUrl, operation, args: { sessionId: args.sessionId, cwd: args.cwd, title: args.title, upToMessageId: args.upToMessageId, agentId: args.agentId, offset: args.offset, limit: args.limit } },
    });
    const timer = setTimeout(() => finish({ ok: false, detail: "Claude session operation timed out." } as T), 30_000);
    let completed = false;
    function finish(result: T) {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    }
    worker.once("message", finish);
    worker.once("error", (error) => finish({ ok: false, detail: error.message } as T));
    worker.once("exit", () => finish({ ok: false, detail: "Claude session operation ended without a result." } as T));
  });
}

export async function forkClaudeSession(args: SessionArgs & { upToMessageId: string; title?: string }): Promise<ClaudeSessionForkResponse> {
  try { return await runClaudeSessionOperation<ClaudeSessionForkResponse>("fork", args); }
  catch (error) { return { ok: false, detail: String(error) }; }
}

export async function renameClaudeSession(args: SessionArgs & { title: string }): Promise<ProviderMutationResponse> {
  try { return await runClaudeSessionOperation("rename", args); }
  catch (error) { return { ok: false, detail: String(error) }; }
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { evalProviderId, type EvalProviderName } from "./models";
import type { EvalProvider } from "./runner";

/** Reuses utility inference's auth gate and tool-disabled, read-only runtimes with the resolved model. */
export async function createEvalProvider(provider: EvalProviderName, model: string): Promise<EvalProvider & { dispose(): void }> {
  const providerId = evalProviderId(provider);
  const codex = provider === "codex" ? await import("../electron/providers/codex-app-server-runtime") : null;
  const claude = codex ? null : await import("../electron/providers/claude-sdk-runtime");
  const codexBinaryPath = codex?.resolveCodexExecutablePath();
  const claudeBinaryPath = claude?.resolveClaudeExecutablePath();
  let version = "unavailable";
  try {
    const executable = codexBinaryPath ?? claudeBinaryPath;
    if (executable) version = (await promisify(execFile)(executable, ["--version"], { timeout: 10_000, maxBuffer: 4096 })).stdout.trim();
  }
  catch { /* Readiness reports a missing executable without running a model. */ }
  return {
    model, version,
    dispose: () => codex?.disposeAllCodexAppServerClients(),
    ready: async () => {
      try {
        const { defaultUtilityAuthGate } = await import("../electron/providers/utility-inference");
        return await defaultUtilityAuthGate({ providerId });
      } catch {
        return { ready: false, detail: "Provider credentials or runtime readiness could not be checked. Configure utility inference authentication and retry." };
      }
    },
    generate: async (prompt) => {
      const signal = AbortSignal.timeout(300_000);
      const response = codex
        ? await codex.runCodexReadOnlyPrompt({ prompt, model, signal, isolated: true, toolsDisabled: true,
          ...(codexBinaryPath ? { runtimeOptions: { codexBinaryPath } } : {}) })
        : await claude?.runClaudeReadOnlyPrompt({ prompt, model, signal, label: "Prompt evaluation",
          ...(claudeBinaryPath ? { runtimeOptions: { claudeBinaryPath } } : {}) });
      if (!response) throw new Error("Provider runtime unavailable.");
      if (!response.ok || !response.text) throw new Error(response.detail ?? "Provider returned no evaluation output.");
      return { text: response.text, model: response.model, version, cost: response.usage?.totalCostUsd };
    },
  };
}

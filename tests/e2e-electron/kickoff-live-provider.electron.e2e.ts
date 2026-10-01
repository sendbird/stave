import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, seedRepository } from "./harness/stave-app";

// Opt in: this uses the installed Codex binary and its existing authentication.
// The native wrapper forwards every byte unchanged and records only the
// request fields this test checks; it never reads authentication or account data.
test("Start now delivers the saved Agent and user settings to live Codex", async ({}, testInfo) => {
  test.skip(process.env.STAVE_LIVE_PROVIDER_E2E !== "1", "Requires explicit live provider opt-in.");
  test.setTimeout(180_000);
  const directory = await mkdtemp(path.join(tmpdir(), "stave-kickoff-live-"));
  const repositoryPath = path.join(directory, "repository");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(repositoryPath);
  execFileSync("git", ["init", "-b", "main"], { cwd: repositoryPath });
  await writeFile(path.join(repositoryPath, "README.md"), "Temporary Kickoff validation.\n");
  execFileSync("git", ["add", "README.md"], { cwd: repositoryPath });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: initialize temporary repository"], { cwd: repositoryPath });
  const binaryPath = process.env.STAVE_LIVE_CODEX_BINARY ?? execFileSync("which", ["codex"], { encoding: "utf8" }).trim();
  const wrapperPath = path.join(directory, "codex-observer");
  const requestsPath = path.join(directory, "requests.ndjson");
  const responsesPath = path.join(directory, "responses.ndjson");
  await writeFile(wrapperPath, `#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const child = spawn(${JSON.stringify(binaryPath)}, process.argv.slice(2), { stdio: ["pipe", "pipe", "inherit"] });
let pending = "";
process.stdin.on("data", (chunk) => {
  child.stdin.write(chunk);
  pending += chunk.toString();
  let newline;
  while ((newline = pending.indexOf("\\n")) !== -1) {
    const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
    try {
      const message = JSON.parse(line);
      if (message.method !== "thread/start" && message.method !== "turn/start") continue;
      const p = message.params ?? {};
      fs.appendFileSync(${JSON.stringify(requestsPath)}, JSON.stringify({ method: message.method,
        model: p.model, approvalPolicy: p.approvalPolicy, sandbox: p.sandbox,
        sandboxPolicy: p.sandboxPolicy, effort: p.effort,
        instructions: p.config?.developer_instructions ?? p.developerInstructions,
      }) + "\\n");
    } catch {}
  }
});
process.stdin.on("end", () => child.stdin.end());
let outputPending = "";
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  outputPending += chunk.toString();
  let newline;
  while ((newline = outputPending.indexOf("\\n")) !== -1) {
    const line = outputPending.slice(0, newline); outputPending = outputPending.slice(newline + 1);
    try {
      const message = JSON.parse(line);
      if (!["item/agentMessage/delta", "turn/completed", "error", "item/started"].includes(message.method)) continue;
      const p = message.params ?? {};
      fs.appendFileSync(${JSON.stringify(responsesPath)}, JSON.stringify({ method: message.method,
        text: p.delta, status: p.turn?.status, error: p.turn?.error?.message ?? p.error?.message,
        itemType: p.item?.type,
      }) + "\\n");
    } catch {}
  }
});
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGTERM", () => child.kill("SIGTERM"));
`);
  await chmod(wrapperPath, 0o755);
  const marker = "STAVE_KICKOFF_AGENT_OK";
  const agent = {
    version: 1, id: "kickoff-live", source: "custom", name: "Kickoff validation",
    description: "A no-tools validation response.",
    instructions: `Reply with exactly ${marker}. Do not call tools or take any other action.`,
    skills: [], model: { mode: "fixed", providerId: "codex", model: "", effort: "low" },
    tools: {}, permission: "auto", workspace: "same-workspace",
    report: ["summary"], usableAs: ["primary"], canCall: [], concurrency: 1, archived: false,
  };
  const stave = await launchStave();
  let lastSnapshot: unknown;
  try {
    const catalog = await stave.page.evaluate(async ({ cwd, wrapperPath }) =>
      window.api.provider!.getModelCatalog!({ providerId: "codex", cwd, runtimeOptions: { codexBinaryPath: wrapperPath } }),
      { cwd: repositoryPath, wrapperPath },
    );
    if (!catalog.ok) throw new Error(catalog.detail);
    const model = process.env.STAVE_LIVE_CODEX_MODEL ?? catalog.models.find((entry) => entry.isDefault && !entry.hidden)?.model;
    if (!model) throw new Error("Live Codex reported no default model.");
    agent.model.model = model;
    await seedRepository(stave.page, {
      repositoryPath,
      settings: {
        customAgents: [agent], modelCodex: model, codexReasoningEffort: "low",
        codexBinaryPath: wrapperPath, codexFileAccess: "read-only", codexApprovalPolicy: "never",
        codexNetworkAccess: false, autoRoutingEnabled: false, advisorEnabled: false,
        workerEnabled: false, themeMode: "dark",
      },
    });
    await stave.page.getByRole("button", { name: "Agents", exact: true }).click();
    await stave.page.getByRole("button", { name: /^Kickoff validation/ }).click();
    await stave.page.getByRole("button", { name: "Start work…", exact: true }).click();
    const dialog = stave.page.getByRole("dialog", { name: "Kick off workspace" });
    await dialog.getByRole("textbox", { name: "Work source" }).fill(
      "Reply with the marker specified in your saved Agent instructions. Do not call tools, edit files, run commands, or start external actions.",
    );
    await expect(dialog.getByRole("combobox", { name: "Who does the work" })).toContainText(agent.name);
    await expect(dialog).toContainText("Your permission settings");
    await dialog.screenshot({ path: testInfo.outputPath("start-now.png") });
    await dialog.getByRole("button", { name: "Start now", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => {
      const result = await stave.page.evaluate(async () => window.api.agents!.listAssignments!({}));
      return result.ok ? result.value.find((row) => row.agentConfigId === "kickoff-live")?.taskId : null;
    }, { timeout: 30_000 }).toBeTruthy();
    const assignmentResult = await stave.page.evaluate(async () => window.api.agents!.listAssignments!({}));
    if (!assignmentResult.ok) throw new Error(assignmentResult.message);
    const assignment = assignmentResult.value.find((row) => row.agentConfigId === agent.id)!;
    expect(assignment.agent.instructions).toBe(agent.instructions);
    expect(assignment.agentContentHash).toBeTruthy();
    expect(assignment.providerId).toBe("codex");
    await expect.poll(async () => {
      const result = await stave.page.evaluate(async (workspaceId) => window.api.persistence!.loadWorkspace!({ workspaceId }), assignment.workspaceId!);
      lastSnapshot = result;
      return result.snapshot?.messagesByTask[assignment.taskId!]?.some((message) =>
        message.role === "assistant" && message.content.includes(marker) && !message.isStreaming,
      ) ?? false;
    }, { timeout: 100_000, intervals: [500, 1000] }).toBe(true);
    const requests = (await readFile(requestsPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(requests).toContainEqual(expect.objectContaining({
      method: "thread/start", model,
      instructions: expect.stringContaining(marker),
    }));
    expect(requests).toContainEqual(expect.objectContaining({
      method: "turn/start", model, effort: "low", approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly", networkAccess: false },
    }));
    const responses = (await readFile(responsesPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(responses).toContainEqual(expect.objectContaining({ method: "turn/completed", status: "completed" }));
    const toolItems = responses.filter((response) =>
      response.itemType && /command|functionCall|mcpTool|fileChange|webSearch/i.test(response.itemType),
    );
    expect(toolItems).toEqual([]);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: repositoryPath, encoding: "utf8" })).toBe("");
    console.log(`Live Kickoff: model=${model}, effort=low, files=read-only, approval=never, tools=${toolItems.length}, marker persisted=true`);
    await testInfo.attach("native-runtime-parameters", { body: JSON.stringify(requests, null, 2), contentType: "application/json" });
    await stave.page.screenshot({ path: testInfo.outputPath("completed.png") });
  } finally {
    await testInfo.attach("persisted-conversation", { body: JSON.stringify(lastSnapshot ?? null), contentType: "application/json" });
    const responses = await readFile(responsesPath, "utf8").catch(() => "");
    await testInfo.attach("native-responses", { body: responses, contentType: "application/x-ndjson" });
    await stave.close();
    await rm(directory, { recursive: true, force: true });
  }
});

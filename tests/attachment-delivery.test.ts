import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDraftFileContexts, getDraftImageContexts } from "../src/store/prompt-draft-context";
import { buildCanonicalConversationRequest } from "../src/lib/providers/canonical-request";
import { StreamTurnArgsSchema } from "../electron/main/ipc/provider-conversation-schemas";
import { buildAcpNativeImageBlocks, buildClaudeNativeImageBlocks, buildCodexNativeImageItems, collectNativeImageInputs } from "../electron/providers/native-image-input";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const directories: string[] = [];
afterEach(async () => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("queued mixed attachments preserve every image through IPC and native provider inputs", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "stave-attachments-"));
  directories.push(cwd);
  const firstBytes = Buffer.alloc(1024 * 1024 + 1, 1);
  const secondBytes = Buffer.from("second-image");
  await writeFile(path.join(cwd, "first.png"), firstBytes);
  await writeFile(path.join(cwd, "second.png"), secondBytes);
  await writeFile(path.join(cwd, "notes.txt"), "Describe both images.");
  const reads: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { api: { fs: {
    readFile: async ({ filePath }: { filePath: string }) => {
      reads.push(filePath);
      return { ok: true, content: await readFile(path.join(cwd, filePath), "utf8") };
    },
  } } } });
  const draft = {
    text: "Compare",
    attachedFilePaths: ["first.png", "notes.txt"],
    attachments: [{ kind: "image" as const, id: "pasted", label: "pasted.png",
      mimeType: "image/png", dataUrl: "data:image/png;base64,dGhpcmQ=" }],
    promptBatch: [{ id: "batch", content: "Also compare", attachedFilePaths: ["second.png"], attachments: [] }],
  };
  const fileContexts = await getDraftFileContexts({
    promptDraft: draft, session: { editorTabs: [] }, workspaceRootPath: cwd,
  });
  expect(reads).toEqual(["notes.txt"]);
  const conversation = buildCanonicalConversationRequest({
    providerId: "codex", history: [], userInput: "Compare",
    fileContexts, imageContexts: getDraftImageContexts({ promptDraft: draft }),
  });
  const payload = StreamTurnArgsSchema.parse({
    providerId: "codex", cwd, prompt: "Compare", conversation, runtimeOptions: {},
  });
  const { inputs } = collectNativeImageInputs({ cwd, conversation: payload.conversation });
  expect(inputs.map((image) => image.label)).toEqual(["first.png", "second.png", "pasted.png"]);
  const codex = buildCodexNativeImageItems(inputs);
  expect(codex).toEqual([
    { type: "localImage", path: path.join(cwd, "first.png"), detail: "original" },
    { type: "localImage", path: path.join(cwd, "second.png"), detail: "original" },
    { type: "image", url: "data:image/png;base64,dGhpcmQ=", detail: "original" },
  ]);
  const expected = [firstBytes.toString("base64"), secondBytes.toString("base64"), "dGhpcmQ="];
  expect((await buildClaudeNativeImageBlocks({ inputs })).blocks.map((block) => block.source.data)).toEqual(expected);
  // Cursor and Kiro share the ACP image boundary.
  expect((await buildAcpNativeImageBlocks({ inputs })).blocks.map((block) => block.data)).toEqual(expected);
});

test("unreadable file attachments fail explicitly instead of sending an incomplete request", async () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { api: { fs: {
    readFile: async () => ({ ok: false, content: "", stderr: "File is too large to preview." }),
  } } } });
  await expect(getDraftFileContexts({
    promptDraft: { text: "Read", attachedFilePaths: ["large.txt"], attachments: [] },
    session: { editorTabs: [] }, workspaceRootPath: "/tmp/project",
  })).rejects.toThrow("Cannot read attached file large.txt");
});

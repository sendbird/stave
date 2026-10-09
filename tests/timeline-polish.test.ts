import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { tokenizeShellCommand, type ShellTokenKind } from "@/lib/shell-command-tokens";
import {
  selectLatestTurnThought,
  summarizeTurnThought,
  TURN_THOUGHT_MAX_CHARS,
} from "@/components/session/composer-shelf/turn-thought";
import {
  buildToolImageReferenceText,
  parseToolOutputImages,
  readPngSize,
} from "@/lib/tool-images/tool-images";
import { createToolImageStore } from "../electron/main/tool-images/tool-image-store";
import type { ChatMessage } from "@/types/chat";

/** A 3×2 red PNG. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==";
const IMAGE_ID = "0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100";

function kinds(line: string) {
  return tokenizeShellCommand(line)
    .filter((token) => token.kind !== "text")
    .map((token) => [token.kind, token.text] as [ShellTokenKind, string]);
}

describe("shell command tokens", () => {
  test("joining the tokens gives the line back", () => {
    for (const line of [
      "cd packages/app && rm -rf dist node_modules/.cache && bun install",
      `git commit -m "fix: a && b" # note`,
      "FOO=1 BAR='x y' bun test --filter 'a b' 2>&1 | tee out.log",
      "echo $(git rev-parse HEAD) `date`",
      "   ",
      "",
    ]) {
      expect(tokenizeShellCommand(line).map((token) => token.text).join("")).toBe(line);
    }
  });

  test("names each program and flags what can destroy work", () => {
    expect(kinds("cd app && rm -rf dist && git push --force origin HEAD")).toEqual([
      ["command", "cd"],
      ["operator", "&&"],
      ["command", "rm"],
      ["danger", "-rf"],
      ["operator", "&&"],
      ["command", "git"],
      ["danger", "--force"],
    ]);
    expect(kinds("git reset --hard origin/main")).toContainEqual(["danger", "--hard"]);
    expect(kinds("git branch -D old")).toContainEqual(["danger", "-D"]);
    expect(kinds("sudo rm file")).toEqual([["danger", "sudo"], ["command", "rm"]]);
  });

  test("ordinary flags, quoting, variables and comments stay calm", () => {
    expect(kinds("ls -la | grep -n x")).toEqual([
      ["command", "ls"],
      ["flag", "-la"],
      ["operator", "|"],
      ["command", "grep"],
      ["flag", "-n"],
    ]);
    // An operator inside quotes is part of the string, not a new command.
    expect(kinds(`echo "a && b"`)).toEqual([["command", "echo"], ["string", '"a && b"']]);
    expect(kinds("FOO=1 bun run $TARGET # done")).toEqual([
      ["variable", "FOO=1"],
      ["command", "bun"],
      ["variable", "$TARGET"],
      ["comment", "# done"],
    ]);
    // `git commit -f`-style flags elsewhere are not alarming; `--force` only
    // is for commands where it rewrites or deletes.
    expect(kinds("git fetch --force")).toContainEqual(["flag", "--force"]);
  });
});

describe("latest thought", () => {
  test("is the newest paragraph as plain text, cut on a word", () => {
    expect(summarizeTurnThought("**Planning**\n\nI will check the mock setup first.")).toBe(
      "I will check the mock setup first.",
    );
    expect(summarizeTurnThought("## Next\n\n**Look at** `tests/a.ts`")).toBe("Look at tests/a.ts");
    expect(summarizeTurnThought("   \n\n  ")).toBeNull();
    const long = summarizeTurnThought(`${"word ".repeat(100)}end`) ?? "";
    expect(long.length).toBeLessThanOrEqual(TURN_THOUGHT_MAX_CHARS + 1);
    expect(long.endsWith("word…")).toBe(true);
  });

  test("comes only from the streaming reply's newest thinking part", () => {
    const message = (patch: Partial<ChatMessage>): ChatMessage =>
      ({ id: "m", role: "assistant", model: "x", providerId: "claude-code", content: "", parts: [], ...patch }) as ChatMessage;
    const streaming = message({
      isStreaming: true,
      parts: [
        { type: "thinking", text: "old idea", isStreaming: false },
        { type: "tool_use", toolName: "Read", input: "{}", state: "output-available" },
        { type: "thinking", text: "new idea", isStreaming: true },
        { type: "text", text: "answer so far" },
      ],
    });
    expect(selectLatestTurnThought([streaming])).toBe("new idea");
    expect(selectLatestTurnThought([{ ...streaming, isStreaming: false }])).toBeNull();
    expect(selectLatestTurnThought([message({ isStreaming: true, parts: [{ type: "text", text: "hi" }] })])).toBeNull();
    expect(selectLatestTurnThought(undefined)).toBeNull();
  });
});

describe("tool output images", () => {
  const reference = buildToolImageReferenceText({ imageId: IMAGE_ID, mimeType: "image/png", width: 3, height: 2 });

  test("a Claude result keeps only text, so the reference alone is the output", () => {
    expect(parseToolOutputImages(reference)).toEqual({
      images: [{ kind: "stored", imageId: IMAGE_ID, mimeType: "image/png", width: 3, height: 2 }],
      text: "",
    });
    const withText = parseToolOutputImages(`${reference}\nCaptured the header.`);
    expect(withText.images).toHaveLength(1);
    expect(withText.text).toBe("Captured the header.");
  });

  test("a Codex result shows the stored copy once and none of the base64", () => {
    const codex = JSON.stringify({
      content: [
        { type: "text", text: reference },
        { type: "image", data: PNG, mimeType: "image/png" },
      ],
    });
    expect(parseToolOutputImages(codex)).toEqual({
      images: [{ kind: "stored", imageId: IMAGE_ID, mimeType: "image/png", width: 3, height: 2 }],
      text: "",
    });
    // Cut at the provider's limit: the escaped reference still comes first.
    const truncated = parseToolOutputImages(codex.slice(0, codex.length - 40));
    expect(truncated.images.map((image) => image.kind)).toEqual(["stored"]);
    expect(truncated.text).toBe("");
  });

  test("a third-party image the provider kept whole is shown inline", () => {
    const parsed = parseToolOutputImages(
      JSON.stringify({ content: [{ type: "text", text: "frame" }, { type: "image", data: PNG, mimeType: "image/png" }] }),
    );
    expect(parsed.text).toBe("frame");
    expect(parsed.images).toEqual([{ kind: "inline", mimeType: "image/png", dataUrl: `data:image/png;base64,${PNG}` }]);
  });

  test("leaves ordinary output and malformed references alone", () => {
    expect(parseToolOutputImages("plain output")).toEqual({ images: [], text: "plain output" });
    const bad = JSON.stringify({ staveToolImage: { imageId: "../../etc", mimeType: "image/png" } });
    expect(parseToolOutputImages(bad).images).toEqual([]);
    const svg = JSON.stringify({ content: [{ type: "image", data: PNG, mimeType: "image/svg+xml" }] });
    expect(parseToolOutputImages(svg).images).toEqual([]);
  });

  test("reads a PNG's size from its header", () => {
    expect(readPngSize(PNG)).toEqual({ width: 3, height: 2 });
    expect(readPngSize("not a png at all, just text that is long")).toBeNull();
  });
});

describe("tool image store", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "stave-tool-images-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("saves, reads back, and removes a workspace's images only", async () => {
    const store = createToolImageStore({ rootDir: () => root });
    const kept = await store.save({ workspaceId: "other", mimeType: "image/png", base64: PNG });
    const saved = await store.save({ workspaceId: "w", mimeType: "image/png", base64: PNG });
    expect(saved).toMatchObject({ mimeType: "image/png", width: 3, height: 2 });
    expect((await store.read(saved.imageId))?.base64).toBe(PNG);
    expect(await store.read("../../etc/passwd")).toBeNull();
    await store.removeWorkspace("w");
    expect(await store.read(saved.imageId)).toBeNull();
    expect(await store.read(kept.imageId)).not.toBeNull();
  });

  test("refuses an empty image", async () => {
    const store = createToolImageStore({ rootDir: () => root });
    expect(store.save({ workspaceId: "w", mimeType: "image/png", base64: "" })).rejects.toThrow();
  });
});

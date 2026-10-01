import { expect, test } from "bun:test";
import path from "node:path";
import { streamCursorWithAcp } from "../electron/providers/cursor/cursor-acp-profile";
import { streamKiroWithAcp } from "../electron/providers/kiro/kiro-acp-profile";

for (const providerId of ["cursor", "kiro"] as const) {
  test(`${providerId} Agent prefix follows actual fresh session after failed resume, including canonical input`, async () => {
    const observed: string[] = [];
    let acknowledged = 0;
    const args = {
      providerId, prompt: "Raw user input", cwd: import.meta.dir,
      runtimeOptions: {
        model: "auto", [`${providerId}BinaryPath`]: process.execPath,
        [`${providerId}ResumeSessionId`]: "missing-session",
      },
      acpArgsForTest: [path.join(import.meta.dir, "fixtures", `fake-${providerId}-acp-agent.ts`), "echo-session-resume-failure"],
      prepareTaskAgentPrompt: (nativeSessionId: string, resumed: boolean) => {
        expect(resumed).toBe(false);
        observed.push(nativeSessionId); return "Saved Agent instructions";
      },
      acknowledgeTaskAgentPrompt: () => { acknowledged += 1; },
      conversation: {
        target: { providerId, model: "auto" }, mode: "chat" as const, history: [], contextParts: [],
        input: { role: "user" as const, providerId: "user" as const, content: "Canonical user input",
          parts: [{ type: "text" as const, text: "Canonical user input" }] },
      },
    };
    const events = await (providerId === "cursor" ? streamCursorWithAcp : streamKiroWithAcp)(args);
    expect(observed).toEqual([`${providerId}-fixture-session`]);
    const text = events.filter((event) => event.type === "text").map((event) => event.text).join("");
    expect(text).toContain("Saved Agent instructions");
    expect(text).toContain("Canonical user input");
    expect(text).not.toContain("Raw user input");
    expect(text.match(/Saved Agent instructions/g)).toHaveLength(1);
    expect(acknowledged).toBe(1);
  });
}

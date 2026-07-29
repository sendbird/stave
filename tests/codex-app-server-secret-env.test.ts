import { describe, expect, test } from "bun:test";
import {
  buildCodexThreadResumeParams,
  buildCodexThreadStartParams,
} from "../electron/providers/codex-app-server-params";

/**
 * Regression guard for the resume-drop bug: caller `configOverrides` (used for
 * MCP isolation and injected-secret shell env) must be forwarded on BOTH the
 * fresh-start and resume paths. Previously the resume path accepted no
 * `configOverrides`, silently discarding them whenever a thread resumed.
 */
describe("Codex config-override forwarding", () => {
  const secretOverride = {
    "shell_environment_policy.set.OPENAI_API_KEY": "sk-injected",
  };

  test("thread/start forwards config overrides", () => {
    const params = buildCodexThreadStartParams({
      cwd: "/tmp/project",
      configOverrides: secretOverride,
    });
    expect(params.config?.["shell_environment_policy.set.OPENAI_API_KEY"]).toBe(
      "sk-injected",
    );
  });

  test("thread/resume forwards config overrides", () => {
    const params = buildCodexThreadResumeParams({
      threadId: "thread-123",
      cwd: "/tmp/project",
      configOverrides: secretOverride,
    });
    expect(params.threadId).toBe("thread-123");
    expect(params.config?.["shell_environment_policy.set.OPENAI_API_KEY"]).toBe(
      "sk-injected",
    );
  });

  test("thread/resume without overrides omits the secret key", () => {
    const params = buildCodexThreadResumeParams({
      threadId: "thread-123",
      cwd: "/tmp/project",
    });
    expect(
      params.config?.["shell_environment_policy.set.OPENAI_API_KEY"],
    ).toBeUndefined();
  });
});

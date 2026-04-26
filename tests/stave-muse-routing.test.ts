import { describe, expect, test } from "bun:test";
import {
  DEFAULT_STAVE_MUSE_ROUTING_DECISION,
  isStaveMuseExplicitTaskRequest,
  parseStaveMuseRoutingDecision,
  resolveStaveMuseFastPathDecision,
} from "@/lib/stave-muse-routing";

describe("parseStaveMuseRoutingDecision", () => {
  test("parses plain JSON responses", () => {
    expect(parseStaveMuseRoutingDecision('{"mode":"planner","reason":"settings flow"}')).toEqual({
      mode: "planner",
      reason: "settings flow",
    });
  });

  test("parses fenced JSON responses", () => {
    expect(parseStaveMuseRoutingDecision('```json\n{"mode":"handoff","reason":"needs code changes"}\n```')).toEqual({
      mode: "handoff",
      reason: "needs code changes",
    });
  });

  test("falls back to chat for invalid responses", () => {
    expect(parseStaveMuseRoutingDecision("not json")).toEqual(
      DEFAULT_STAVE_MUSE_ROUTING_DECISION,
    );
  });
});

describe("resolveStaveMuseFastPathDecision", () => {
  test("routes explicit task requests to handoff", () => {
    expect(resolveStaveMuseFastPathDecision({
      input: "Muse에서 타겟 드롭다운이 안 되는데 default workspace에 새 Task 열고 고쳐달라고 해",
    })).toEqual({
      mode: "handoff",
      reason: "explicit task request",
    });
  });

  test("routes connected tool workflows to chat", () => {
    expect(resolveStaveMuseFastPathDecision({
      input: "Read this Slack thread, create a Jira issue, update Confluence, and add the link to Information panel.",
    })).toEqual({
      mode: "chat",
      reason: "connected tool workflow",
    });
  });

  test("keeps code-ish connected tool workflows in chat when they are not about Stave internals", () => {
    expect(resolveStaveMuseFastPathDecision({
      input: "Read this Slack thread and create a Jira issue for the DB migration.",
    })).toEqual({
      mode: "chat",
      reason: "connected tool workflow",
    });
  });

  test("routes planning requests to planner", () => {
    expect(resolveStaveMuseFastPathDecision({
      input: "Muse workflow planning strategy만 잡아줘",
    })).toEqual({
      mode: "planner",
      reason: "planning request",
    });
  });

  test("routes Stave repository inspection to handoff", () => {
    expect(resolveStaveMuseFastPathDecision({
      input: "Investigate the Stave sidebar bug in the repository and debug it.",
    })).toEqual({
      mode: "handoff",
      reason: "stave implementation work",
    });
  });
});

describe("isStaveMuseExplicitTaskRequest", () => {
  test("detects korean and english task handoff phrasing", () => {
    expect(isStaveMuseExplicitTaskRequest("새 Task 열고 고쳐달라고 해")).toBe(true);
    expect(isStaveMuseExplicitTaskRequest("open a new task for this")).toBe(true);
    expect(isStaveMuseExplicitTaskRequest("just explain the settings panel")).toBe(false);
  });
});

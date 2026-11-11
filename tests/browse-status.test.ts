import { expect, test } from "bun:test";
import { parseBrowseStatus } from "../src/lib/browse-status";

test("reads connected browsers from extension, strips unrelated data", () => {
  expect(parseBrowseStatus(JSON.stringify({ relay: { running: true, version: "1" }, extension: { browsers: [
    { id: "chrome-laptop", name: "Chrome on laptop", connected: true, tabs: 3 },
    { id: "offline", name: "Offline", connected: false },
    { id: 2, name: "Malformed", connected: true },
  ] }, targets: [{ url: "private-page" }] }))).toEqual({ installed: true, relay: "running", browsers: [{ id: "chrome-laptop", name: "Chrome on laptop" }] });
});
test("handles stopped relay, older status, and malformed output", () => {
  expect(parseBrowseStatus('{"relay":{"running":false},"extension":null}')).toEqual({ installed: true, relay: "stopped", browsers: [] });
  expect(parseBrowseStatus('{"relay":{"running":true},"extension":{"connected":true}}').browsers).toEqual([]);
  for (const output of ["", "not json", "null", '{"relay":{"running":"true"}}']) expect(parseBrowseStatus(output).error).toBe("invalid-status");
});

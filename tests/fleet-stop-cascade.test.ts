import { afterEach, beforeEach, expect, test } from "bun:test";
import { useAppStore } from "../src/store/app.store";
import { registerAgentRunBridge } from "../src/store/agent-run-send";
const initial = useAppStore.getState();
const originalWindow = globalThis.window;
let calls: string[];
let release: () => void;
beforeEach(() => {
  calls = [];
  useAppStore.setState({ activeWorkspaceId: "ws", taskWorkspaceIdById: { parent: "ws" }, tasks: [{ id: "parent", title: "Parent", provider: "codex", unread: false, updatedAt: "now" }], messagesByTask: {}, activeTurnIdsByTask: { parent: "old" } });
  globalThis.window = { api: { provider: {
    abortTurn: async ({turnId}: {turnId:string}) => { calls.push(`abort:${turnId}`); },
    cleanupTask: async () => {},
  }, taskControl: { stopChildren: async () => { calls.push("children"); await new Promise<void>(resolve => { release = resolve; }); return {ok:true,stopped:1,skipped:[]}; } } } } as unknown as Window & typeof globalThis;
});
afterEach(() => { registerAgentRunBridge(null); useAppStore.setState(initial, true); globalThis.window = originalWindow; });
test("internal stall recovery aborts synchronously without cascading or touching the next turn", async () => {
  const stopped = useAppStore.getState().abortTaskTurn({taskId:"parent"});
  expect(calls).toEqual(["abort:old"]);
  expect(useAppStore.getState().activeTurnIdsByTask.parent).toBeUndefined();
  useAppStore.setState({activeTurnIdsByTask:{parent:"new"}});
  release?.(); await stopped;
  expect(calls).toEqual(["abort:old"]);
  expect(useAppStore.getState().activeTurnIdsByTask.parent).toBe("new");
});
test("user stop ends the parent before descendants and never rereads a newer turn", async () => {
  const stopped = useAppStore.getState().abortTaskTurn({taskId:"parent", cascade:true});
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(calls).toEqual(["abort:old","children"]);
  expect(useAppStore.getState().activeTurnIdsByTask.parent).toBeUndefined();
  useAppStore.setState({activeTurnIdsByTask:{parent:"new"}});
  release(); await stopped;
  expect(calls).toEqual(["abort:old","children"]);
  expect(useAppStore.getState().activeTurnIdsByTask.parent).toBe("new");
});
test("deferred run cancellation cannot interrupt a replacement turn", async () => {
  let finish!: () => void;
  registerAgentRunBridge({activeAgentRun:()=>({id:"run",agentOrigin:true}),cancel:async()=>{await new Promise<void>(resolve=>{finish=resolve;});return {ok:true} as never;},start:async()=>{throw Error("unexpected");},watchFirstPrompt:()=>{}});
  const stopped = useAppStore.getState().abortTaskTurn({taskId:"parent",cascade:true});
  await new Promise(resolve=>setTimeout(resolve,0));
  useAppStore.setState({activeTurnIdsByTask:{parent:"new"}});
  finish(); await stopped;
  expect(calls).toEqual([]);
  expect(useAppStore.getState().activeTurnIdsByTask.parent).toBe("new");
});

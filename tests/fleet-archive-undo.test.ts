import { afterEach, expect, test } from "bun:test";
import { useAppStore } from "../src/store/app.store";
import { archiveFleetTask, fleetArchiveVersion } from "../src/lib/fleet/archive-client";
const original = useAppStore.getState();
const originalWindow = globalThis.window;
afterEach(() => {useAppStore.setState(original, true); globalThis.window=originalWindow;});
test("archive undo restores only the version this action archived", async () => {
  useAppStore.setState({ repositoryPath: "/tmp/project", activeWorkspaceId: "workspace", activeTaskId:"task", activeSurface:{kind:"task",taskId:"task"}, openTaskTabIds:["task"], tasks: [{id:"task", title:"Task", controlMode:"interactive", controlOwner:"stave", provider:"codex", unread:false, updatedAt:"now"}],
    archiveTask: ({taskId}) => useAppStore.setState((state) => ({tasks: state.tasks.map((task) => task.id === taskId ? {...task, archivedAt:"2026-11-16T00:00:00Z"} : task)})),
    restoreTask: ({taskId}) => useAppStore.setState((state) => ({tasks:state.tasks.map((task) => task.id === taskId ? {...task,archivedAt:null} : task)})) });
  globalThis.window = {api:{taskControl:{archive:async ({restore,expectedArchivedAt}: {restore?:boolean;expectedArchivedAt?:string})=>{
    const task=useAppStore.getState().tasks[0]!;
    if (restore && task.archivedAt !== expectedArchivedAt) return {ok:false,reason:"changed"};
    return {ok:true,archivedAt:restore?null:"2026-11-16T00:00:00Z"};
  }}}} as unknown as Window & typeof globalThis;
  const target={repositoryPath:"/tmp/project",workspaceId:"workspace",taskId:"task"};
  expect(await archiveFleetTask(target)).toBeNull();
  expect(useAppStore.getState().openTaskTabIds).toEqual([]);
  expect(useAppStore.getState().activeTaskId).toBe("");
  const version=fleetArchiveVersion(target);
  expect(await archiveFleetTask(target,true,version)).toBeNull();
  expect(useAppStore.getState().tasks[0]?.archivedAt).toBeNull();
  await archiveFleetTask(target);
  useAppStore.setState((state)=>({tasks:state.tasks.map((task)=>({...task,archivedAt:"2026-11-17T00:00:00Z"}))}));
  expect(await archiveFleetTask(target,true,version)).toBe("changed");
  expect(useAppStore.getState().tasks[0]?.archivedAt).toBe("2026-11-17T00:00:00Z");
});

test("addressed archive and undo never switch the visible workspace or repository", async () => {
  const calls: unknown[] = [];
  useAppStore.setState({activeWorkspaceId:"visible",repositoryPath:"/tmp/visible",openRepository:async()=>{throw Error("must not switch");},switchWorkspace:async()=>{throw Error("must not switch");}});
  globalThis.window={api:{taskControl:{archive:async(args:unknown)=>{calls.push(args);return {ok:true,archivedAt:"saved"};}}}} as unknown as Window & typeof globalThis;
  const target={workspaceId:"cold",repositoryPath:"/tmp/cold",taskId:"task"};
  expect(await archiveFleetTask(target)).toBeNull();
  expect(await archiveFleetTask(target,true,"saved")).toBeNull();
  expect(calls).toHaveLength(2);
  expect(useAppStore.getState().activeWorkspaceId).toBe("visible");
  expect(useAppStore.getState().repositoryPath).toBe("/tmp/visible");
});

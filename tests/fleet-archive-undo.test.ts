import { afterEach, expect, test } from "bun:test";
import { useAppStore } from "../src/store/app.store";
import { archiveFleetTask, fleetArchiveVersion } from "../src/lib/fleet/archive-client";
const original = useAppStore.getState();
afterEach(() => useAppStore.setState(original, true));
test("archive undo restores only the version this action archived", async () => {
  useAppStore.setState({ repositoryPath: "/tmp/project", activeWorkspaceId: "workspace", tasks: [{id:"task", title:"Task", controlMode:"interactive", controlOwner:"stave", provider:"codex", unread:false, updatedAt:"now"}],
    archiveTask: ({taskId}) => useAppStore.setState((state) => ({tasks: state.tasks.map((task) => task.id === taskId ? {...task, archivedAt:"2026-11-16T00:00:00Z"} : task)})),
    restoreTask: ({taskId}) => useAppStore.setState((state) => ({tasks:state.tasks.map((task) => task.id === taskId ? {...task,archivedAt:null} : task)})) });
  const target={repositoryPath:"/tmp/project",workspaceId:"workspace",taskId:"task"};
  expect(await archiveFleetTask(target)).toBeNull();
  const version=fleetArchiveVersion(target);
  expect(await archiveFleetTask(target,true,version)).toBeNull();
  expect(useAppStore.getState().tasks[0]?.archivedAt).toBeNull();
  await archiveFleetTask(target);
  useAppStore.setState((state)=>({tasks:state.tasks.map((task)=>({...task,archivedAt:"2026-11-17T00:00:00Z"}))}));
  expect(await archiveFleetTask(target,true,version)).toBe("changed");
  expect(useAppStore.getState().tasks[0]?.archivedAt).toBe("2026-11-17T00:00:00Z");
});

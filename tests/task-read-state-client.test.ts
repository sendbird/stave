import { afterEach, beforeEach, expect, test } from "bun:test";
import { listTaskReadStates, setTaskReadState, setTaskReadStates, isTaskAutoReadSuppressed, resetTaskAutoReadSuppression, watchTaskRead } from "../src/lib/task-read-state-client";
import type { AppNotification } from "../src/lib/notifications/notification.types";
import { useAppStore } from "../src/store/app.store";
import { invalidateResultReviews, setResultReviewed } from "../src/lib/reviews/result-review-client";
const originalWindow = globalThis.window;
const target = {workspaceId:"workspace",taskId:"task"};
beforeEach(() => {
  const values = new Map<string,string>();
  Object.assign(globalThis,{window:{api:undefined,localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}}});
  useAppStore.setState({notifications:[]});
  invalidateResultReviews(); resetTaskAutoReadSuppression(target);
});
afterEach(() => { Object.assign(globalThis,{window:originalWindow}); });
test("browser manual unread persists without outputs and read clears it", async () => {
  expect((await setTaskReadState({...target,read:false})).unread).toBe(true);
  expect(isTaskAutoReadSuppressed(target)).toBe(true);
  expect((await listTaskReadStates({targets:[target]}))[0]?.unread).toBe(true);
  expect((await setTaskReadState({...target,read:true})).unread).toBe(false);
});
test("browser task read and result read use the same output mark", async () => {
  const result = {id:"result",repositoryPath:"/tmp/project",repositoryName:"Project",...target,workspaceName:"Workspace",taskTitle:"Task",turnId:"turn",outcome:"completed",summary:"Done",createdAt:"2026-11-01T00:00:00Z",reviewedAt:null};
  window.localStorage.setItem("stave:result-reviews:v1",JSON.stringify([result]));
  expect((await setTaskReadState({...target,read:true})).unread).toBe(false);
  expect((await setTaskReadState({...target,read:false})).unread).toBe(true);
  await setResultReviewed({repositoryPath:"/tmp/project",...target,turnId:"turn",reviewed:true});
  expect((await listTaskReadStates({targets:[target]}))[0]?.unread).toBe(false);
});
test("desktop missing bridge fails without touching browser persistence", async () => {
  Object.assign(window,{api:{persistence:{}}});
  await expect(setTaskReadState({...target,read:false})).rejects.toThrow("unavailable");
  expect(window.localStorage.getItem("stave:task-read-marks:v1")).toBeNull();
});
test("manual unread suppresses automatic acknowledgement before its pending write returns", async () => {
  let finish!: (response: unknown) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  Object.assign(window,{api:{persistence:{setTaskReadStates:()=>pending}}});
  const write = setTaskReadState({...target,read:false});
  expect(isTaskAutoReadSuppressed(target)).toBe(true);
  finish({ok:true,states:[{...target,unread:true}],notifications:[]});
  await write;
});

const flush = async () => { for (let index = 0; index < 5; index++) await Promise.resolve(); };
function notification(overrides: Partial<AppNotification>): AppNotification {
  return {id:"n",kind:"task.turn_completed",title:"Result",body:"Done",repositoryPath:"/tmp/project",repositoryName:"Project",workspaceId:"workspace",workspaceName:"Workspace",taskId:"task",taskTitle:"Task",turnId:"turn",providerId:null,action:null,payload:{},createdAt:"2026-11-01T00:00:00Z",readAt:null,...overrides};
}
test("only a relevant notification change re-queries, and only for its task", async () => {
  const calls: string[][] = [];
  Object.assign(window,{api:{persistence:{listTaskReadStates:async ({targets}:{targets:Array<{workspaceId:string;taskId:string}>}) => {
    calls.push(targets.map(item => item.taskId));
    return {ok:true,states:targets.map(item => ({...item,unread:false}))};
  }}}});
  const stops = [watchTaskRead(target),watchTaskRead({workspaceId:"workspace",taskId:"other"})];
  await flush();
  expect(calls).toEqual([["task","other"]]);
  const unrelated = [notification({id:"elsewhere",taskId:"elsewhere",kind:"task.approval_requested"}),notification({id:"agent",kind:"agent_run.completed"})];
  useAppStore.setState({notifications:unrelated});
  useAppStore.setState({notifications:[...unrelated]});
  await flush();
  expect(calls).toHaveLength(1);
  useAppStore.setState({notifications:[...unrelated,notification({id:"approval",kind:"task.approval_requested"})]});
  await flush();
  expect(calls).toEqual([["task","other"],["task"]]);
  stops.forEach(stop => stop());
});
test("bulk read is one write, needs no re-query and moves the bell count", async () => {
  const writes: unknown[] = []; let lists = 0;
  Object.assign(window,{api:{persistence:{
    listTaskReadStates:async ({targets}:{targets:Array<{workspaceId:string;taskId:string}>}) => { lists++; return {ok:true,states:targets.map(item => ({...item,unread:true}))}; },
    setTaskReadStates:async (args:{targets:Array<{workspaceId:string;taskId:string}>}) => { writes.push(args); return {ok:true,states:args.targets.map(item => ({...item,unread:false})),notifications:[{id:"done",readAt:"2026-11-02T00:00:00Z",expiresAt:"2026-11-09T00:00:00Z"}]}; },
  }}});
  useAppStore.setState({notifications:[notification({id:"done"})]});
  const stop = watchTaskRead(target);
  await flush(); lists = 0;
  const targets = [target,{workspaceId:"workspace",taskId:"b"},{workspaceId:"other",taskId:"c"}];
  const states = await setTaskReadStates({targets,read:true});
  await flush();
  expect(states.map(state => state.unread)).toEqual([false,false,false]);
  expect(writes).toHaveLength(1);
  expect(lists).toBe(0);
  expect(useAppStore.getState().notifications[0]).toMatchObject({id:"done",readAt:"2026-11-02T00:00:00Z",expiresAt:"2026-11-09T00:00:00Z"});
  stop();
});

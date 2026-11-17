import { afterEach, beforeEach, expect, test } from "bun:test";
import { listTaskReadStates, setTaskReadState, isTaskAutoReadSuppressed, resetTaskAutoReadSuppression } from "../src/lib/task-read-state-client";
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
  Object.assign(window,{api:{persistence:{setTaskReadState:()=>pending}}});
  const write = setTaskReadState({...target,read:false});
  expect(isTaskAutoReadSuppressed(target)).toBe(true);
  finish({ok:true,state:{...target,unread:true}});
  await write;
});

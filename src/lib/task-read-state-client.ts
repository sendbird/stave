import { useEffect, useSyncExternalStore } from "react";
import { useAppStore } from "@/store/app.store";
import { invalidateResultReviews, listResultReviews, setResultReviewed, subscribeResultReviews } from "@/lib/reviews/result-review-client";
import { ListTaskReadStatesArgsSchema, SetTaskReadStateArgsSchema, TaskReadStateResponseSchema, TaskReadStatesResponseSchema, taskReadKey, type SetTaskReadStateArgs, type TaskReadState, type TaskReadTarget } from "./task-read-state";

const STORAGE_KEY = "stave:task-read-marks:v1";
const listeners = new Set<() => void>();
const targets = new Map<string, TaskReadTarget>();
const subscriptions = new Map<string, number>();
const cache = new Map<string, boolean>();
const autoReadSuppressed = new Set<string>();
export const isTaskAutoReadSuppressed = (target: TaskReadTarget) => autoReadSuppressed.has(taskReadKey(target));
export const resetTaskAutoReadSuppression = (target: TaskReadTarget) => autoReadSuppressed.delete(taskReadKey(target));

let queued = false;
let generation = 0;
const emit = () => listeners.forEach(listener => listener());
function manualMarks(): Record<string, boolean> {
  const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid task read marks");
  const marks: Record<string, boolean> = {};
  for (const [key,value] of Object.entries(raw)) {
    if (typeof value !== "boolean") throw new Error("Invalid task read mark");
    marks[key] = value;
  }
  return marks;
}
const ATTENTION_KINDS = new Set(["task.approval_requested","task.user_input_requested","agent_run.sign_off_requested","agent_run.blocked","agent_run.stuck"]);
async function browserState(target: TaskReadTarget): Promise<TaskReadState> {
  const latest = (await listResultReviews({workspaceId:target.workspaceId,taskId:target.taskId,latestPerTask:true,includeEvidence:false,limit:1})).results[0];
  const attention = useAppStore.getState().notifications.some(item => item.workspaceId === target.workspaceId && item.taskId === target.taskId && ATTENTION_KINDS.has(item.kind) && !item.readAt && !item.resolvedAt);
  return {workspaceId:target.workspaceId,taskId:target.taskId,unread:Boolean((latest && !latest.reviewedAt) || attention || (!latest && manualMarks()[taskReadKey(target)]))};
}
export async function listTaskReadStates(input: {targets: TaskReadTarget[]}): Promise<TaskReadState[]> {
  const args = ListTaskReadStatesArgsSchema.parse(input);
  if (window.api?.persistence) {
    if (!window.api.persistence.listTaskReadStates) throw new Error("Task read storage is unavailable");
    const response = TaskReadStatesResponseSchema.parse(await window.api.persistence.listTaskReadStates(args));
    if (!response.ok) throw new Error("Task read states could not be loaded");
    return response.states;
  }
  return Promise.all(args.targets.map(browserState));
}
export async function setTaskReadState(input: SetTaskReadStateArgs): Promise<TaskReadState> {
  const args = SetTaskReadStateArgsSchema.parse(input);
  // User intent wins immediately, including while persistence is still pending.
  if (!args.read) autoReadSuppressed.add(taskReadKey(args));
  if (args.attentionOnly && isTaskAutoReadSuppressed(args)) return (await listTaskReadStates({targets:[{workspaceId:args.workspaceId,taskId:args.taskId}]}))[0]!;
  let state: TaskReadState;
  if (window.api?.persistence) {
    if (!window.api.persistence.setTaskReadState) throw new Error("Task read storage is unavailable");
    const response = TaskReadStateResponseSchema.parse(await window.api.persistence.setTaskReadState(args));
    if (!response.ok || !response.state) throw new Error("Task read state was not saved");
    state = response.state;
  } else {
    const latest = (await listResultReviews({workspaceId:args.workspaceId,taskId:args.taskId,latestPerTask:true,includeEvidence:false,limit:1})).results[0];
    if (args.attentionOnly && isTaskAutoReadSuppressed(args)) return browserState(args);
    if (latest && !args.attentionOnly) await setResultReviewed({repositoryPath:latest.repositoryPath,workspaceId:latest.workspaceId,taskId:latest.taskId,turnId:latest.turnId,reviewed:args.read});
    const marks = manualMarks();
    const key = taskReadKey(args);
    if (args.read) delete marks[key]; else marks[key] = true;
    window.localStorage.setItem(STORAGE_KEY,JSON.stringify(marks));
    if (args.read) {
      for (const item of useAppStore.getState().notifications) {
        if (item.workspaceId === args.workspaceId && item.taskId === args.taskId && ATTENTION_KINDS.has(item.kind) && !item.readAt) {
          await useAppStore.getState().markNotificationRead({id:item.id});
        }
      }
    }
    state = await browserState(args);
  }
  if (window.api?.persistence) {
    const now = new Date().toISOString();
    useAppStore.setState(current => {
      let changed = false;
      const notifications = current.notifications.map(item => {
        if (item.workspaceId !== args.workspaceId || item.taskId !== args.taskId || !ATTENTION_KINDS.has(item.kind) || item.resolvedAt || Boolean(item.readAt) === args.read) return item;
        changed = true;
        return {...item,readAt:args.read ? now : null};
      });
      return changed ? {notifications} : {};
    });
  }
  generation++;
  cache.set(taskReadKey(args),state.unread);
  invalidateResultReviews();
  emit();
  return state;
}
function refresh() {
  if (queued) return;
  queued = true;
  queueMicrotask(async () => {
    queued = false;
    const pass = generation;
    const all = [...targets.values()];
    try {
      const states: TaskReadState[] = [];
      for (let offset=0; offset<all.length; offset+=500) states.push(...await listTaskReadStates({targets:all.slice(offset,offset+500)}));
      if (pass !== generation) { refresh(); return; }
      let changed = false;
      for (const state of states) {
        const key = taskReadKey(state);
        if (cache.get(key) !== state.unread) { cache.set(key,state.unread); changed = true; }
      }
      if (changed) emit();
    } catch (error) { console.warn("[task-read] refresh failed",error); }
  });
}
subscribeResultReviews(refresh);
useAppStore.subscribe((state,previous) => { if (state.notifications !== previous.notifications) refresh(); });
/** Row-local primitive snapshots; reads batch across every mounted surface. */
export function useTaskUnread(workspaceId: string, taskId: string): boolean {
  const key = taskReadKey({workspaceId,taskId});
  useEffect(() => {
    if (!workspaceId || !taskId) return;
    subscriptions.set(key,(subscriptions.get(key) ?? 0)+1);
    targets.set(key,{workspaceId,taskId}); refresh();
    return () => {
      const count = (subscriptions.get(key) ?? 1)-1;
      if (count) subscriptions.set(key,count); else { subscriptions.delete(key); targets.delete(key); }
    };
  },[key,workspaceId,taskId]);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },() => cache.get(key) ?? false,() => false);
}

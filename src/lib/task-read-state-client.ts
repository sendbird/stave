import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useAppStore } from "@/store/app.store";
import { invalidateResultReviews, listResultReviews, setResultReviewed, subscribeResultReviews } from "@/lib/reviews/result-review-client";
import {
  buildNotificationExpiresAt,
  isNotificationAttentionKind,
  isTaskCompletionNotificationKind,
  isTaskReadAttentionKind,
  type AppNotification,
} from "@/lib/notifications/notification.types";
import {
  ListTaskReadStatesArgsSchema,
  SetTaskReadStateArgsSchema,
  SetTaskReadStatesArgsSchema,
  SetTaskReadStatesResponseSchema,
  TASK_READ_BATCH_LIMIT,
  TaskReadStatesResponseSchema,
  taskReadKey,
  type SetTaskReadStateArgs,
  type SetTaskReadStatesArgs,
  type TaskReadNotificationChange,
  type TaskReadState,
  type TaskReadTarget,
} from "./task-read-state";

const STORAGE_KEY = "stave:task-read-marks:v1";
const listeners = new Set<() => void>();
const targets = new Map<string, TaskReadTarget>();
const subscriptions = new Map<string, number>();
const cache = new Map<string, boolean>();
const autoReadSuppressed = new Set<string>();
export const isTaskAutoReadSuppressed = (target: TaskReadTarget) => autoReadSuppressed.has(taskReadKey(target));
export const resetTaskAutoReadSuppression = (target: TaskReadTarget) => autoReadSuppressed.delete(taskReadKey(target));

/** Keys waiting for a read; `all` after a result-review change of unknown scope. */
let pending: Set<string> | "all" | null = null;
let generation = 0;
/** Set while this module writes, so its own echo does not cost another read. */
let ownWrite = false;
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
const isReadStateNotification = (item: AppNotification) =>
  Boolean(item.workspaceId && item.taskId) && (isTaskReadAttentionKind(item.kind) || isTaskCompletionNotificationKind(item.kind));
async function browserState(target: TaskReadTarget): Promise<TaskReadState> {
  const latest = (await listResultReviews({workspaceId:target.workspaceId,taskId:target.taskId,latestPerTask:true,includeEvidence:false,limit:1})).results[0];
  const attention = useAppStore.getState().notifications.some(item => item.workspaceId === target.workspaceId && item.taskId === target.taskId && isTaskReadAttentionKind(item.kind) && !item.readAt && !item.resolvedAt);
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

/** The browser build mirrors the desktop write: same marks, same notifications. */
async function setBrowserTaskReadStates(args: SetTaskReadStatesArgs): Promise<TaskReadNotificationChange[]> {
  const now = new Date().toISOString();
  const expiresAt = buildNotificationExpiresAt({readAt:now});
  const marks = manualMarks();
  const changes: TaskReadNotificationChange[] = [];
  for (const target of args.targets) {
    const latest = (await listResultReviews({workspaceId:target.workspaceId,taskId:target.taskId,latestPerTask:true,includeEvidence:false,limit:1})).results[0];
    if (args.attentionOnly && args.read && isTaskAutoReadSuppressed(target)) continue;
    if (latest && !args.attentionOnly) await setResultReviewed({repositoryPath:latest.repositoryPath,workspaceId:latest.workspaceId,taskId:latest.taskId,turnId:latest.turnId,reviewed:args.read});
    const key = taskReadKey(target);
    if (args.read) delete marks[key]; else marks[key] = true;
    for (const item of useAppStore.getState().notifications) {
      if (item.workspaceId !== target.workspaceId || item.taskId !== target.taskId) continue;
      const attention = isTaskReadAttentionKind(item.kind) && !item.resolvedAt;
      const completion = isTaskCompletionNotificationKind(item.kind);
      if (args.read && !item.readAt && (attention || (completion && !args.attentionOnly))) {
        changes.push({id:item.id,readAt:now,expiresAt:isNotificationAttentionKind(item.kind) && !item.resolvedAt ? null : item.expiresAt ?? expiresAt});
      } else if (!args.read && (item.readAt || item.expiresAt) && (attention || (completion && latest && item.turnId === latest.turnId))) {
        changes.push({id:item.id,readAt:null,expiresAt:null});
      }
    }
  }
  window.localStorage.setItem(STORAGE_KEY,JSON.stringify(marks));
  return changes;
}

function applyNotificationChanges(changes: readonly TaskReadNotificationChange[]) {
  if (!changes.length) return;
  const byId = new Map(changes.map(change => [change.id, change]));
  useAppStore.setState(current => ({
    notifications: current.notifications.map(item => {
      const change = byId.get(item.id);
      return change ? {...item,readAt:change.readAt,expiresAt:change.expiresAt} : item;
    }),
  }));
}

/**
 * Marks every target read or unread in one write. The returned states replace
 * the cache directly, so the write needs no follow-up read.
 */
export async function setTaskReadStates(input: SetTaskReadStatesArgs): Promise<TaskReadState[]> {
  const args = SetTaskReadStatesArgsSchema.parse(input);
  // User intent wins immediately, including while persistence is still pending.
  if (!args.read) for (const target of args.targets) autoReadSuppressed.add(taskReadKey(target));
  const writable = args.attentionOnly && args.read ? args.targets.filter(target => !isTaskAutoReadSuppressed(target)) : args.targets;
  if (!writable.length) return listTaskReadStates({targets:args.targets});
  let states: TaskReadState[];
  let changes: TaskReadNotificationChange[];
  if (window.api?.persistence) {
    if (!window.api.persistence.setTaskReadStates) throw new Error("Task read storage is unavailable");
    const response = SetTaskReadStatesResponseSchema.parse(await window.api.persistence.setTaskReadStates({...args,targets:writable}));
    if (!response.ok) throw new Error("Task read state was not saved");
    states = response.states;
    changes = response.notifications;
  } else {
    changes = await setBrowserTaskReadStates({...args,targets:writable});
  }
  generation++;
  ownWrite = true;
  try {
    applyNotificationChanges(changes);
    if (!window.api?.persistence) states = await Promise.all(writable.map(browserState));
    for (const state of states!) cache.set(taskReadKey(state),state.unread);
    invalidateResultReviews();
  } finally { ownWrite = false; }
  emit();
  return states!;
}
export async function setTaskReadState(input: SetTaskReadStateArgs): Promise<TaskReadState> {
  const {read,attentionOnly,...target} = SetTaskReadStateArgsSchema.parse(input);
  return (await setTaskReadStates({targets:[target],read,...(attentionOnly ? {attentionOnly} : {})}))[0]!;
}

function refresh(keys: Iterable<string> | "all") {
  const wasQueued = pending !== null;
  if (keys === "all" || pending === "all") pending = "all";
  else { pending ??= new Set(); for (const key of keys) (pending as Set<string>).add(key); }
  if (wasQueued) return;
  queueMicrotask(async () => {
    const scope = pending;
    pending = null;
    const pass = generation;
    const batch = [...targets.entries()].filter(([key]) => scope === "all" || scope?.has(key)).map(([,target]) => target);
    if (!batch.length) return;
    try {
      const states: TaskReadState[] = [];
      for (let offset=0; offset<batch.length; offset+=TASK_READ_BATCH_LIMIT) states.push(...await listTaskReadStates({targets:batch.slice(offset,offset+TASK_READ_BATCH_LIMIT)}));
      if (pass !== generation) { refresh(batch.map(taskReadKey)); return; }
      let changed = false;
      for (const state of states) {
        const key = taskReadKey(state);
        if (cache.get(key) !== state.unread) { cache.set(key,state.unread); changed = true; }
      }
      if (changed) emit();
    } catch (error) { console.warn("[task-read] refresh failed",error); }
  });
}

/** Per task, the read-relevant notification facts; any other change costs nothing. */
function notificationSignatures(notifications: readonly AppNotification[]) {
  const signatures = new Map<string, string>();
  for (const item of notifications) {
    if (!isReadStateNotification(item)) continue;
    const key = taskReadKey({workspaceId:item.workspaceId!,taskId:item.taskId!});
    signatures.set(key,`${signatures.get(key) ?? ""}|${item.id}:${item.kind}:${item.readAt ? 1 : 0}:${item.resolvedAt ? 1 : 0}`);
  }
  return signatures;
}
let lastSignatures = notificationSignatures(useAppStore.getState().notifications);
subscribeResultReviews(() => { if (!ownWrite) refresh("all"); });
useAppStore.subscribe((state,previous) => {
  if (state.notifications === previous.notifications) return;
  const next = notificationSignatures(state.notifications);
  const changed = [...new Set([...next.keys(),...lastSignatures.keys()])].filter(key => next.get(key) !== lastSignatures.get(key) && targets.has(key));
  lastSignatures = next;
  if (!ownWrite && changed.length) refresh(changed);
});

/** Keeps one task's read state loaded while anything shows it. */
export function watchTaskRead(target: TaskReadTarget): () => void {
  const key = taskReadKey(target);
  subscriptions.set(key,(subscriptions.get(key) ?? 0)+1);
  targets.set(key,target);
  refresh([key]);
  return () => {
    const count = (subscriptions.get(key) ?? 1)-1;
    if (count) subscriptions.set(key,count); else { subscriptions.delete(key); targets.delete(key); }
  };
}
/** Row-local primitive snapshots; reads batch across every mounted surface. */
export function useTaskUnread(workspaceId: string, taskId: string): boolean {
  const key = taskReadKey({workspaceId,taskId});
  useEffect(() => {
    if (!workspaceId || !taskId) return;
    return watchTaskRead({workspaceId,taskId});
  },[key,workspaceId,taskId]);
  const snapshot = () => cache.get(key) ?? false;
  return useSyncExternalStore(subscribeReadState, snapshot, snapshot);
}
const subscribeReadState = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/**
 * The unread task ids among `taskIds`, for a list that names each row's
 * unread state. The snapshot is a primitive, so unrelated updates are free.
 */
export function useUnreadTaskIds(workspaceId: string, taskIds: readonly string[]): ReadonlySet<string> {
  const idsKey = taskIds.join("\n");
  useEffect(() => {
    if (!workspaceId || !idsKey) return;
    const stops = idsKey.split("\n").map(taskId => watchTaskRead({workspaceId,taskId}));
    return () => stops.forEach(stop => stop());
  },[workspaceId,idsKey]);
  const snapshot = () => idsKey ? idsKey.split("\n").filter(taskId => cache.get(taskReadKey({workspaceId,taskId}))).join("\n") : "";
  const unread = useSyncExternalStore(subscribeReadState, snapshot, snapshot);
  return useMemo(() => new Set(unread ? unread.split("\n") : []), [unread]);
}

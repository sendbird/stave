import {expect,test} from "@playwright/test";

for (const [locale,theme] of [["en","light"],["ko","dark"]] as const) test(`archived workspace search opens retained history and restores through cleanup in ${locale}/${theme}`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto(`/tests/e2e/fixtures/conversation-time.html?pane=1&lang=${locale}&theme=${theme}`);
 const setup=await page.evaluate(async()=>{
  const store=(window as unknown as {__contentSearchFixtureStore:typeof import("@/store/app.store").useAppStore}).__contentSearchFixtureStore;
  const state=store.getState();
  const task={...state.tasks[0],archivedAt:null};
  const snapshot={activeTaskId:task.id,tasks:[task],messagesByTask:{[task.id]:state.messagesByTask[task.id]}};
  const calls:unknown[]=[];Object.assign(window,{__archiveRestoreCalls:calls});
  const registry={repositoryPath:"/fixture",repositoryName:"Fixture",lastOpenedAt:"2026-11-17",defaultBranch:"main",workspaces:[{id:"retained-workspace",name:"Retained",updatedAt:"2026-11-17"}],activeWorkspaceId:"retained-workspace",workspacePathById:{"retained-workspace":"/fixture/archive"},workspaceBranchById:{"retained-workspace":"feature"},workspaceDefaultById:{"retained-workspace":false}};
  window.api={...window.api,persistence:{...window.api?.persistence,loadWorkspaceShell:undefined,loadWorkspace:async()=>({ok:true,snapshot}),loadRepositoryRegistry:async()=>({ok:true,repositories:[registry]})},workspaceCleanup:{...window.api?.workspaceCleanup,listArchived:async()=>[{id:"retained-workspace",repositoryPath:"/fixture",repositoryName:"Fixture",name:"Retained",path:"/fixture/archive",branch:"feature",archived:true,branchOnly:false,readOnly:true,archivedAt:"2026-11-16T09:30:00.000Z",lastActive:null,blockers:[],reasons:[],bytes:null,branchDeletable:false}],act:async(args:unknown)=>{calls.push(args);return {ok:true,action:"restore",workspaceId:"retained-workspace",repositoryPath:"/fixture"};}}} as typeof window.api;
  // Exercise the restore boundary without creating a checkout in this UI fixture.
  store.setState({switchWorkspace:async({workspaceId})=>{calls.push({switchWorkspace:workspaceId});store.setState({activeWorkspaceId:workspaceId,tasks:[task]});}});
  await store.getState().focusTaskAttention({workspaceId:"retained-workspace",repositoryPath:"/fixture",taskId:task.id,workspaceArchived:true,searchQuery:"settings"});
  store.getState().createTask({title:"Blocked in retained history"});
  await store.getState().duplicateTask({taskId:task.id});
  if (store.getState().tasks.length !== 1) throw new Error("Read-only history admitted new tasks");
  return {activeWorkspaceId:store.getState().activeWorkspaceId,registered:store.getState().workspaces.some(w=>w.id==="retained-workspace"),archived:!!store.getState().tasks[0]?.archivedAt};
 });
 expect(setup).toEqual({activeWorkspaceId:"retained-workspace",registered:false,archived:true});
 const banner=page.getByTestId("archived-task-banner");
 await expect(banner).toBeVisible();
 await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
 await expect(page.getByText("Check the settings layout and keyboard navigation.",{exact:true})).toBeVisible();
 // The workspace archive record completes the line (the year appears outside 2026).
 await expect(banner).toContainText(locale==="en"?"Archived on Nov 16":"11월 16일");
 await expect(banner).toContainText(locale==="en"?"Restore to continue.":"계속하려면 복원하세요.");
 await page.evaluate(()=>document.fonts.ready);
 // Title and action share one row, as in the app's other inline notices.
 const row=await banner.evaluate(element=>{const title=element.querySelector("strong")!.getBoundingClientRect();const button=element.querySelector("button")!.getBoundingClientRect();return {overlap:Math.min(title.bottom,button.bottom)-Math.max(title.top,button.top),buttonRight:element.getBoundingClientRect().right-button.right};});
 expect(row.overlap).toBeGreaterThan(0);
 expect(row.buttonRight).toBeLessThan(24);
 await page.screenshot({path:`/tmp/orchestration-workbench/archived-view-${locale}-${theme}.png`});
 await banner.getByRole("button",{name:locale==="en"?"Restore":"복원",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {__archiveRestoreCalls:unknown[]}).__archiveRestoreCalls)).toEqual([{action:"restore",workspaceId:"retained-workspace",repositoryPath:"/fixture"},{switchWorkspace:"retained-workspace"}]);
 await expect(banner).toHaveCount(0);
});

test("archived banner without an archive record drops the date and its separator",async({page})=>{
 await page.goto('/tests/e2e/fixtures/conversation-time.html?pane=1');
 await page.evaluate(async()=>{
  const store=(window as unknown as {__contentSearchFixtureStore:typeof import("@/store/app.store").useAppStore}).__contentSearchFixtureStore;
  const task={...store.getState().tasks[0],archivedAt:null};
  const snapshot={activeTaskId:task.id,tasks:[task],messagesByTask:{[task.id]:store.getState().messagesByTask[task.id]}};
  window.api={...window.api,persistence:{...window.api?.persistence,loadWorkspaceShell:undefined,loadWorkspace:async()=>({ok:true,snapshot})},workspaceCleanup:{...window.api?.workspaceCleanup,listArchived:async()=>[]}} as typeof window.api;
  await store.getState().focusTaskAttention({workspaceId:"retained-workspace",repositoryPath:"/fixture",taskId:task.id,workspaceArchived:true,searchQuery:"settings"});
 });
 const banner=page.getByTestId("archived-task-banner");
 await expect(banner).toContainText("Archived. Restore to continue.");
 await expect(banner).not.toContainText("·");
});

for (const mode of ["stay","move","new-history"] as const) test(`workspace restore preserves original task archive flags after ${mode}`,async({page})=>{
 await page.goto('/tests/e2e/fixtures/conversation-time.html?pane=1');
 const outcome=await page.evaluate(async(mode)=>{
  const store=(window as unknown as {__contentSearchFixtureStore:typeof import("@/store/app.store").useAppStore}).__contentSearchFixtureStore;
  const {restoreArchivedSearchView}=await import('/src/store/archived-search-view.ts');
  const before=store.getState();
  const base=before.activeWorkspaceId;
  const originallyArchivedAt="2026-11-01T00:00:00.000Z";
  const originalTasks=[{...before.tasks[0],archivedAt:originallyArchivedAt},{...before.tasks[0],id:"unrelated-active",title:"Unrelated active task",archivedAt:null}];
  const snapshot={activeTaskId:originalTasks[0].id,tasks:originalTasks,messagesByTask:{[originalTasks[0].id]:before.messagesByTask[originalTasks[0].id]}};
  let complete!:()=>void;
  const barrier=new Promise<void>(resolve=>{complete=resolve;});
  let restored=false;
  const identity={id:"retained-workspace",name:"Retained",updatedAt:"2026-11-17"};
  const registry=()=>({repositoryPath:"/fixture",repositoryName:"Fixture",lastOpenedAt:"2026-11-17",defaultBranch:"main",workspaces:[{id:base,name:"Main",updatedAt:"2026-11-17"},...(restored?[identity]:[])],activeWorkspaceId:base,workspacePathById:{[base]:"/fixture","retained-workspace":"/fixture/archive"},workspaceBranchById:{[base]:"main","retained-workspace":"feature"},workspaceDefaultById:{[base]:true,"retained-workspace":false}});
  const writes:Array<{id:string;flags:Array<string|null>}> = [];
  window.api={...window.api,persistence:{...window.api?.persistence,loadWorkspaceShell:undefined,loadWorkspaceShellForRestore:undefined,loadWorkspaceShellLite:undefined,loadWorkspaceShellSummary:undefined,loadWorkspace:async(args:{workspaceId:string})=>({ok:true,snapshot:["retained-workspace","other-history"].includes(args.workspaceId)?snapshot:null}),loadRepositoryRegistry:async()=>({ok:true,repositories:[registry()]}),listActiveWorkspaceTurns:async()=>({ok:true,turns:[]}),upsertWorkspace:async(args:{id:string;snapshot:{tasks:typeof originalTasks}})=>{writes.push({id:args.id,flags:args.snapshot.tasks.map(task=>task.archivedAt??null)});return {ok:true};}},workspaceCleanup:{...window.api?.workspaceCleanup,act:async()=>{await barrier;restored=true;return {ok:true,action:"restore",workspaceId:"retained-workspace",repositoryPath:"/fixture"};}}} as typeof window.api;
  store.setState({workspacePathById:{[base]:"/fixture"},workspaceDefaultById:{[base]:true}});
  await store.getState().focusTaskAttention({workspaceId:"retained-workspace",repositoryPath:"/fixture",taskId:originalTasks[0].id,workspaceArchived:true,searchQuery:"settings"});
  const restore=restoreArchivedSearchView(originalTasks[0].id,store.setState,store.getState);
  if(mode==="move") await store.getState().switchWorkspace({workspaceId:base});
  if(mode==="new-history") await store.getState().focusTaskAttention({workspaceId:"other-history",repositoryPath:"/fixture",taskId:originalTasks[0].id,workspaceArchived:true,searchQuery:"settings"});
  const cachedWhilePending=store.getState().workspaceRuntimeCacheById["retained-workspace"]?.tasks.map(task=>task.archivedAt??null) ?? null;
  complete();await restore;
  const currentAfterRestore=store.getState().activeWorkspaceId;
  await store.getState().switchWorkspace({workspaceId:"retained-workspace"});
  const flags=store.getState().tasks.map(task=>task.archivedAt??null);
  await store.getState().flushActiveWorkspaceSnapshot();
  return {flags,currentAfterRestore,base,cachedWhilePending,lastWrite:writes.filter(write=>write.id==="retained-workspace").at(-1)?.flags};
 },mode);
 if(mode==="move") {
  expect(outcome.cachedWhilePending).not.toBeNull();
  expect(outcome.currentAfterRestore).toBe(outcome.base);
 }
 if(mode==="new-history") expect(outcome.currentAfterRestore).toBe("other-history");
 expect(outcome.flags).toEqual(["2026-11-01T00:00:00.000Z",null]);
 expect(outcome.lastWrite).toEqual(["2026-11-01T00:00:00.000Z",null]);
});

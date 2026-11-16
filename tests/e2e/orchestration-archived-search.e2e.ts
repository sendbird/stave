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
  window.api={...window.api,persistence:{...window.api?.persistence,loadWorkspaceShell:undefined,loadWorkspace:async()=>({ok:true,snapshot}),loadRepositoryRegistry:async()=>({ok:true,repositories:[registry]})},workspaceCleanup:{...window.api?.workspaceCleanup,act:async(args:unknown)=>{calls.push(args);return {ok:true,action:"restore",workspaceId:"retained-workspace",repositoryPath:"/fixture"};}}} as typeof window.api;
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
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`/tmp/orchestration-workbench/archived-view-${locale}-${theme}.png`});
 await banner.getByRole("button",{name:locale==="en"?"Restore":"복원",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {__archiveRestoreCalls:unknown[]}).__archiveRestoreCalls)).toEqual([{action:"restore",workspaceId:"retained-workspace",repositoryPath:"/fixture"},{switchWorkspace:"retained-workspace"}]);
 await expect(banner).toHaveCount(0);
});

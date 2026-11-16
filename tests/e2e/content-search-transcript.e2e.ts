import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`whole-task find reveals a message outside the resident window in ${theme}`, async ({
    page,
  }) => {
    await page.goto(
      `/tests/e2e/fixtures/conversation-time.html?offWindow=1&theme=${theme}`,
    );
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.locator('[data-message-id="old-export-retry"]'),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Find in conversation", exact: true })
      .focus();
    await page.keyboard.press("Control+f");
    const field = page.getByRole("textbox", {
      name: "Search all task messages",
    });
    await field.fill("export retry");
    await expect(page.getByRole("search").getByRole("status")).toHaveText(
      "0 / 1",
    );
    await field.press("Enter");
    const match = page.locator('[data-message-id="old-export-retry"]');
    await expect(match).toBeVisible();
    await expect(match).toHaveAttribute("data-content-search-match", "true");
    await expect(match.locator("mark")).toHaveText(["export", "retry"]);
    await expect(
      page.getByRole("button", { name: "Load 2340 newer messages" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to latest" }).click();
    await expect(
      page.locator('[data-message-id="history-2398"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Back to latest" }),
    ).toHaveCount(0);
  });
}

test("opening a content result reveals its message through the task focus action", async ({
  page,
}) => {
  await page.goto(
    "/tests/e2e/fixtures/conversation-time.html?offWindow=1&focusHit=1",
  );
  await page.getByRole("button", { name: "Open matched message" }).click();
  const match = page.locator('[data-message-id="old-export-retry"]');
  await expect(match).toBeVisible();
  await expect(match).toHaveAttribute("data-content-search-match", "true");
  await expect(match.locator("mark")).toHaveText(["export", "retry"]);
});

test("palette Enter opens the highlighted message in the actual transcript", async ({
  page,
}) => {
  await page.goto(
    "/tests/e2e/fixtures/conversation-time.html?offWindow=1&palette=1",
  );
  const field = page.getByRole("combobox");
  await field.fill("export retry");
  await expect(page.locator("[data-content-search-result]")).toHaveCount(1);
  await field.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden();
  const match = page.locator('[data-message-id="old-export-retry"]');
  await expect(match).toBeVisible();
  await expect(match).toHaveAttribute("data-content-search-match", "true");
  await expect(match.locator("mark")).toHaveText(["export", "retry"]);
});

test("Find includes unsaved resident text absent from the index", async ({page})=>{
  await page.goto('/tests/e2e/fixtures/conversation-time.html?offWindow=1');
  await page.evaluate(async()=>{
    const useAppStore=(window as unknown as {__contentSearchFixtureStore:typeof import("@/store/app.store").useAppStore}).__contentSearchFixtureStore;
    const state=useAppStore.getState();
    const taskId=state.activeTaskId;
    useAppStore.setState({messagesByTask:{...state.messagesByTask,[taskId]:[...state.messagesByTask[taskId],{id:'unsaved',role:'assistant',model:'test',providerId:'codex',content:'uniquelivephrase',parts:[{type:'text',text:'uniquelivephrase'}],isStreaming:true}]}});
  });
  await page.getByRole('button',{name:'Find in conversation',exact:true}).focus();
  await page.keyboard.press('Control+f');
  const field=page.getByRole('textbox',{name:'Search all task messages'});
  await field.fill('uniquelivephrase');
  await expect(page.getByRole('search').getByRole('status')).toHaveText('0 / 1');
  await field.press('Enter');
  await expect(page.locator('[data-message-id="unsaved"]')).toBeVisible();
});

test("Find refresh keeps a selected match through backfill completion",async({page})=>{
  await page.goto('/tests/e2e/fixtures/conversation-time.html?offWindow=1&backfill=1');
  await page.getByRole('button',{name:'Find in conversation',exact:true}).focus();
  await page.keyboard.press('Control+f');
  const field=page.getByRole('textbox',{name:'Search all task messages'});
  await field.fill('export retry');
  await expect(page.getByRole('search').getByRole('status')).toHaveText('0 / 1');
  await field.press('Enter');
  await expect(page.getByRole('search').getByRole('status')).toHaveText('1 / 1');
  await page.waitForTimeout(1800);
  await expect(page.getByRole('search').getByRole('status')).toHaveText('1 / 1');
});

for(const theme of ['light','dark']) test(`archived result is read-only with a restore banner in ${theme}`,async({page})=>{
 await page.goto(`/tests/e2e/fixtures/conversation-time.html?archived=1&theme=${theme}`);
 const banner=page.getByTestId('archived-task-banner');
 await expect(banner).toContainText('Archived');
 await expect(banner.getByRole('button',{name:'Restore',exact:true})).toBeVisible();
 await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
 await page.evaluate(()=>document.fonts.ready);
 for(const width of [480,1280]) {
   await page.setViewportSize({width,height:800});
   const geometry=await banner.evaluate(node=>{const action=node.querySelector('button')!.getBoundingClientRect();const bounds=node.getBoundingClientRect();return {contained:action.left>=bounds.left && action.right<=bounds.right,overflow:node.scrollWidth>node.clientWidth};});
   expect(geometry).toEqual({contained:true,overflow:false});
 }
});

test("sending from history returns to the sent message and streaming reply",async({page})=>{
 await page.goto('/tests/e2e/fixtures/conversation-time.html?offWindow=1&focusHit=1');
 await page.getByRole('button',{name:'Open matched message'}).click();
 await expect(page.locator('[data-message-id="old-export-retry"]')).toBeVisible();
 const result=await page.evaluate(async()=>{
   const store=(window as unknown as {__contentSearchFixtureStore:typeof import('@/store/app.store').useAppStore}).__contentSearchFixtureStore;
   window.api={...window.api,provider:{streamTurn:async()=>[{type:'text',text:'livereplyneedle'},{type:'done',stop_reason:'end_turn'}]}} as typeof window.api;
   const state=store.getState();
   store.setState({settings:{...state.settings,chatStreamingEnabled:false}});
   return store.getState().sendUserMessage({taskId:state.activeTaskId,content:'livesentneedle'});
 });
 expect(result.status).toBe('started');
 await expect(page.getByText('livesentneedle',{exact:true})).toBeVisible();
 await expect(page.getByText('livereplyneedle',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Back to latest'})).toHaveCount(0);
});

test("archived search tabs remain visible in the real workspace pane host",async({page})=>{
 await page.goto('/tests/e2e/fixtures/conversation-time.html?archived=1&pane=1');
 await expect(page.getByTestId('archived-task-banner')).toBeVisible();
 await page.getByRole('button',{name:'Restore',exact:true}).click();
 await expect(page.getByTestId('archived-task-banner')).toHaveCount(0);
 await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
});

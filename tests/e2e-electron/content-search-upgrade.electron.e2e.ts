import {launchStave} from "./harness/stave-app";
import {mkdtemp,rm} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {expect,test} from "@playwright/test";


test("old indexed profile upgrades and continues saving messages",async()=>{
 const seed=process.env.CONTENT_SEARCH_OLD_SEED ?? execFileSync("bun",["run","scripts/build-content-search-upgrade-seed.ts"],{encoding:"utf8"}).trim();
 const profile=await mkdtemp(path.join(tmpdir(),"stave-search-upgrade-"));
 const runtime=createRequire(import.meta.url)("electron") as string;
 execFileSync(runtime,[seed,path.join(profile,"stave.sqlite")],{env:{...process.env,ELECTRON_RUN_AS_NODE:"1"}});
 const stave=await launchStave({userDataDir:profile});
 try {
   const response=await stave.page.evaluate(async()=>{
     const api=window.api.persistence!;
     const {shell}=await api.loadWorkspaceShell!({workspaceId:"w"});
     if(!shell) throw new Error("Old workspace missing");
     const saved=await api.upsertWorkspace!({id:"w",name:"Workspace",snapshot:{...shell,messagesByTask:{t:[{id:"after",role:"user",model:"user",providerId:"user",content:"upgradesavedneedle",parts:[]}]}}});
     const page=await api.loadTaskMessages!({workspaceId:"w",taskId:"t",limit:20});
     return {saved:saved.ok,ids:page.page.messages.map(message=>message.id)};
   });
   expect(response.saved).toBe(true);expect(response.ids).toContain("after");
   // Queue coalescing waits three seconds plus the idle drain and assertion polling.
   await expect.poll(()=>stave.page.evaluate(async()=>{
     const response=await window.api.persistence!.searchTaskContent!({query:"upgradesavedneedle"});
     return response.ok ? response.results.length : -1;
   }),{timeout:10_000}).toBe(1);
 } finally {await stave.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});

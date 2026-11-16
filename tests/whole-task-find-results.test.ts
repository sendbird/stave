import {expect,test} from "bun:test";
import {mergeWholeTaskFindResults,retainFindSelection} from "../src/lib/task-search/whole-task-find-results";
import type {ChatMessage} from "../src/types/chat";
const msg=(id:string,content:string)=>({id,content,parts:[],role:"assistant",providerId:"codex",model:"test"}) as ChatMessage;
test("S8 resident live and inline text override stale index and deduplicate by id",()=>{
 const resident=[msg("live","unsaved needle"),msg("inline","legacy needle")];
 const first=mergeWholeTaskFindResults([],resident,"needle","t","w");
 expect(first.map(hit=>hit.messageId)).toEqual(["live","inline"]);
 expect(mergeWholeTaskFindResults(first,[msg("live","replaced")],"needle","t","w").map(hit=>hit.messageId)).toEqual(["inline"]);
});
test("S3 refresh retains the selected message instead of restarting",()=>{
 const results=mergeWholeTaskFindResults([],[msg("a","needle"),msg("b","needle")],"needle","t","w");
 expect(retainFindSelection({results,selected:1},results)).toBe(1);
});

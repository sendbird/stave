import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("webhook receiver defaults off and native IPC rejects unknown settings", async () => {
  const stave = await launchStave();
  try {
    const status = await stave.page.evaluate(() => window.api.automations!.webhookStatus!());
    expect(status).toMatchObject({ok:true,settings:{enabled:false,bindAddress:"127.0.0.1",port:6330},deliveries:[]});
    const invalid = await stave.page.evaluate(async () => {
      try {
        await window.api.automations!.configureWebhookReceiver!({enabled:false,bindAddress:"127.0.0.1",port:6330,extra:true} as never);
        return "accepted";
      } catch { return "rejected"; }
    });
    expect(invalid).toBe("rejected");
    const configured = await stave.page.evaluate(() => window.api.automations!.configureWebhookReceiver!({enabled:false,bindAddress:"127.0.0.1",port:6331}));
    expect(configured).toMatchObject({ok:true,settings:{enabled:false,port:6331}});
  } finally { await stave.close(); }
});

test("native webhook HTTP verifies signatures and keeps filtered delivery dedupe across restart", async () => {
  const { createHmac, randomUUID } = await import("node:crypto");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const userDataDir = await mkdtemp(path.join(tmpdir(),"webhook-native-"));
  let stave = await launchStave({userDataDir});
  try {
    const id=randomUUID();
    // The generated signing value stays in this isolated test and is never logged.
    const provision=await stave.page.evaluate((id)=>window.api.automations!.provisionWebhook!({id}),id);
    expect(provision.ok).toBe(true);
    if (!provision.ok) throw new Error("Secure provisioning unavailable");
    const created=await stave.page.evaluate(async ({endpointId,secretId})=>window.api.automations!.create!({
      name:"Native webhook",prompt:"Summarize {{body.action}}",enabled:true,schedule:{every:1,unit:"days"},
      environment:{kind:"repository",workspaceId:"native-test",path:"/tmp",repositoryPath:"/tmp",label:"Native"},
      runtime:{provider:"codex",model:"test-model",effort:"medium",fileAccess:"read-only",approvalPolicy:"untrusted",networkAccess:false,webSearch:"disabled"},
      trustPolicy:"review-required",maxConcurrentRuns:1,informationReferences:[],
      webhook:{endpointId,secretId,filters:[{path:"$.action",operator:"equals",value:"opened"}],dedupeWindowSeconds:86400,coalesceWindowSeconds:0,rateLimitPerMinute:60},
    }),{endpointId:provision.endpointId,secretId:provision.secretId});
    expect(created.ok).toBe(true);
    const configured=await stave.page.evaluate(()=>window.api.automations!.configureWebhookReceiver!({enabled:true,bindAddress:"127.0.0.1",port:6336}));
    expect(configured.ok).toBe(true);
    const body='{"action":"closed"}';
    const url=`http://127.0.0.1:6336/webhooks/${provision.endpointId}`;
    expect((await fetch(url,{method:"POST",body})).status).toBe(401);
    const headers={"x-stave-signature":`sha256=${createHmac("sha256",provision.secret).update(body).digest("hex")}`,"x-delivery-id":"native-retry"};
    expect((await fetch(url,{method:"POST",body,headers})).status).toBe(202);
    await stave.close();
    stave=await launchStave({userDataDir});
    await expect.poll(async()=>{
      try { return (await fetch(url,{method:"POST",body,headers})).status; } catch {return 0;}
    }).toBe(202);
    const status=await stave.page.evaluate(()=>window.api.automations!.webhookStatus!());
    expect(status.ok).toBe(true);
    if(status.ok) expect(status.deliveries.map(d=>d.status)).toEqual(expect.arrayContaining(["rejected","filtered","duplicate"]));
    const snapshot=await stave.page.evaluate(()=>window.api.automations!.list!());
    expect(snapshot.snapshot.runs).toHaveLength(0);
    expect(JSON.stringify(snapshot)).not.toContain(provision.secret);
    await stave.page.evaluate(()=>window.api.automations!.configureWebhookReceiver!({enabled:false,bindAddress:"127.0.0.1",port:6336}));
  } finally {await stave.close();await rm(userDataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

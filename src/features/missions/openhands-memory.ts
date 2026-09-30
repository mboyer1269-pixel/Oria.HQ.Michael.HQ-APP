import { z } from "zod";
import type { OpenHandsSubmissionRequest } from "@/server/missions/openhands-submission";

const projectsSchema = z.object({ status:z.literal("ready"),projects:z.array(z.object({
  projectId:z.string().min(1).max(160),label:z.string().min(1).max(120),
}).strict()).max(20) }).strict();
export type OpenHandsMemoryProject = z.infer<typeof projectsSchema>["projects"][number];
async function exchange(init: RequestInit, fetcher: typeof fetch) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    const response=await fetcher("/api/orchestration/openhands",{...init,credentials:"same-origin",redirect:"error",signal:controller.signal});
    if(!response.body||!response.headers.get("content-type")?.includes("application/json"))throw Error("invalid_response");
    reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384)throw Error("oversized_response");chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    return {ok:response.ok,body:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))};
  } finally {clearTimeout(timer);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
}
export async function loadOpenHandsMemoryProjects(fetcher:typeof fetch=fetch):Promise<OpenHandsMemoryProject[]> {
  const r=await exchange({method:"GET"},fetcher);
  if(!r.ok)throw Error("projects_unavailable");return projectsSchema.parse(r.body).projects;
}
export async function attachOpenHandsMemory(request:OpenHandsSubmissionRequest,projectId:string,fetcher:typeof fetch=fetch):Promise<boolean> {
  const r=await exchange({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"attach_memory",...request,projectId})},fetcher);
  if(!r.ok||r.body.externalEffectAllowed!==false)return false;
  if(r.body.status==="already_attached")return true;
  return r.body.status==="attached"&&r.body.missionId===request.missionId&&
    z.iso.datetime({offset:true}).safeParse(r.body.updatedAt).success&&r.body.updatedAt!==request.expectedUpdatedAt&&
    z.string().regex(/^[a-f0-9]{64}$/).safeParse(r.body.snapshotHash).success;
}

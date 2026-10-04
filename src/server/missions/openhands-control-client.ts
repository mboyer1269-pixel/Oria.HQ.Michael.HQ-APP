import "server-only";
import net from "node:net";
import path from "node:path";
import {z} from "zod";
import {toolRequestSchema} from "./openhands-tool-permission";
import {launchConfigSchema} from "./openhands-launch";

const id=z.string().min(1).max(160);
const ownerSchema=z.object({actorId:id,workspaceId:id}).strict();
const pendingSchema=z.object({request:toolRequestSchema,config:launchConfigSchema,actorId:id,runnerId:id}).strict();
const LIMIT=32768;

/** Server-selected local endpoint only. Never accept socketPath from HTTP input. */
export function createOpenHandsControlClient(socketPath:string) {
  if(!path.isAbsolute(socketPath)||socketPath.includes('\0'))throw Error('invalid_control_path');
  async function call(request:unknown):Promise<unknown>{
    const frame=Buffer.from(JSON.stringify(request)+'\n');
    if(frame.length>LIMIT)throw Error('oversized_control_request');
    return new Promise((resolve,reject)=>{
      const socket=net.createConnection({path:socketPath});
      const chunks:Buffer[]=[];let bytes=0;let settled=false;
      const finish=(error?:Error,value?:unknown)=>{
        if(settled)return;settled=true;clearTimeout(timer);socket.destroy();
        if(error)reject(error);else resolve(value);
      };
      const timer=setTimeout(()=>finish(Error('control_timeout')),2500);
      socket.on('error',()=>finish(Error('control_unavailable')));
      socket.on('end',()=>finish(Error('incomplete_control_response')));
      socket.on('connect',()=>socket.write(frame));
      socket.on('data',(chunk:Buffer)=>{
        bytes+=chunk.length;if(bytes>LIMIT)return finish(Error('oversized_control_response'));
        chunks.push(chunk);const body=Buffer.concat(chunks);const end=body.indexOf(10);
        if(end<0)return;
        try{finish(undefined,JSON.parse(body.subarray(0,end).toString('utf8')));}
        catch{finish(Error('invalid_control_response'));}
      });
    });
  }
  return {
    async list(owner:z.infer<typeof ownerSchema>){
      const response=await call({operation:'list',...ownerSchema.parse(owner)});
      return z.object({status:z.literal('ok'),requestIds:z.array(z.uuid()).max(1)}).strict().parse(response).requestIds;
    },
    async load(owner:z.infer<typeof ownerSchema>,requestId:string){
      const response=await call({operation:'read',...ownerSchema.parse(owner),requestId:z.uuid().parse(requestId)});
      const pending=z.object({status:z.literal('ok'),pending:pendingSchema.nullable()}).strict().parse(response).pending;
      if(pending&&(pending.actorId!==owner.actorId||pending.request.workspaceId!==owner.workspaceId||pending.runnerId!==pending.request.runnerId))throw Error('control_scope_mismatch');
      return pending;
    },
    async notify(owner:z.infer<typeof ownerSchema>,requestId:string){
      const response=await call({operation:'notify',...ownerSchema.parse(owner),requestId:z.uuid().parse(requestId)});
      return z.object({status:z.literal('ok'),notified:z.boolean()}).strict().parse(response).notified;
    },
  };
}

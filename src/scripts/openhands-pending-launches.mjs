/** Privileged host-only discovery. Inherits existing server environment.
 * No credential or mission content is emitted. Never accepts browser input. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createJiti} from 'jiti';
try{
 if(process.platform!=='linux'||process.getuid?.()!==0||![3,4].includes(process.argv.length))throw Error();
 const filename=process.argv[2];
 if(!path.isAbsolute(filename)||await fs.realpath(filename)!==filename)throw Error();
 for(let current=filename;;current=path.dirname(current)){
  const info=await fs.lstat(current);if(info.uid!==0||(info.mode&0o022)||info.isSymbolicLink())throw Error();
  if(current===filename&&(!info.isFile()||info.size>16384))throw Error();
  if(path.dirname(current)===current)break;
 }
 const profile=JSON.parse(await fs.readFile(filename,'utf8'));
 const root=path.resolve(import.meta.dirname,'../..');
 const jiti=createJiti(import.meta.url,{alias:{'@':path.join(root,'src'),'server-only':path.join(root,'src/scripts/smoke/server-only-stub.mjs')}});
 const {createPendingOpenHandsLaunchReader}=await jiti.import('../server/missions/openhands-pending-launches.ts');
 const result=await createPendingOpenHandsLaunchReader()(profile,process.argv[3]);
 process.stdout.write(JSON.stringify(result)+'\n');if(result.status!=='ready')process.exitCode=3;
}catch{process.stdout.write(JSON.stringify({status:'unavailable'})+'\n');process.exitCode=2;}

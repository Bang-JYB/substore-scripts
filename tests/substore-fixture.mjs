import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {root} from './helpers.mjs';
export const captured=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/substore-2.42.6.json'),'utf8'));
export async function fromSubstore(file,{asObject=false,useFiles=false,artifacts=captured,scriptRoot=root}={}){
 const solo=file.startsWith('config_vps_'),calls=[];
 const template=fs.readFileSync(path.join(root,file),'utf8');
 const context={$arguments:{},TextEncoder,console:{log(){}},produceArtifact:async request=>{
  calls.push(JSON.parse(JSON.stringify(request)));
  const value=request.type==='collection'?artifacts.combined:artifacts.vps;
  return asObject&&typeof value==='string'?JSON.parse(value):value;
 }};
 if(useFiles)context.$files=[template];else context.$content=template;
 await vm.runInNewContext('(async()=>{'+fs.readFileSync(path.join(scriptRoot,solo?'inject-vps-standalone.js':'inject-nodes.js'),'utf8')+'})()',context,{timeout:5000});
 return {config:JSON.parse(context.$content),calls};
}

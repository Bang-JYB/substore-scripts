import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
export const root=path.resolve(import.meta.dirname,'..');
export const templates=['config_pc.json','config_tun.json','config_android.json','config_vps_notun.json','config_vps_standalone.json','config_vps_android.json'];
export const groups=['节点选择','自动选择','VPS','VPS-自动','AI工具','漏网之鱼','🎯 全球直连','GLOBAL'];
export const node=(tag,server='192.0.2.1',extra={})=>({type:'socks',tag,server,server_port:1080,version:'5',...extra});
export async function generate(file='config_pc.json',combined=[node('机场'),node('自建','192.0.2.2')],vps=[node('自建','192.0.2.2')],args={},scriptRoot=root,template){
 const solo=file.startsWith('config_vps_');
 const ctx={$content:template===undefined?fs.readFileSync(path.join(root,file),'utf8'):JSON.stringify(template),$arguments:args,TextEncoder,console:{log(){}},produceArtifact:async({type})=>({outbounds:type==='collection'?combined:vps})};
 const script=fs.readFileSync(path.join(scriptRoot,solo?'inject-vps-standalone.js':'inject-nodes.js'),'utf8');
 await vm.runInNewContext('(async()=>{'+script+'})()',ctx,{timeout:5000});
 return JSON.parse(ctx.$content);
}

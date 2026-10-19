import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {templates,generate,node} from './helpers.mjs';
const binary=process.env.SING_BOX;
if(!binary)throw Error('Set SING_BOX to the official 1.14.2 executable (python scripts/download-core.py).');
const version=execFileSync(binary,['version'],{encoding:'utf8'});
if(!version.startsWith('sing-box version 1.14.2\n')&&!version.startsWith('sing-box version 1.14.2\r\n'))throw Error('Expected official core 1.14.2');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ybs-check-'));
const uuid='11111111-1111-4111-8111-111111111111';
const airport=[node('测试机场'),{type:'shadowsocks',tag:'SS',server:'192.0.2.3',server_port:443,method:'aes-128-gcm',password:'fixture-only'},
 {type:'vless',tag:'VLESS',server:'192.0.2.4',server_port:443,uuid,tls:{enabled:true,server_name:'example.com'}},
 {type:'vmess',tag:'VMess',server:'192.0.2.5',server_port:443,uuid,security:'auto'},
 {type:'hysteria2',tag:'HY2',server:'192.0.2.6',server_port:443,password:'fixture-only',tls:{enabled:true,server_name:'example.com'}},
 {type:'tuic',tag:'TUIC',server:'192.0.2.7',server_port:443,uuid,password:'fixture-only',congestion_control:'bbr',tls:{enabled:true,server_name:'example.com',alpn:['h3']}},
 {type:'anytls',tag:'AnyTLS',server:'192.0.2.8',server_port:443,password:'fixture-only',tls:{enabled:true,server_name:'example.com'}}];
const vps=[node('自建','192.0.2.2'),node('IPv6自建','2001:db8::2')];
let n=0;
try{
 for(const f of templates){
  const combos=f.startsWith('config_vps_')?[{}, {strategy:'prefer_ipv6',rules_dir:'offline-seeds'}, {mode:'mixed'}]:[{}, {rules_dir:'offline-seeds'}];
  for(const args of combos){
   const config=await generate(f,[...airport,...vps],vps,args);
   const dest=path.join(dir,`${n++}.json`);fs.writeFileSync(dest,JSON.stringify(config));
   execFileSync(binary,['check','-c',dest],{stdio:'pipe'});
   console.log('PASS '+f+' '+JSON.stringify(args));
  }
 }
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log(`${n} complete generated configurations checked with official 1.14.2.`);

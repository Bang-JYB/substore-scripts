import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {templates,generate,node} from './helpers.mjs';
const binary=process.env.SING_BOX;
const expected=process.env.SING_BOX_VERSION??'1.14.2';
if(!['1.14.2','1.14.3'].includes(expected))throw Error('Unsupported validation version: '+expected);
if(!binary)throw Error('Set SING_BOX to the official 1.14.2 executable (python scripts/download-core.py).');
const version=execFileSync(binary,['version'],{encoding:'utf8'});
if(version.split(/\r?\n/)[0]!==`sing-box version ${expected}`)throw Error(`Expected official core ${expected}`);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ybs-check-'));
const uuid='11111111-1111-4111-8111-111111111111';
const airport=[node('测试机场'),{type:'shadowsocks',tag:'SS',server:'192.0.2.3',server_port:443,method:'aes-128-gcm',password:'fixture-only'},
 {type:'vless',tag:'VLESS',server:'192.0.2.4',server_port:443,uuid,tls:{enabled:true,server_name:'example.com'}},
 {type:'vmess',tag:'VMess',server:'192.0.2.5',server_port:443,uuid,security:'auto'},
 {type:'hysteria2',tag:'HY2',server:'192.0.2.6',server_port:443,password:'fixture-only',tls:{enabled:true,server_name:'example.com'}},
 {type:'tuic',tag:'TUIC',server:'192.0.2.7',server_port:443,uuid,password:'fixture-only',congestion_control:'bbr',tls:{enabled:true,server_name:'example.com',alpn:['h3']}},
 {type:'anytls',tag:'AnyTLS',server:'192.0.2.8',server_port:443,password:'fixture-only',tls:{enabled:true,server_name:'example.com'}}];
const vps=[node('自建','192.0.2.2'),node('IPv6自建','2001:db8::2')];
const standaloneProxies=[...airport,...vps,
 {type:'trojan',tag:'Trojan',server:'192.0.2.9',server_port:443,password:'fixture-only',tls:{enabled:true,server_name:'example.com'}},
 {type:'hysteria',tag:'HY1',server:'192.0.2.10',server_port:443,up_mbps:10,down_mbps:10,auth_str:'fixture-only',tls:{enabled:true,server_name:'example.com'}},
 {type:'http',tag:'HTTP',server:'192.0.2.11',server_port:8080},
 {type:'ssh',tag:'SSH',server:'192.0.2.12',server_port:22,user:'fixture',password:'fixture-only'},
 {type:'shadowtls',tag:'ShadowTLS',server:'192.0.2.13',server_port:443,version:3,password:'fixture-only',tls:{enabled:true,server_name:'example.com'}},
 {type:'naive',tag:'Naive',server:'192.0.2.14',server_port:443,username:'fixture',password:'fixture-only',tls:{enabled:true,server_name:'example.com'}},
 {type:'snell',tag:'Snell',server:'192.0.2.15',server_port:443,version:4,psk:'fixture-only'}];
let n=0;
try{
 for(const f of templates){
  const combos=f.startsWith('config_vps_')?[{}, {strategy:'prefer_ipv6',rules_dir:'offline-seeds'}, ...(f==='config_vps_android.json'?[]:[{mode:'mixed'}])]:[{}, {rules_dir:'offline-seeds'}];
  if(f==='config_vps_android.json'){
   // Invalid Android/mixed must fail before core check, which permits empty inbounds.
   await assert.rejects(generate(f,airport,vps,{mode:'mixed'}),/mode=mixed/);
  }
  for(const args of combos){
   const config=await generate(f,[...airport,...vps],vps,args);
   if(!Array.isArray(config.inbounds)||!config.inbounds.length)throw Error('Generated configuration has no inbounds');
   const dest=path.join(dir,`${n++}.json`);fs.writeFileSync(dest,JSON.stringify(config));
   execFileSync(binary,['check','-c',dest],{stdio:'pipe'});
   console.log('PASS '+f+' '+JSON.stringify(args));
  }
 }
 const all=await generate('config_vps_notun.json',[],standaloneProxies);
 assert.equal(new Set(all.outbounds.filter(x=>x.server).map(x=>x.type)).size,14);
 const dest=path.join(dir,`${n++}.json`);fs.writeFileSync(dest,JSON.stringify(all));
 execFileSync(binary,['check','-c',dest],{stdio:'pipe'});
 console.log('PASS standalone all 14 allowed protocols');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log(`${n} complete generated configurations checked with official ${expected}.`);

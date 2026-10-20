// Small, dependency-free checks for the 7a72e9f rule-only patch; no network tests.
// node checks/minimal-rules.mjs --core /absolute/path/to/official/sing-box
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=['config_pc.json','config_tun.json','config_android.json','config_vps_notun.json','config_vps_standalone.json','config_vps_android.json'];
const groups=['节点选择','自动选择','VPS','VPS-自动','AI工具','漏网之鱼','🎯 全球直连','GLOBAL'];
const qq=['qq.com','qqmusic.com','gtimg.com','gtimg.cn','qpic.cn','qlogo.cn'];
const list=x=>x==null?[]:Array.isArray(x)?x:[x];
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const original=f=>execFileSync('git',['show','7a72e9f:'+f],{cwd:root});
// Independent category fixtures, including the actual upstream AI/Microsoft overlap.
const sets={
 'github.com':['geosite-github','geosite-microsoft','geosite-foreign'],
 'api.github.com':['geosite-github','geosite-microsoft','geosite-foreign'],
 'copilot-proxy.githubusercontent.com':['geosite-github','geosite-ai','geosite-foreign'],
 'copilot.microsoft.com':['geosite-ai','geosite-microsoft','geosite-foreign'],
 'gemini.google.com':['geosite-ai','geosite-google','geosite-foreign'],
 'google.com':['geosite-google','geosite-foreign'],
 'youtube.com':['geosite-youtube','geosite-foreign'],
 'telegram.org':['geosite-telegram','geosite-foreign'],
 'office.com':['geosite-microsoft'],'apple.com':['geosite-apple'],
 'baidu.com':['geosite-cn'],'nas.lan':['geosite-private']
};
function match(r,m){
 let yes=r.type!=='logical'||(r.mode==='and'?r.rules.every(x=>match(x,m)):r.rules.some(x=>match(x,m)));
 for(const key of ['network','port','protocol','clash_mode','ip_version','query_type'])if(r[key]!==undefined)yes&&=list(r[key]).includes(m[key]);
 if(r.ip_is_private)yes&&=m.private===true;
 if(r.domain_suffix)yes&&=list(r.domain_suffix).some(s=>m.domain===s||m.domain?.endsWith('.'+s));
 if(r.rule_set)yes&&=list(r.rule_set).some(s=>(m.sets??sets[m.domain]??[]).includes(s));
 if(r.match_response)yes&&=m.response===true;
 return r.invert?!yes:yes;
}
function route(c,domain,extra={}){
 const m={domain,network:'tcp',port:443,ip_version:4,clash_mode:'Rule',...extra};
 const r=c.route.rules.find(r=>(r.outbound||['reject','hijack-dns'].includes(r.action))&&match(r,m));
 return r?.outbound??r?.action??c.route.final;
}
function dns(c,domain,extra={}){
 const m={domain,query_type:'A',clash_mode:'Rule',...extra};
 return c.dns.rules.find(r=>r.action!=='evaluate'&&(r.server||r.action==='predefined')&&match(r,m))?.server??c.dns.final;
}
for(const file of files){
 const c=read(file),before=JSON.parse(original(file)),solo=file.startsWith('config_vps_');
 test('QQ-specific overrides removed; ordinary classification retained: '+file,()=>{
  const visit=x=>{
   if(!x||typeof x!=='object')return;
   for(const key of ['domain','domain_suffix','domain_keyword','domain_regex'])for(const value of list(x[key])){
    assert.ok(!qq.some(q=>value.toLowerCase().includes(q)),'QQ override remains: '+key);
   }
   Object.values(x).forEach(visit);
  };
  visit(c.dns.rules);visit(c.route.rules);
  assert.equal(route(c,'y.qq.com',{sets:['geosite-cn']}),solo?'direct':'🎯 全球直连');
  assert.equal(dns(c,'y.qq.com',{sets:['geosite-cn']}),solo?'vps-dns':'ali');
  assert.equal(route(c,'y.qq.com'),c.route.final);
 });
 test('only the declared rule edits are permitted: '+file,()=>{
  assert.equal(c.dns.rules.length,before.dns.rules.length-1);
  assert.equal(c.route.rules.length,before.route.rules.length-1);
  const oldDNS=structuredClone(before.dns);
  oldDNS.rules=oldDNS.rules.filter(r=>!list(r.domain_suffix).some(x=>qq.includes(x)));
  assert.deepEqual(c.dns,oldDNS,'DNS must equal 7a72e9f minus only the QQ override');
  const scrub=config=>{
   const copy=structuredClone(config);
   for(const area of ['dns','route'])copy[area].rules=copy[area].rules.filter(r=>
    !list(r.domain_suffix).some(x=>qq.includes(x))&&
    (solo||area!=='route'||!list(r.rule_set).includes('geosite-ai')));
   return copy;
  };
  assert.deepEqual(scrub(c),scrub(before),'unrelated DNS/route/transport field changed');
  assert.equal(route(c,'github.com'),solo?'VPS选择':'节点选择');
  assert.equal(route(c,'office.com'),'direct');
  assert.equal(route(c,'nas.lan'),'direct');
  assert.equal(route(c,'baidu.com'),solo?'direct':'🎯 全球直连');
  assert.equal(route(c,'ip.example',{sets:['geoip-cn']}),solo?'direct':'🎯 全球直连');
  assert.equal(route(c,'dns.example',{network:'udp',port:53,protocol:'dns'}),'hijack-dns');
  for(const clash_mode of ['Rule','Direct','Global'])assert.equal(route(c,undefined,{private:true,network:'udp',clash_mode}),'direct');
  assert.equal(route(c,'foreign.example',{sets:['geosite-foreign']}),solo?'VPS选择':'节点选择');
  assert.equal(route(c,'unlisted.example'),solo?'VPS选择':'漏网之鱼');
 });
 if(solo)test('VPS UDP and dual-stack behavior unchanged: '+file,()=>{
  assert.equal(route(c,'github.com',{network:'udp'}),'VPS选择');
  assert.equal(c.dns.strategy,'prefer_ipv4');
  assert.equal(route(c,'foreign.example',{network:'udp',port:8443,ip_version:6}),'VPS选择');
 });
 else{
  test('AI route precedes GitHub/Microsoft; DNS retains historical behavior: '+file,()=>{
   for(const host of ['copilot.microsoft.com','gemini.google.com']){
    assert.equal(route(c,host),'AI工具');
   }
   assert.equal(dns(c,'copilot.microsoft.com'),'ali');
   assert.equal(dns(c,'gemini.google.com'),'fakeip');
   assert.equal(dns(c,'github.com'),'google');
   for(const host of ['github.com','api.github.com']){
    assert.equal(route(c,host),'节点选择');assert.equal(dns(c,host),'google');
   }
   assert.equal(route(c,'copilot-proxy.githubusercontent.com'),'AI工具');
   assert.equal(dns(c,'copilot-proxy.githubusercontent.com'),'google');
   assert.equal(route(c,'copilot.microsoft.com',{clash_mode:'Direct'}),'🎯 全球直连');
   assert.equal(route(c,'copilot.microsoft.com',{clash_mode:'Global'}),'GLOBAL');
   assert.equal(dns(c,'copilot.microsoft.com',{clash_mode:'Direct'}),'ali');
   assert.equal(dns(c,'copilot.microsoft.com',{clash_mode:'Global'}),'fakeip');
   assert.equal(c.outbounds.find(o=>o.tag==='AI工具').default,'VPS');
  });
  test('original single UDP443 guard and its priority limitations are explicit: '+file,()=>{
   const guard=r=>r.network==='udp'&&r.port===443&&r.action==='reject';
   assert.deepEqual(c.route.rules.filter(guard),before.route.rules.filter(guard));
   assert.equal(c.route.rules.filter(guard).length,1);
   for(const host of ['github.com','api.github.com','google.com','youtube.com','telegram.org','copilot.microsoft.com','copilot-proxy.githubusercontent.com']){
    const target=host.startsWith('copilot')?'AI工具':'节点选择';
    assert.equal(route(c,host,{network:'udp'}),target,'early route intentionally bypasses late guard');
    assert.equal(route(c,host),target);
    assert.equal(route(c,host,{network:'udp',port:8443}),target);
   }
   assert.equal(route(c,'foreign.example',{network:'udp',sets:['geosite-foreign']}),'reject');
   assert.equal(route(c,'unlisted.example',{network:'udp'}),'reject');
   assert.equal(route(c,'unlisted.example',{network:'udp',port:8443}),'漏网之鱼');
   assert.equal(route(c,'baidu.com',{network:'udp'}),'🎯 全球直连');
   assert.equal(route(c,'nas.lan',{network:'udp'}),'direct');
   assert.equal(route(c,'unlisted.example',{network:'udp',clash_mode:'Direct'}),'🎯 全球直连');
   assert.equal(route(c,'unlisted.example',{network:'udp',clash_mode:'Global'}),'GLOBAL');
  });
 }
}
const node=(tag,server)=>({type:'socks',tag,server,server_port:1080,version:'5'});
const airport=[node('香港 HK','192.0.2.1'),node('新加坡 SG','192.0.2.2')];
const tls={enabled:true,server_name:'example.com'};
const vps=[{type:'hysteria2',tag:'fixture-HY2',server:'192.0.2.10',server_port:443,password:'fixture-only',tls},
 {type:'tuic',tag:'fixture-TUIC',server:'192.0.2.11',server_port:443,uuid:'11111111-1111-4111-8111-111111111111',password:'fixture-only',tls},node('fixture-IPv6','2001:db8::1')];
const combined=[...airport,...vps,node('英国 UK','192.0.2.20'),node('台湾','192.0.2.21'),node('剩余流量 10GB','192.0.2.22')];
async function generate(file){
 const solo=file.startsWith('config_vps_');
 const ctx={$content:JSON.stringify(read(file)),TextEncoder,console:{log(){}},produceArtifact:async({type})=>structuredClone({outbounds:type==='collection'?combined:vps})};
 const script=fs.readFileSync(path.join(root,solo?'inject-vps-standalone.js':'inject-nodes.js'),'utf8');
 await vm.runInNewContext('(async()=>{'+script+'})()',ctx,{timeout:5000});
 return JSON.parse(ctx.$content);
}
test('unchanged injectors preserve groups, Hong Kong, filters, pools and node protocol fields',async()=>{
 for(const script of ['inject-nodes.js','inject-vps-standalone.js'])assert.deepEqual(fs.readFileSync(path.join(root,script)),original(script));
 for(const file of files){
  const c=await generate(file),solo=file.startsWith('config_vps_');
  if(!solo){
   assert.deepEqual(c.outbounds.filter(o=>['selector','urltest'].includes(o.type)).map(o=>o.tag),groups);
   assert.deepEqual(c.outbounds.find(o=>o.tag==='自动选择').outbounds,airport.map(o=>o.tag));
   assert.deepEqual(c.outbounds.find(o=>o.tag==='VPS-自动').outbounds,vps.slice(0,2).map(o=>o.tag));
   assert.equal(c.outbounds.find(o=>o.tag==='AI工具').default,'VPS');
  }else assert.ok(c.outbounds.some(o=>o.server==='2001:db8::1'));
  for(const raw of vps.filter(o=>solo||!o.server.includes(':'))){
   const actual=structuredClone(c.outbounds.find(o=>o.tag===raw.tag));delete actual.domain_resolver;
   assert.deepEqual(actual,raw);
  }
  assert.deepEqual(c.inbounds,read(file).inbounds);
 }
});
const core=process.argv[process.argv.indexOf('--core')+1];
test('official 1.14.2 checks all six fully injected configurations',{skip:!process.argv.includes('--core')},async()=>{
 assert.equal(execFileSync(core,['version'],{encoding:'utf8'}).split(/\r?\n/)[0],'sing-box version 1.14.2');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'minimal-rules-'));
 try{for(const file of files){const p=path.join(dir,file);fs.writeFileSync(p,JSON.stringify(await generate(file)));execFileSync(core,['check','-c',p],{stdio:'pipe'});console.log('CORE_OK '+file);}}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

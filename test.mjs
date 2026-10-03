import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=['config_tun.json','config_pc.json','config_android.json'];
const script=new vm.Script('(async()=>{\n'+fs.readFileSync(path.join(root,'inject-nodes.js'),'utf8')+'\n})()');
const node=(tag,n,extra={})=>({type:'shadowsocks',tag,server:'node'+n+'.example.com',server_port:443,
  method:'aes-128-gcm',password:'fixture-password-'+n,...extra});
const own={outbounds:[node('private Tokyo',6),node('private US',7),node('not selected',8)]};
const combined={outbounds:[node('LXY 日本',1),node('LXY 新加坡',2),node('LXY 美国',3),node('LXY 香港 HK',4),
  node('剩余流量 100 GB',5),node('renamed private Tokyo',6),node('private US',7),node('duplicate Japan',1)]};
const out=(c,tag)=>c.outbounds.find(o=>o.tag===tag);
const array=v=>v===undefined?[]:Array.isArray(v)?v:[v];
let checks=0,coreChecks=0;
const temp=process.env.SING_BOX?fs.mkdtempSync(path.join(os.tmpdir(),'combo-sb-')):null;
const results=[];
function test(label,fn){try{fn();checks++;}catch(e){throw new Error(label+': '+e.message,{cause:e});}}
async function run(filename,args={},data=combined,source=own,template) {
  const calls=[],logs=[];
  const ctx=vm.createContext({$arguments:args,$content:template??fs.readFileSync(path.join(root,filename),'utf8'),
    console:{log:s=>logs.push(String(s))},produceArtifact:async p=>{
      calls.push(p);return JSON.stringify(p.type==='collection'?data:source);
    }});
  await script.runInContext(ctx,{timeout:3000});
  assert(logs.every(s=>!s.includes('fixture-password')));
  return {c:JSON.parse(ctx.$content),calls};
}
function core(c,label){
  if(!temp)return;
  const file=path.join(temp,label+'.json');fs.writeFileSync(file,JSON.stringify(c));
  const r=spawnSync(process.env.SING_BOX,['check','-c',file],{encoding:'utf8',timeout:30000});
  if(r.error)throw r.error;
  assert.equal(r.status,0,label+': '+r.stderr+r.stdout);coreChecks++;
}
function matches(r,p){
  for(const key of ['network','port','protocol','ip_version','clash_mode','query_type'])
    if(r[key]!==undefined&&!array(r[key]).includes(p[key]))return false;
  if(r.ip_is_private&&!p.ip_is_private)return false;
  if(r.rule_set&&!array(r.rule_set).some(t=>array(p.rule_set).includes(t)))return false;
  if(r.domain_suffix&&!array(r.domain_suffix).some(s=>p.domain===s||p.domain?.endsWith('.'+s)))return false;
  return true;
}
function route(c,p){
  for(const r of c.route.rules){if(['sniff','resolve'].includes(r.action))continue;
    if(matches(r,p))return r.outbound||r.action;}
  return c.route.final;
}
function dns(c,p){for(const r of c.dns.rules)if(matches(r,p))return r.server||r.action;return c.dns.final;}
try{
for(const filename of files){
 const {c,calls}=await run(filename);results.push(c);
 const t=(label,fn)=>test(filename+' / '+label,fn);
 t('combined input',()=>{assert.equal(calls[0].name,'YBsSB2');assert.equal(calls[0].type,'collection');assert.equal(calls[1].name,'VPS');assert.equal(calls[1].type,'subscription');});
 t('HK kept',()=>assert(out(c,'LXY-自动').outbounds.includes('LXY 香港 HK')));
 t('dedup and information filter',()=>assert.equal(c.outbounds.filter(o=>o.type==='shadowsocks').length,6));
 t('airport source pool',()=>assert.deepEqual(out(c,'LXY-自动').outbounds,['LXY 日本','LXY 新加坡','LXY 美国','LXY 香港 HK']));
 t('VPS source identity despite rename',()=>assert.deepEqual(out(c,'VPS-自动').outbounds,['renamed private Tokyo','private US']));
 t('no source extra nodes',()=>assert(!out(c,'not selected')));
 t('AI default',()=>assert.equal(out(c,'AI').default,'VPS'));
 t('VPS default',()=>assert.equal(out(c,'VPS').default,'VPS-自动'));
 t('airport default',()=>assert.equal(out(c,'LXY').default,'LXY-自动'));
 t('test interval',()=>assert.equal(out(c,'VPS-自动').interval,filename==='config_android.json'?'1h':'30m'));
 t('desktop and android API',()=>assert.equal(!!c.experimental.clash_api,filename!=='config_android.json'));
 t('TUN mode',()=>assert.equal(c.inbounds.some(i=>i.type==='tun'),filename!=='config_pc.json'));
 t('IPv4 TUN',()=>{for(const i of c.inbounds.filter(i=>i.type==='tun')){assert.deepEqual(i.address,['172.19.0.1/30']);assert.equal(i.stack,'mixed');assert.equal(i.strict_route,true);assert.equal(i.dns_mode,'hijack');assert(!i.interface_name);assert(!i.auto_redirect);}});
 t('non TUN system proxy',()=>{if(filename==='config_pc.json'){assert.equal(c.inbounds[0].listen,'127.0.0.1');assert.equal(c.inbounds[0].listen_port,7890);assert.equal(c.inbounds[0].set_system_proxy,true);}});
 t('IPv4 resolution',()=>{assert.equal(c.dns.strategy,'ipv4_only');assert(c.outbounds.filter(o=>o.server).every(o=>o.domain_resolver.strategy==='ipv4_only'));});
 t('direct rule download',()=>{assert.equal(c.http_clients[0].detour,'direct');assert.equal(c.route.default_http_client,'hc-direct');assert(c.route.rule_set.filter(r=>r.type==='remote').every(r=>r.http_client==='hc-direct'&&!r.url.includes('gh-proxy')));});
 t('UDP443 modes',()=>{for(const clash_mode of ['Rule','Direct','Global'])assert.equal(route(c,{network:'udp',port:443,ip_version:4,clash_mode}),'reject');});
 t('TCP443 preserved',()=>assert.equal(route(c,{network:'tcp',port:443,ip_version:4}),'LXY'));
 t('STUN preserved',()=>assert.equal(route(c,{network:'udp',port:3478,protocol:'stun',ip_version:4}),'LXY'));
 t('IPv6 rejected',()=>assert.equal(route(c,{ip_version:6,network:'tcp',port:443}),'reject'));
 t('empty AAAA',()=>{assert.equal(dns(c,{query_type:'AAAA'}),'predefined');assert.equal(c.dns.rules[0].rcode,'NOERROR');assert(!c.dns.rules[0].answer);});
 t('AI before CN IP',()=>assert.equal(route(c,{rule_set:['geosite-ai','geoip-cn']}),'AI'));
 t('custom AI before CN',()=>assert.equal(route(c,{rule_set:['ai-extra','geosite-cn']}),'AI'));
 for(const service of ['google','youtube','github','telegram'])t(service+' before CN IP',()=>assert.equal(route(c,{rule_set:['geosite-'+service,'geoip-cn']}),'LXY'));
 t('CN suffix',()=>assert.equal(route(c,{domain:'test.cn'}),'direct'));
 t('suffix boundary',()=>assert.equal(route(c,{domain:'testcn'}),'LXY'));
 t('CN domain',()=>assert.equal(route(c,{rule_set:['geosite-cn']}),'direct'));
 t('CN IP',()=>assert.equal(route(c,{rule_set:['geoip-cn']}),'direct'));
 t('private IP',()=>assert.equal(route(c,{ip_is_private:true}),'direct'));
 t('foreign',()=>assert.equal(route(c,{rule_set:['geosite-foreign']}),'LXY'));
 t('unknown route',()=>assert.equal(route(c,{}),'LXY'));
 t('unknown DNS first domestic',()=>assert.equal(dns(c,{query_type:'A'}),'dns-direct'));
 t('CN DNS',()=>assert.equal(dns(c,{domain:'test.cn',query_type:'A'}),'dns-direct'));
 t('foreign DNS',()=>assert.equal(dns(c,{query_type:'A',rule_set:['geosite-google']}),'dns-remote'));
 t('AI DNS',()=>assert.equal(dns(c,{query_type:'A',rule_set:['ai-extra']}),'dns-ai'));
 core(c,filename);
 const cases=[
  ['explicit combination type',async()=>{const r=await run(filename,{type:'组合订阅'});assert.equal(r.calls[0].type,'collection');}],
  ['single subscription rejected',async()=>assert.rejects(run(filename,{type:'subscription'}),/必须指向组合订阅/)],
  ['empty name rejected',async()=>assert.rejects(run(filename,{name:''}),/填写不同/)],
  ['IPv6 parameter rejected',async()=>assert.rejects(run(filename,{ipv6:true}),/未知参数/)],
  ['empty VPS fails',async()=>assert.rejects(run(filename,{},combined,{outbounds:[]}),/没有可识别/)],
  ['VPS excluded from combo fails',async()=>assert.rejects(run(filename,{}, {outbounds:[node('LXY HK',1)]}),/没有可识别/)],
  ['empty airport fails',async()=>assert.rejects(run(filename,{}, {outbounds:[node('private Tokyo',6)]}),/没有可用机场/)],
  ['source config mismatch fails',async()=>assert.rejects(run(filename,{},combined,{outbounds:[node('private Tokyo',6,{password:'changed'})]}),/没有可识别/)],
  ['IPv6 servers removed and bind stripped',async()=>{const data={outbounds:[node('LXY HK',1,{inet6_bind_address:'::'}),node('v6 private',9,{server:'2001:db8::1'}),node('private Tokyo',6)]};const {c:d}=await run(filename,{},data);assert(!out(d,'v6 private'));assert(!('inet6_bind_address' in out(d,'LXY HK')));}],
  ['duplicate name conflict',async()=>assert.rejects(run(filename,{}, {outbounds:[node('same',1),node('same',2),node('private Tokyo',6)]}),/重名/)],
  ['reserved and chain mapping',async()=>{const {c:d}=await run(filename,{}, {outbounds:[node('LXY',1),node('LXY 美国',2,{detour:'LXY'}),node('private Tokyo',6)]});assert.equal(out(d,'LXY 美国').detour,'节点 / LXY');core(d,filename+'-chain');}],
  ['filtered dependency fails',async()=>assert.rejects(run(filename,{}, {outbounds:[node('LXY',1,{detour:'missing'}),node('private Tokyo',6)]}),/依赖缺失/)],
  ['cycle fails',async()=>assert.rejects(run(filename,{}, {outbounds:[node('a',1,{detour:'b'}),node('b',2,{detour:'a'}),node('private Tokyo',6)]}),/环路/)],
  ['re-injection fails',async()=>assert.rejects(run(filename,{},combined,own,JSON.stringify(c)),/移除旧注入|未注入/)],
  ['legacy WG fails',async()=>assert.rejects(run(filename,{}, {outbounds:[{type:'wireguard',tag:'old'}]}),/WireGuard outbound/)],
  ['WG IPv4 cleanup',async()=>{const wg={type:'wireguard',tag:'WG',address:['10.0.0.2/32','fd00::2/128'],private_key:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',peers:[{address:'192.0.2.1',port:51820,public_key:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',allowed_ips:['0.0.0.0/0','::/0']}]};const {c:d}=await run(filename,{}, {outbounds:[node('LXY HK',1)],endpoints:[wg]}, {outbounds:[],endpoints:[wg]});assert.deepEqual(d.endpoints[0].address,['10.0.0.2/32']);assert.deepEqual(d.endpoints[0].peers[0].allowed_ips,['0.0.0.0/0']);assert.deepEqual(out(d,'VPS-自动').outbounds,['WG']);core(d,filename+'-wg');}]
 ];
 for(const [label,fn]of cases){try{await fn();checks++;}catch(e){throw new Error(filename+' / '+label+': '+e.message,{cause:e});}}
}
for(const key of ['rules','servers','final','strategy'])test('desktop modes share DNS '+key,()=>assert.deepEqual(results[0].dns[key],results[1].dns[key]));
for(const key of ['route','http_clients'])test('desktop modes share '+key,()=>assert.deepEqual(results[0][key],results[1][key]));
console.log(JSON.stringify({status:'PASS',checks,coreChecks,files},null,2));
}finally{if(temp)fs.rmSync(temp,{recursive:true,force:true});}

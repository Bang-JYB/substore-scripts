import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=['config_tun.json','config_pc.json','config_android.json'];
const ruleSources=JSON.parse(fs.readFileSync(path.join(root,'RULE_SOURCES.json'),'utf8'));
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const ruleHash=rules=>createHash('sha256').update(JSON.stringify(canonical(rules))).digest('hex');
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
// Follow user selections through selector groups; URLTest pools remain a set.
function choice(c,tag,selected={}){
 const o=out(c,tag);assert(o,'missing outbound '+tag);
 if(o.type==='selector'){
  const next=selected[tag]??o.default;assert(o.outbounds.includes(next));
  return choice(c,next,selected);
 }
 return o.type==='urltest'?o.outbounds:tag;
}
function matches(r,p){
  if(r.type==='logical'){
    const matched=r.mode==='or'?r.rules.some(x=>matches(x,p)):r.rules.every(x=>matches(x,p));
    return r.invert?!matched:matched;
  }
  if(r.invert)return !matches({...r,invert:false},p);
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
// Model evaluate as non-terminal; response membership is supplied explicitly by each scenario.
function dnsResult(c,p){
 const evaluations=[];let evaluated=false;
 for(const r of c.dns.rules){
  if(r.match_response&&!evaluated)continue;
  const packet=r.match_response?{...p,rule_set:p.response_rule_set||[]}:p;
  if(!matches(r,packet))continue;
  if(r.action==='evaluate'){evaluations.push(r.server);evaluated=true;continue;}
  return {result:r.server||r.action,evaluations};
 }
 return {result:c.dns.final,evaluations};
}
function dns(c,p){return dnsResult(c,p).result;}
try{
for(const filename of files){
 const {c,calls}=await run(filename);results.push(c);
 const t=(label,fn)=>test(filename+' / '+label,fn);
 t('combined input',()=>{assert.equal(calls[0].name,'YBsSB2');assert.equal(calls[0].type,'collection');assert.equal(calls[1].name,'VPS');assert.equal(calls[1].type,'subscription');});
 t('HK kept',()=>assert(out(c,'自动选择').outbounds.includes('LXY 香港 HK')));
 t('dedup and information filter',()=>assert.equal(c.outbounds.filter(o=>o.type==='shadowsocks').length,6));
 t('airport source pool',()=>assert.deepEqual(out(c,'自动选择').outbounds,['LXY 日本','LXY 新加坡','LXY 美国','LXY 香港 HK']));
 t('VPS source identity despite rename',()=>assert.deepEqual(out(c,'VPS-自动').outbounds,['renamed private Tokyo','private US']));
 t('no source extra nodes',()=>assert(!out(c,'not selected')));
 t('AI default',()=>assert.equal(out(c,'AI工具').default,'VPS'));
 t('VPS manual group',()=>{assert.equal(out(c,'VPS').type,'selector');assert.equal(out(c,'VPS').default,'VPS-自动');assert.deepEqual(out(c,'VPS').outbounds,['VPS-自动','renamed private Tokyo','private US']);});
 t('airport default',()=>assert.equal(out(c,'节点选择').default,'自动选择'));
 t('test interval',()=>{for(const tag of ['自动选择','VPS-自动'])assert.equal(out(c,tag).interval,filename==='config_android.json'?'1h':'30m');});
 t('group order and types',()=>assert.deepEqual(c.outbounds.filter(o=>['selector','urltest'].includes(o.type)).map(o=>[o.tag,o.type]),[['节点选择','selector'],['自动选择','urltest'],['VPS','selector'],['VPS-自动','urltest'],['AI工具','selector'],['漏网之鱼','selector'],['🎯 全球直连','selector'],['GLOBAL','selector']]));
 t('airport manual nodes and shared VPS group',()=>assert.deepEqual(out(c,'节点选择').outbounds,['自动选择','VPS','LXY 日本','LXY 新加坡','LXY 美国','LXY 香港 HK','🎯 全球直连']));
 t('AI shares manual VPS group',()=>assert.deepEqual(out(c,'AI工具').outbounds,['VPS','节点选择']));
 t('catch-all options',()=>{assert.deepEqual(out(c,'漏网之鱼').outbounds,['节点选择','自动选择','🎯 全球直连']);assert.equal(out(c,'漏网之鱼').default,'节点选择');});
 t('direct group',()=>{assert.deepEqual(out(c,'🎯 全球直连').outbounds,['direct']);assert.equal(out(c,'🎯 全球直连').default,'direct');});
 t('GLOBAL options',()=>{assert.deepEqual(out(c,'GLOBAL').outbounds,['节点选择','自动选择','AI工具','VPS','🎯 全球直连']);assert.equal(out(c,'GLOBAL').default,'节点选择');});
 t('GLOBAL routing respects selector',()=>assert.equal(route(c,{clash_mode:'Global',rule_set:['geosite-cn']}),'GLOBAL'));
 t('Direct routing respects direct group',()=>assert.equal(route(c,{clash_mode:'Direct',rule_set:['geosite-ai']}),'🎯 全球直连'));
 t('AI defaults to VPS test pool',()=>assert.deepEqual(choice(c,route(c,{rule_set:['geosite-ai']})),['renamed private Tokyo','private US']));
 t('AI respects manual VPS selection',()=>assert.equal(choice(c,route(c,{rule_set:['geosite-ai']}),{'VPS':'private US'}),'private US'));
 t('airport traffic can use manual VPS group',()=>assert.equal(choice(c,route(c,{rule_set:['geosite-google']}),{'节点选择':'VPS','VPS':'private US'}),'private US'));
 t('AI can use airport selection',()=>assert.deepEqual(choice(c,'AI工具',{'AI工具':'节点选择'}),['LXY 日本','LXY 新加坡','LXY 美国','LXY 香港 HK']));
 t('catch-all and GLOBAL manual selections',()=>{assert.equal(choice(c,route(c,{}),{'漏网之鱼':'🎯 全球直连'}),'direct');assert.equal(choice(c,route(c,{clash_mode:'Global'}),{'GLOBAL':'VPS','VPS':'private US'}),'private US');});
 t('all nonempty selector defaults valid',()=>{for(const o of c.outbounds.filter(o=>['selector','urltest'].includes(o.type))){assert(o.outbounds.length>0);if(o.type==='selector')assert(o.outbounds.includes(o.default));}});
 t('desktop and android API',()=>assert.equal(!!c.experimental.clash_api,filename!=='config_android.json'));
 t('TUN mode',()=>assert.equal(c.inbounds.some(i=>i.type==='tun'),filename!=='config_pc.json'));
 t('IPv4 TUN',()=>{for(const i of c.inbounds.filter(i=>i.type==='tun')){assert.deepEqual(i.address,['172.19.0.1/30']);assert.equal(i.stack,'mixed');assert.equal(i.strict_route,true);assert.equal(i.dns_mode,'hijack');assert(!i.interface_name);assert(!i.auto_redirect);}});
 t('non TUN system proxy',()=>{if(filename==='config_pc.json'){assert.equal(c.inbounds[0].listen,'127.0.0.1');assert.equal(c.inbounds[0].listen_port,7890);assert.equal(c.inbounds[0].set_system_proxy,true);}});
 t('IPv4 resolution',()=>{assert.equal(c.dns.strategy,'ipv4_only');assert(c.outbounds.filter(o=>o.server).every(o=>o.domain_resolver.strategy==='ipv4_only'));});
 t('inline rule startup has no download dependency',()=>{assert.equal(c.route.rule_set.length,22);assert(c.route.rule_set.every(r=>r.type==='inline'&&r.rules.length));assert(c.route.rule_set.every(r=>!r.url&&!r.path&&!r.http_client&&!r.update_interval));});
 t('original rule data preserved by digest',()=>{assert.equal(ruleSources.rule_sets.length,21);for(const source of ruleSources.rule_sets){const r=c.route.rule_set.find(r=>r.tag===source.tag);assert(r);assert.equal(r.rules.length,source.rule_count);assert.equal(ruleHash(r.rules),source.inline_rules_sha256);}});
 t('DNS and routing rule references resolve',()=>{const tags=new Set(c.route.rule_set.map(r=>r.tag));assert.equal(tags.size,c.route.rule_set.length);function walk(v){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(k==='rule_set')array(x).forEach(tag=>assert(tags.has(tag)));walk(x);}}walk(c.dns.rules);walk(c.route.rules);});
 t('direct HTTP client retained',()=>{assert.equal(c.http_clients[0].detour,'direct');assert.equal(c.route.default_http_client,'hc-direct');});
 t('UDP443 modes',()=>{for(const clash_mode of ['Rule','Direct','Global'])assert.equal(route(c,{network:'udp',port:443,ip_version:4,clash_mode}),'reject');});
 t('TCP443 preserved',()=>assert.equal(route(c,{network:'tcp',port:443,ip_version:4}),'漏网之鱼'));
 t('STUN preserved',()=>assert.equal(route(c,{network:'udp',port:3478,protocol:'stun',ip_version:4}),'漏网之鱼'));
 t('IPv6 rejected',()=>assert.equal(route(c,{ip_version:6,network:'tcp',port:443}),'reject'));
 t('empty AAAA',()=>{assert.equal(dns(c,{query_type:'AAAA'}),'predefined');assert.equal(c.dns.rules[0].rcode,'NOERROR');assert(!c.dns.rules[0].answer);});
 t('AI before CN IP',()=>assert.equal(route(c,{rule_set:['geosite-ai','geoip-cn']}),'AI工具'));
 t('custom AI before CN',()=>assert.equal(route(c,{rule_set:['ai-extra','geosite-cn']}),'AI工具'));
 for(const service of ['google','youtube','github','telegram'])t(service+' before CN IP',()=>assert.equal(route(c,{rule_set:['geosite-'+service,'geoip-cn']}),'节点选择'));
 t('CN suffix',()=>assert.equal(route(c,{domain:'test.cn'}),'🎯 全球直连'));
 t('suffix boundary',()=>assert.equal(route(c,{domain:'testcn'}),'漏网之鱼'));
 t('CN domain',()=>assert.equal(route(c,{rule_set:['geosite-cn']}),'🎯 全球直连'));
 t('CN IP',()=>assert.equal(route(c,{rule_set:['geoip-cn']}),'🎯 全球直连'));
 t('private IP',()=>assert.equal(route(c,{ip_is_private:true}),'direct'));
 t('foreign',()=>assert.equal(route(c,{rule_set:['geosite-foreign']}),'节点选择'));
 t('unknown route',()=>assert.equal(route(c,{}),'漏网之鱼'));
 t('author DNS servers',()=>{assert.deepEqual(c.dns.servers.map(s=>s.tag),['local','ali','tx','google','fakeip','hosts']);assert.equal(c.dns.servers.find(s=>s.tag==='ali').server,'223.5.5.5');assert.equal(c.dns.servers.find(s=>s.tag==='google').server,'8.8.8.8');assert.equal(c.dns.servers.find(s=>s.tag==='google').detour,'节点选择');assert.equal(c.dns.servers.find(s=>s.tag==='tx').domain_resolver,'hosts');});
 t('IPv4 FakeIP only',()=>{const s=c.dns.servers.find(s=>s.tag==='fakeip');assert.equal(s.inet4_range,'198.19.0.0/16');assert(!s.inet6_range);});
 t('author cache',()=>{assert.equal(c.dns.cache_capacity,8192);assert.equal(c.dns.optimistic.enabled,true);assert.equal(c.dns.reverse_mapping,true);assert.equal(c.experimental.cache_file.store_fakeip,true);});
 t('bootstrap avoids FakeIP',()=>{assert.equal(c.route.default_domain_resolver.server,'ali');assert.equal(c.http_clients[0].domain_resolver.server,'ali');assert(c.outbounds.filter(o=>o.server).every(o=>o.domain_resolver.server==='ali'));});
 t('author DNS rule-set references',()=>{const tags=new Set(c.route.rule_set.map(r=>r.tag));function walk(v){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(k==='rule_set')array(x).forEach(t=>assert(tags.has(t)));walk(x);}}walk(c.dns);});
 t('CN DNS',()=>assert.equal(dns(c,{query_type:'A',rule_set:['dns-geosite-cn']}),'ali'));
 t('private DNS',()=>assert.equal(dns(c,{query_type:'A',rule_set:['dns-geosite-private']}),'ali'));
 t('domestic FakeIP exclusion',()=>assert.equal(dns(c,{query_type:'A',rule_set:['dns-fakeipfilter-cn']}),'ali'));
 t('foreign FakeIP exclusion',()=>assert.equal(dns(c,{query_type:'A',rule_set:['dns-fakeipfilter-!cn']}),'google'));
 t('unknown CN response evaluated then Ali',()=>assert.deepEqual(dnsResult(c,{query_type:'A',response_rule_set:['dns-geoip-cn']}),{result:'ali',evaluations:['google']}));
 t('unknown foreign response evaluated then FakeIP',()=>assert.deepEqual(dnsResult(c,{query_type:'A'}),{result:'fakeip',evaluations:['google']}));
 t('known foreign FakeIP without evaluation',()=>assert.deepEqual(dnsResult(c,{query_type:'A',rule_set:['dns-geosite-geolocation-!cn']}),{result:'fakeip',evaluations:[]}));
 t('author TXT default',()=>assert.equal(dns(c,{query_type:'TXT'}),'google'));
 t('HTTPS and SVCB rejected in all modes',()=>{for(const query_type of ['HTTPS','SVCB'])for(const clash_mode of ['Rule','Direct','Global'])assert.equal(dns(c,{query_type,clash_mode}),'reject');});
 t('Direct DNS',()=>assert.equal(dns(c,{query_type:'A',clash_mode:'Direct'}),'ali'));
 t('Global DNS',()=>assert.equal(dns(c,{query_type:'A',clash_mode:'Global'}),'fakeip'));
 t('author AI DNS alongside VPS traffic',()=>{assert.equal(dns(c,{query_type:'A',rule_set:['ai-extra','dns-geosite-geolocation-!cn']}),'fakeip');assert.equal(route(c,{rule_set:['ai-extra']}),'AI工具');});
 t('FakeIP TTL',()=>assert.equal(c.dns.rules.find(r=>r.server==='fakeip'&&r.rewrite_ttl).rewrite_ttl,1));
 t('author evaluation ECS and timeout',()=>{const r=c.dns.rules.find(r=>r.action==='evaluate');assert.equal(r.client_subnet,'223.5.5.0/24');assert.equal(r.timeout,'2s');assert.equal(r.server,'google');});
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
  ['reserved and chain mapping',async()=>{const reserved=['节点选择','自动选择','VPS','VPS-自动','AI工具','漏网之鱼','🎯 全球直连','GLOBAL','direct'];const data={outbounds:[...reserved.map((tag,i)=>node(tag,i+20)),node('LXY 美国',2,{detour:'节点选择'}),node('private Tokyo',6)]};const {c:d}=await run(filename,{},data);for(const tag of reserved)assert(out(d,'节点 / '+tag));assert.equal(out(d,'LXY 美国').detour,'节点 / 节点选择');core(d,filename+'-chain');}],
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

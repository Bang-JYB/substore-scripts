// Small, dependency-free checks for approved rule edits on 7a72e9f; no network tests.
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
const jsDesignRule=r=>list(r.domain_suffix).includes('js.design');
const list=x=>x==null?[]:Array.isArray(x)?x:[x];
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const original=f=>execFileSync('git',['show','7a72e9f:'+f],{cwd:root});
// Exact IPv4-only delta allowed on VPS templates; all unrelated fields stay pinned.
function vpsIPv4(c){
 c.dns.strategy='ipv4_only';
 c.outbounds.find(o=>o.type==='direct').domain_resolver.strategy='ipv4_only';
 c.route.default_domain_resolver.strategy='ipv4_only';
 for(const client of c.http_clients)client.domain_resolver.strategy='ipv4_only';
 for(const inbound of c.inbounds.filter(o=>o.type==='tun'))inbound.address=inbound.address.filter(a=>!a.includes(':'));
 c.dns.rules.unshift({query_type:'AAAA',action:'predefined',rcode:'NOERROR'});
 c.route.rules.splice(1,0,{ip_version:6,action:'reject'});
 return c;
}
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
 const c=read(file),solo=file.startsWith('config_vps_');
 const before=solo?vpsIPv4(JSON.parse(original(file))):JSON.parse(original(file));
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
  assert.equal(c.dns.rules.length,before.dns.rules.length);
  assert.equal(c.route.rules.length,before.route.rules.length+(solo?2:0));
  const oldDNS=structuredClone(before.dns);
  oldDNS.rules=oldDNS.rules.filter(r=>!list(r.domain_suffix).some(x=>qq.includes(x)));
  oldDNS.rules.splice(oldDNS.rules.findIndex(r=>r.clash_mode==='Global')+1,0,
   {domain_suffix:['js.design'],server:solo?'vps-dns':'ali'});
  assert.deepEqual(c.dns,oldDNS,'DNS must equal 7a72e9f minus QQ plus the JS Design rule');
  const scrub=config=>{
   const copy=structuredClone(config);
   for(const area of ['dns','route'])copy[area].rules=copy[area].rules.filter(r=>
    !jsDesignRule(r)&&!(solo&&area==='route'&&r.network==='udp'&&r.port===443&&r.action==='reject')&&
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
 test('JS Design and all subdomains use direct DNS/routing without changing modes: '+file,()=>{
  const dnsRule={domain_suffix:['js.design'],server:solo?'vps-dns':'ali'};
  const routeRule={domain_suffix:['js.design'],outbound:'direct'};
  assert.deepEqual(c.dns.rules.filter(jsDesignRule),[dnsRule]);
  assert.deepEqual(c.route.rules.filter(jsDesignRule),[routeRule]);
  for(const area of ['dns','route'])assert.equal(c[area].rules.findIndex(jsDesignRule),c[area].rules.findIndex(r=>r.clash_mode==='Global')+1);
  for(const host of ['js.design','www.js.design','api.js.design','img.js.design','data.js.design','ds.js.design','download.js.design','new-service.js.design']){
   // Deliberately omit the domestic set and include conflicting proxy sets.
   for(const sets of [[],['geosite-foreign','geosite-ai','geosite-github']]){
    assert.equal(dns(c,host,{sets} ),solo?'vps-dns':'ali');
    for(const port of [443,8443])for(const network of ['tcp','udp'])assert.equal(route(c,host,{sets,port,network}),'direct');
   }
   for(const query_type of ['A',...(solo?['HTTPS','SVCB']:[])])assert.equal(dns(c,host,{query_type}),solo?'vps-dns':'ali');
   assert.equal(c.dns.rules.find(r=>match(r,{domain:host,query_type:'AAAA'})).action,'predefined');
   if(!solo){
    assert.equal(c.dns.rules.find(r=>match(r,{domain:host,query_type:'AAAA'})).action,'predefined');
    for(const query_type of ['HTTPS','SVCB'])assert.equal(c.dns.rules.find(r=>match(r,{domain:host,query_type})).action,'reject');
   }
   assert.equal(route(c,host,{ip_version:6}),'reject');
   assert.equal(route(c,host,{clash_mode:'Direct'}),solo?'direct':'🎯 全球直连');
   assert.equal(route(c,host,{clash_mode:'Global'}),solo?'VPS选择':'GLOBAL');
   assert.equal(dns(c,host,{clash_mode:'Global'}),solo?'proxy-dns':'fakeip');
  }
  for(const host of ['notjs.design','js.design.example.com','github.com','storage.googleapis.com','example.oss-cn-hangzhou.aliyuncs.com']){
   assert.equal(match(routeRule,{domain:host}),false,'unrelated/shared host must not match');
  }
 });
 test('AAAA is empty and IPv6 cannot bypass via LAN, ports or Direct/Global: '+file,()=>{
  for(const clash_mode of ['Rule','Direct','Global'])for(const domain of ['js.design','github.com','nas.lan','2001:db8::1']){
   const answer=c.dns.rules.find(r=>match(r,{domain,query_type:'AAAA',clash_mode}));
   assert.deepEqual(answer,{query_type:'AAAA',action:'predefined',rcode:'NOERROR'});
   for(const network of ['tcp','udp'])for(const port of [53,443,8443])for(const privateIP of [false,true]){
    assert.equal(route(c,domain,{ip_version:6,network,port,clash_mode,private:privateIP}),'reject');
   }
  }
  assert.equal(c.dns.strategy,'ipv4_only');
  assert.equal(c.route.default_domain_resolver.strategy,'ipv4_only');
  assert.equal(c.outbounds.find(o=>o.type==='direct').domain_resolver.strategy,'ipv4_only');
 });
 if(solo)test('VPS IPv4 UDP443 protection, direct and other UDP preserved: '+file,()=>{
  assert.deepEqual(c.route.rules.filter(r=>r.network==='udp'&&r.port===443&&r.action==='reject'),[
   {network:'udp',port:443,rule_set:'geosite-github',action:'reject'},
   {network:'udp',port:443,action:'reject'}
  ]);
  assert.equal(c.route.rules.findIndex(r=>r.rule_set==='geosite-github'&&r.action==='reject')+1,
   c.route.rules.findIndex(r=>r.rule_set==='geosite-github'&&r.outbound==='VPS选择'));
  assert.deepEqual(c.route.rules.at(-1),{network:'udp',port:443,action:'reject'});
  assert.equal(route(c,'github.com',{network:'udp'}),'reject');
  for(const host of ['github.com','api.github.com','foreign.example','ai.example','unknown.example'])for(const ip_version of [4]){
   assert.equal(route(c,host,{network:'udp',ip_version}),'reject');
   assert.equal(route(c,host,{network:'tcp',ip_version}),'VPS选择');
   assert.equal(route(c,host,{network:'udp',port:8443,ip_version}),'VPS选择');
   for(const clash_mode of ['Direct','Global'])assert.equal(route(c,host,{network:'udp',ip_version,clash_mode}),clash_mode==='Direct'?'direct':'VPS选择');
  }
  for(const host of ['baidu.com','office.com','nas.lan','cn-ip.example']){
   assert.equal(route(c,host,{network:'udp',...(host==='cn-ip.example'?{sets:['geoip-cn']}: {})}),'direct');
  }
  assert.equal(route(c,'8.8.8.8',{network:'udp',port:443}),'reject');
  assert.equal(route(c,'dns.example',{network:'udp',port:53,protocol:'dns'}),'hijack-dns');
  assert.equal(route(c,undefined,{network:'udp',private:true}),'direct');
  assert.equal(c.dns.strategy,'ipv4_only');
  assert.equal(route(c,'foreign.example',{network:'udp',port:8443,ip_version:6}),'reject');
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
const cdn={type:'vless',tag:'fixture-CDN',server:'cdn.example.com',server_port:443,
 uuid:'11111111-1111-4111-8111-111111111111',tls:{enabled:true,server_name:'cdn.example.com'},
 transport:{type:'ws',path:'/fixture-only',headers:{Host:'cdn.example.com'}}};
const vps=[{type:'hysteria2',tag:'fixture-HY2',server:'192.0.2.10',server_port:443,password:'fixture-only',tls},
 {type:'tuic',tag:'fixture-TUIC',server:'192.0.2.11',server_port:443,uuid:'11111111-1111-4111-8111-111111111111',password:'fixture-only',tls},node('fixture-IPv6','2001:db8::1'),cdn];
const combined=[...airport,...vps,node('英国 UK','192.0.2.20'),node('台湾','192.0.2.21'),node('剩余流量 10GB','192.0.2.22')];
async function generate(file,{source=vps,args={},logs=[],script,template}={}){
 const solo=file.startsWith('config_vps_');
 const ctx={$content:JSON.stringify(template??read(file)),$arguments:args,TextEncoder,console:{log:s=>logs.push(s)},produceArtifact:async({type})=>structuredClone({outbounds:type==='collection'?combined:source})};
 script??=fs.readFileSync(path.join(root,solo?'inject-vps-standalone.js':'inject-nodes.js'),'utf8');
 await vm.runInNewContext('(async()=>{'+script+'})()',ctx,{timeout:5000});
 return JSON.parse(ctx.$content);
}
test('unchanged combined injector preserves groups; both injectors preserve pools and protocol fields',async()=>{
 assert.deepEqual(fs.readFileSync(path.join(root,'inject-nodes.js')),original('inject-nodes.js'));
 for(const file of files){
  const c=await generate(file),solo=file.startsWith('config_vps_');
  if(!solo){
   assert.deepEqual(c.outbounds.filter(o=>['selector','urltest'].includes(o.type)).map(o=>o.tag),groups);
   assert.deepEqual(c.outbounds.find(o=>o.tag==='自动选择').outbounds,airport.map(o=>o.tag));
   assert.deepEqual(c.outbounds.find(o=>o.tag==='VPS-自动').outbounds,vps.filter(o=>!o.server.includes(':')).map(o=>o.tag));
   assert.equal(c.outbounds.find(o=>o.tag==='AI工具').default,'VPS');
  }else assert.ok(!c.outbounds.some(o=>o.server?.includes(':')));
  for(const raw of vps.filter(o=>!o.server.includes(':'))){
   const actual=structuredClone(c.outbounds.find(o=>o.tag===raw.tag));delete actual.domain_resolver;
   assert.deepEqual(actual,raw);
  }
  assert.deepEqual(c.inbounds,read(file).inbounds);
 }
});
const nodeIPv4Base='f22a5528c05f7f1e628f03c89704a5a10ebf9aa6';
test('all generated TUN addresses are IPv4-only and use modern address fields',async()=>{
 for(const file of files){
  const c=await generate(file);
  for(const inbound of c.inbounds){
   assert.equal('inet4_address' in inbound,false);
   assert.equal('inet6_address' in inbound,false);
   if(inbound.type==='tun')assert.deepEqual(inbound.address,['172.19.0.1/30']);
  }
  for(const outbound of c.outbounds.filter(o=>o.server)){
   assert.equal(outbound.domain_resolver.strategy,'ipv4_only');
   assert.equal('domain_strategy' in outbound,false);
  }
 }
});
test('combined JSON is unchanged; VPS JSON differs only by the exact IPv4-only delta',()=>{
 for(const file of files){
  const before=execFileSync('git',['show',nodeIPv4Base+':'+file],{cwd:root});
  if(file.startsWith('config_vps_'))assert.deepEqual(read(file),vpsIPv4(JSON.parse(before)));
  else assert.deepEqual(fs.readFileSync(path.join(root,file)),before);
 }
});
test('IPv4-only is fixed despite obsolete strategy arguments; CDN and unrelated settings stay intact',async()=>{
 const oldScript=execFileSync('git',['show',nodeIPv4Base+':inject-vps-standalone.js'],{cwd:root,encoding:'utf8'});
 for(const file of files.filter(f=>f.startsWith('config_vps_')))for(const strategy of [undefined,'prefer_ipv4','prefer_ipv6','ipv4_only']){
  const options={source:[cdn,node('IPv4','192.0.2.50'),{...node('AAAA-only','aaaa-only.example'),domain_resolver:{server:'old',strategy:'ipv6_only'},domain_strategy:'ipv6_only'}],args:{strategy}};
  const oldTemplate=JSON.parse(execFileSync('git',['show',nodeIPv4Base+':'+file],{cwd:root}));
  const c=await generate(file,options),before=vpsIPv4(await generate(file,{...options,args:{},script:oldScript,template:oldTemplate}));
  for(const outbound of before.outbounds.filter(o=>o.server))outbound.domain_resolver.strategy='ipv4_only';
  assert.deepEqual(c,before,'unrelated generated setting or protocol field changed');
  assert.equal(c.dns.strategy,'ipv4_only');
  assert.equal(c.outbounds.find(o=>o.type==='direct').domain_resolver.strategy,'ipv4_only');
  assert.equal(c.route.default_domain_resolver.strategy,'ipv4_only');
 }
});
test('IPv6 literals never enter selectors; filtering is reported and all-IPv6 input fails',async()=>{
 const literals=['2001:db8::1','[::1]','fe80::1%eth0','::ffff:192.0.2.1'];
 const source=literals.map((s,i)=>node('IPv6-'+i,s)),logs=[];
 const c=await generate('config_vps_standalone.json',{source:[cdn,...source],logs,args:{strategy:'prefer_ipv6'}});
 assert.deepEqual(c.outbounds.filter(o=>o.server).map(o=>o.tag),[cdn.tag]);
 assert.deepEqual(c.outbounds.find(o=>o.tag==='VPS自动').outbounds,[cdn.tag]);
 assert.deepEqual(c.outbounds.find(o=>o.tag==='VPS选择').outbounds,['VPS自动',cdn.tag]);
 assert.match(logs.join('\n'),/IPv6.*4/);
 await assert.rejects(generate('config_vps_android.json',{source}),/IPv4-only.*IPv6/);
});
test('every detour hop has IPv4-only server resolution; filtered or cyclic dependencies fail closed',async()=>{
 const exit=node('exit','exit.example'),hop={...node('hop','192.0.2.20'),detour:'exit'},leaf={...cdn,detour:'hop'};
 const c=await generate('config_vps_standalone.json',{source:[exit,hop,leaf]});
 for(const o of c.outbounds.filter(o=>o.server))assert.deepEqual(o.domain_resolver,{server:'vps-dns',strategy:'ipv4_only'});
 assert.equal(c.outbounds.find(o=>o.tag===leaf.tag).detour,'hop');
 assert.equal(c.outbounds.find(o=>o.tag==='hop').detour,'exit');
 const direct=await generate('config_vps_notun.json',{source:[{...cdn,detour:'direct'}]});
 assert.equal(direct.outbounds.find(o=>o.tag===cdn.tag).domain_resolver.strategy,'ipv4_only');
 await assert.rejects(generate('config_vps_standalone.json',{source:[{...exit,server:'2001:db8::1'},hop,leaf]}),/链式拨号依赖/);
 const shadowtls={type:'shadowtls',tag:'shadowtls',server:'2001:db8::2',server_port:443,version:3,password:'fixture-only',tls};
 await assert.rejects(generate('config_vps_standalone.json',{source:[shadowtls,{...node('wrapped','192.0.2.21'),detour:'shadowtls'}]}),/链式拨号依赖/);
 await assert.rejects(generate('config_vps_standalone.json',{source:[{...exit,detour:cdn.tag},hop,leaf]}),/循环/);
});
const core=process.argv[process.argv.indexOf('--core')+1];
test('official 1.14.2/1.14.3/1.14.4 core checks all six fully injected configurations',{skip:!process.argv.includes('--core')},async()=>{
 assert.match(execFileSync(core,['version'],{encoding:'utf8'}).split(/\r?\n/)[0],/^sing-box version 1\.14\.[234]$/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'minimal-rules-'));
 try{for(const file of files){const p=path.join(dir,file);fs.writeFileSync(p,JSON.stringify(await generate(file)));execFileSync(core,['check','-c',p],{stdio:'pipe'});console.log('CORE_OK '+file);}}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
